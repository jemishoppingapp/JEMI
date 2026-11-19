import { sql } from 'drizzle-orm';
import { limitByIp } from '@/lib/rate-limit';
import { db } from '@/db';
import { requireAuth } from '@/lib/session';
import { issueAndSendOtp } from '@/lib/verification';
import { ok, fail, withErrorHandling } from '@/lib/api';
export const dynamic = 'force-dynamic'; export const runtime = 'nodejs';
export async function POST(req: Request) {
  return withErrorHandling(async () => {
    // SECURITY (V9): per-IP rate limit (6 per 15 min)
    const limited = await limitByIp(req, 'resend-otp', 6, 900);
    if (limited) return limited;
    let user; try { user = await requireAuth(); } catch { return fail('UNAUTHORIZED', 'Please sign in.'); }
    const rows = await db().execute(sql`SELECT email_verified, otp_last_sent_at, otp_send_count FROM users WHERE id = ${user.id}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = rows.rows[0] as any;
    if (u?.email_verified) return ok({ sent: true });
    const r = await issueAndSendOtp({ id: user.id, email: user.email, name: user.name, otpLastSentAt: u?.otp_last_sent_at, otpSendCount: Number(u?.otp_send_count ?? 0) });
    if (!r.ok) return fail('RATE_LIMITED', r.error);
    return ok({ sent: true });
  });
}