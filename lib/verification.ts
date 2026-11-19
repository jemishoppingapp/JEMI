import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { sendEmail, otpEmailHtml } from '@/lib/email';

const COOLDOWN_S = 60;
const DAILY_CAP = 10;
const EXPIRY_MIN = 10;
const MAX_TRIES = 5;

export async function issueAndSendOtp(user: { id: string; email: string; name: string; otpLastSentAt?: Date | string | null; otpSendCount?: number }) {
  const last = user.otpLastSentAt ? new Date(user.otpLastSentAt) : null;
  const now = new Date();
  if (last && now.getTime() - last.getTime() < COOLDOWN_S * 1000) {
    const wait = Math.ceil((COOLDOWN_S * 1000 - (now.getTime() - last.getTime())) / 1000);
    return { ok: false as const, error: `Please wait ${wait}s before requesting another code.` };
  }
  const sameDay = last && last.toDateString() === now.toDateString();
  const count = sameDay ? (user.otpSendCount ?? 0) : 0;
  if (count >= DAILY_CAP) {
    return { ok: false as const, error: 'Daily code limit reached. Try again tomorrow.' };
  }
  // SECURITY (V4): CSPRNG, not Math.random.
  const code = String(randomInt(100000, 1000000));
  const hash = await bcrypt.hash(code, 10);
  await db().execute(sql`
    UPDATE users SET otp_hash = ${hash},
      otp_expires_at = now() + interval '${sql.raw(String(EXPIRY_MIN))} minutes',
      otp_attempts = 0, otp_last_sent_at = now(),
      otp_send_count = ${count + 1}
    WHERE id = ${user.id}`);
  const sent = await sendEmail({
    to: user.email,
    subject: `${code} is your JEMI verification code`,
    html: otpEmailHtml(user.name, code),
    text: `Your JEMI verification code is ${code}. It expires in ${EXPIRY_MIN} minutes.`,
  });
  if (!sent.ok && !sent.skipped) return { ok: false as const, error: 'Could not send the email. Try again shortly.' };
  return { ok: true as const };
}


/**
 * SECURITY (V4): claim one attempt BEFORE comparing the code. The old
 * flow read otp_attempts, ran bcrypt (~70ms), then incremented — so a
 * burst of parallel guesses all saw "0 attempts" and got through. This
 * single UPDATE is atomic: once 5 attempts are used, it matches no row.
 * Returns the stored hash, or a reason it can't be tried.
 */
async function claimOtpAttempt(userId: string): Promise<
  { ok: true; hash: string } | { ok: false; error: string }
> {
  const r = await db().execute(sql`
    UPDATE users SET otp_attempts = otp_attempts + 1
    WHERE id = ${userId}
      AND otp_hash <> ''
      AND otp_expires_at > now()
      AND otp_attempts < ${MAX_TRIES}
    RETURNING otp_hash`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = r.rows[0] as any;
  if (row?.otp_hash) return { ok: true, hash: row.otp_hash };
  return { ok: false, error: 'Code expired or too many wrong tries. Request a new code.' };
}

export async function verifyOtp(userId: string, code: string) {
  const rows = await db().execute(sql`
    SELECT otp_hash, otp_expires_at, otp_attempts, email_verified FROM users WHERE id = ${userId}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = rows.rows[0] as any;
  if (!u) return { ok: false as const, error: 'Account not found.' };
  if (u.email_verified) return { ok: true as const, already: true as const };
  if (!u.otp_hash || !u.otp_expires_at) return { ok: false as const, error: 'No code issued. Tap Resend.' };
  const claim = await claimOtpAttempt(userId);
  if (!claim.ok) return { ok: false as const, error: claim.error };
  const match = await bcrypt.compare(code, claim.hash);
  if (!match) {
    return { ok: false as const, error: 'Wrong code. Check the email and try again.' };
  }
  await db().execute(sql`
    UPDATE users SET email_verified = true, otp_hash = '', otp_expires_at = NULL, otp_attempts = 0 WHERE id = ${userId}`);
  return { ok: true as const };
}
/** Strict OTP check for password resets: ALWAYS validates the code
 *  (no verified-user shortcut), consumes it on success, and marks the
 *  email verified since inbox access was just proven. */
export async function consumeOtp(userId: string, code: string) {
  const rows = await db().execute(sql`
    SELECT otp_hash, otp_expires_at, otp_attempts FROM users WHERE id = ${userId}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = rows.rows[0] as any;
  if (!u) return { ok: false as const, error: 'Account not found.' };
  if (!u.otp_hash || !u.otp_expires_at) return { ok: false as const, error: 'No code issued. Request a new one.' };
  const claim = await claimOtpAttempt(userId);
  if (!claim.ok) return { ok: false as const, error: claim.error };
  const match = await bcrypt.compare(code, claim.hash);
  if (!match) {
    return { ok: false as const, error: 'Wrong code. Check the email and try again.' };
  }
  // Single use: only the request that clears THIS hash wins.
  const used = await db().execute(sql`
    UPDATE users SET email_verified = true, otp_hash = '', otp_expires_at = NULL, otp_attempts = 0
    WHERE id = ${userId} AND otp_hash = ${claim.hash}
    RETURNING id`);
  if (used.rows.length === 0) return { ok: false as const, error: 'That code was already used. Request a new one.' };
  return { ok: true as const };
}
