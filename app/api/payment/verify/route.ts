import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireAuth } from '@/lib/session';
import { markOrderPaid } from '@/lib/checkout';
import { verifyTransaction } from '@/lib/paystack';
import { ok, fail, failValidation, withErrorHandling } from '@/lib/api';
import { createHoldEntriesForOrder } from '@/lib/escrow-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const inputSchema = z.object({
  reference: z.string().min(1, 'Missing payment reference.').max(200),
});

export async function POST(req: Request) {
  return withErrorHandling(async () => {
    let user;
    try {
      user = await requireAuth();
    } catch {
      return fail('UNAUTHORIZED', 'Please sign in to continue.');
    }

    let parsed: z.infer<typeof inputSchema>;
    try {
      const body = await req.json();
      parsed = inputSchema.parse(body);
    } catch (err) {
      if (err instanceof z.ZodError) return failValidation(err);
      return fail('VALIDATION_ERROR', 'Invalid payment reference.');
    }

    // SECURITY (V3): only the buyer who owns the order may verify it
    // (the response carries the pickup code).
    const owner = await db()
      .select({ userId: schema.orders.userId })
      .from(schema.orders)
      .where(eq(schema.orders.paystackReference, parsed.reference))
      .limit(1);
    if (!owner[0] || owner[0].userId !== user.id) {
      return fail('ORDER_NOT_FOUND', "We couldn't find that order on your account.");
    }

    // Step 1: verify with Paystack
    let verification;
    try {
      verification = await verifyTransaction(parsed.reference);
    } catch (paystackErr) {
      // eslint-disable-next-line no-console
      console.error('[payment/verify] paystack verify failed:', paystackErr);
      return fail(
        'PAYMENT_VERIFY_FAILED',
        "We couldn't confirm with the payment provider. If you were charged, the order will be confirmed automatically — please check 'My orders' in a few minutes."
      );
    }

    if (verification.status !== 'success') {
      // Paystack itself responded — payment failed or pending on their end
      return fail(
        'PAYMENT_NOT_SUCCESSFUL',
        verification.status === 'failed'
          ? 'Payment was not successful. Please try again or use a different card.'
          : 'Payment is still being processed. Refresh in a moment to check status.'
      );
    }

    // Step 2: mark our order paid (idempotent)
    const { order, amountMismatch } = await markOrderPaid(parsed.reference, {
      amountKobo: Number(verification.amount),
      currency: String(verification.currency || ''),
    });
    if (amountMismatch) {
      return fail('PAYMENT_NOT_SUCCESSFUL', 'The amount paid does not match your order. Our team has been alerted and will contact you.');
    }
    if (!order) {
      return fail('ORDER_NOT_FOUND', "We received your payment but couldn't find the matching order. Contact support with this reference.");
    }

    // INSTALL-15: create escrow hold entries for sellers in this order

    try { await createHoldEntriesForOrder(order.id); } catch (e) { console.error('[escrow-hold]', e); }

    

    return ok({
      status: 'paid' as const,
      orderNumber: order.orderNumber,
      pickupCode: order.pickupCode,
      pickupLocation: order.pickupLocation,
      total: order.total,
    });
  });
}