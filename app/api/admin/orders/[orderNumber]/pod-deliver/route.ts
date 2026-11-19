import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { requireAdmin } from '@/lib/session';
import { logAdminAction } from '@/lib/audit';
import { markPodCollectedAndDelivered } from '@/lib/pod-server';
import { ok, fail, failValidation, withErrorHandling } from '@/lib/api';
import { notifyOps } from '@/lib/notify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const inputSchema = z.object({
  amount: z.number().min(0, 'Amount must be zero or more.'),
  method: z.enum(['cash', 'transfer'], {
    errorMap: () => ({ message: 'Choose cash or transfer.' }),
  }),
  // The code the BUYER shows at the gate. Must match the order, so money
  // is never collected from (or goods handed to) the wrong person.
  pickupCode: z.string().trim().min(4, 'Enter the pickup code the buyer shows you.').max(12),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  return withErrorHandling(async () => {
    let admin;
    try {
      admin = await requireAdmin();
    } catch {
      return fail('FORBIDDEN', 'Admin access required.');
    }

    const { orderNumber } = await params;

    let parsed: z.infer<typeof inputSchema>;
    try {
      const body = await req.json();
      parsed = inputSchema.parse(body);
    } catch (err) {
      if (err instanceof z.ZodError) return failValidation(err);
      return fail('VALIDATION_ERROR', 'Invalid request body.');
    }

    const rows = await db().select({ id: schema.orders.id, subOrders: schema.orders.subOrders, total: schema.orders.total })
      .from(schema.orders)
      .where(eq(schema.orders.orderNumber, orderNumber))
      .limit(1);
    const order = rows[0];
    if (!order) return fail('NOT_FOUND', 'Order not found.');

    const codes = (order.subOrders ?? []).map((so) => String(so.pickupCode || '').toUpperCase()).filter(Boolean);
    if (!codes.includes(parsed.pickupCode.toUpperCase().replace(/\s+/g, ''))) {
      return fail('VALIDATION_ERROR', "That pickup code doesn't match this order. Check the buyer's code again.", 'pickupCode');
    }

    const result = await markPodCollectedAndDelivered(
      order.id,
      { amount: parsed.amount, method: parsed.method },
      admin.id,
    );
    if (!result.ok) {
      return fail('VALIDATION_ERROR', result.error ?? 'Could not complete delivery.');
    }

    try {
      await notifyOps({
        subject: 'Delivered: ' + orderNumber + ' (NGN ' + new Intl.NumberFormat('en-NG').format(parsed.amount) + ' ' + parsed.method + ')',
        text: 'ORDER DELIVERED\n' + orderNumber + '\nCollected: NGN ' + new Intl.NumberFormat('en-NG').format(parsed.amount) + ' (' + parsed.method + ')',
      });
    } catch (e) { console.error('[notify]', e); }

    const short = Number(order.total) - parsed.amount;
    await logAdminAction(admin, 'order.collect', { type: 'order', id: orderNumber },
      `Collected NGN ${parsed.amount} (${parsed.method}) for ${orderNumber}${short > 0 ? `, SHORT by NGN ${short}` : ''}`,
      { amount: parsed.amount, method: parsed.method, orderTotal: Number(order.total) });
    return ok({ delivered: true, sellersCredited: result.sellersCredited ?? 0 });
  });
}