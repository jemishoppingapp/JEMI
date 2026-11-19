import { z } from 'zod';
import { limitByIp } from '@/lib/rate-limit';
import { requireAuth } from '@/lib/session';
import { verifyOtp } from '@/lib/verification';
import { ok, fail, withErrorHandling } from '@/lib/api';
export const dynamic = 'force-dynamic'; export const runtime = 'nodejs';
export async function POST(req: Request) {
  return withErrorHandling(async () => {
    // SECURITY (V9): per-IP rate limit (15 per 15 min)
    const limited = await limitByIp(req, 'verify-email', 15, 900);
    if (limited) return limited;
    let user; try { user = await requireAuth(); } catch { return fail('UNAUTHORIZED', 'Please sign in.'); }
    let code = '';
    try { const b = await req.json(); code = z.object({ code: z.string().trim().length(6) }).parse(b).code; }
    catch { return fail('VALIDATION_ERROR', 'Enter the 6-digit code.'); }
    const r = await verifyOtp(user.id, code);
    if (!r.ok) return fail('VALIDATION_ERROR', r.error);
    return ok({ verified: true });
  });
}