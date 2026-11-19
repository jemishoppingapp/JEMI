import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { dbPool } from '@/db/pool';
import { schema } from '@/db';
import { requireAdmin } from '@/lib/session';
import { restockOrderItems } from '@/lib/checkout';
import { logAdminAction } from '@/lib/audit';
import { sendEmail, escapeHtml } from '@/lib/email';
import { revalidateProductPages } from '@/lib/revalidate';
import { ok, fail, failValidation, withErrorHandling } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['ready_for_pickup', 'cancelled'],
  // A buyer who never turns up can be cancelled (stock goes back).
  ready_for_pickup: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const inputSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'processing', 'ready_for_pickup', 'completed', 'cancelled']),
  note: z.string().trim().max(500).optional(),
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

    return await dbPool().transaction(async (tx) => {
      const lockedRows = await tx.execute(
        sql`SELECT o.id, o.status, o.payment_status, o.payment_method, o.sub_orders, o.timeline,
                   u.email AS buyer_email, u.name AS buyer_name
            FROM orders o LEFT JOIN users u ON u.id = o.user_id
            WHERE o.order_number = ${orderNumber}
            FOR UPDATE OF o`
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = lockedRows.rows[0] as any;

      if (!row) {
        return fail('ORDER_NOT_FOUND', 'That order does not exist.');
      }

      const currentStatus = row.status as string;
      const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(parsed.status)) {
        return fail(
          'VALIDATION_ERROR',
          `Cannot move order from "${currentStatus}" to "${parsed.status}".`
        );
      }

      // A pay-on-delivery order is completed by "Collect payment" (which
      // records the money and pays the sellers), never by a bare status
      // change: that used to close orders with no money recorded.
      if (parsed.status === 'completed' && row.payment_method === 'pod' && row.payment_status !== 'collected') {
        return fail('VALIDATION_ERROR', 'Use "Collect payment" to complete a pay-on-delivery order.');
      }

      const timelineEntry = {
        status: parsed.status,
        timestamp: new Date().toISOString(),
        note: parsed.note || `Updated by ${admin.name} (${admin.email})`,
        updatedBy: admin.email,
      };

      await tx.execute(
        sql`UPDATE orders
            SET status = ${parsed.status},
                timeline = timeline || ${JSON.stringify([timelineEntry])}::jsonb,
                updated_at = now()
            WHERE id = ${row.id}`
      );

      // A cancelled pay-on-delivery order that was never collected gives
      // its reserved stock back (stock is taken at POD checkout).
      if (
        parsed.status === 'cancelled' &&
        row.payment_method === 'pod' &&
        row.payment_status === 'pay_on_delivery'
      ) {
        await restockOrderItems(tx, row.sub_orders ?? []);
        revalidateProductPages(); // stock is back on sale
      }

      await logAdminAction(admin, 'order.status', { type: 'order', id: orderNumber },
        `${orderNumber}: ${currentStatus} → ${parsed.status}${parsed.note ? ` (${parsed.note})` : ''}`);

      // Tell the buyer when their order is cancelled. Never blocks.
      if (parsed.status === 'cancelled' && row.buyer_email) {
        await sendEmail({
          to: row.buyer_email,
          subject: `Your JEMI order ${orderNumber} was cancelled`,
          text: `Hi ${row.buyer_name || 'there'},\n\nYour order ${orderNumber} has been cancelled.${parsed.note ? `\nReason: ${parsed.note}` : ''}\nYou have not been charged. Questions? Reply to this email.\n\nJEMI`,
          html: `<p>Hi ${escapeHtml(row.buyer_name || 'there')},</p><p>Your order <strong>${escapeHtml(orderNumber)}</strong> has been cancelled.${parsed.note ? `<br/>Reason: ${escapeHtml(parsed.note)}` : ''}</p><p>You have not been charged. Questions? Reply to this email.</p><p>JEMI</p>`,
        }).catch((e: unknown) => console.error('[cancel email]', e));
      }

      return ok({ orderNumber, status: parsed.status });
    });
  });
}