import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/session';
import { logAdminAction } from '@/lib/audit';
import { createPayout } from '@/lib/payouts-server';
import { ok, fail, failValidation, withErrorHandling } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const inputSchema = z.object({
  sellerId: z.string().uuid(),
  method: z.enum(['manual', 'paystack']),
  transferRef: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  return withErrorHandling(async () => {
    let admin;
    try {
      admin = await requireSuperAdmin(); // money/seller decisions: super admins only
    } catch {
      return fail('FORBIDDEN', 'Only a super admin can do that.');
    }

    let parsed: z.infer<typeof inputSchema>;
    try {
      const body = await req.json();
      parsed = inputSchema.parse(body);
    } catch (err) {
      if (err instanceof z.ZodError) return failValidation(err);
      return fail('VALIDATION_ERROR', 'Invalid request body.');
    }

    // For manual payouts, a reference is recommended but not required.
    const result = await createPayout(parsed.sellerId, parsed.method, {
      transferRef: parsed.transferRef,
      note: parsed.note,
      createdBy: admin.id,
    });

    if (!result.ok) {
      return fail('VALIDATION_ERROR', result.error ?? 'Payout failed.');
    }

    await logAdminAction(admin, 'payout.create', { type: 'seller', id: parsed.sellerId },
      `Recorded ${parsed.method} payout${parsed.transferRef ? ` (ref ${parsed.transferRef})` : ''}`,
      { payoutId: result.payoutId, method: parsed.method, transferRef: parsed.transferRef ?? null });
    return ok({ payoutId: result.payoutId });
  });
}