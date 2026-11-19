/**
 * SECURITY (V9): per-IP rate limiting, stored in Postgres (no extra
 * service needed). One atomic upsert per request.
 *
 * Fails OPEN: if the database hiccups we let the request through rather
 * than lock everyone out — the per-account login lock still applies.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { fail } from '@/lib/api';

export function clientIp(req: Request): string {
  // Vercel sets x-forwarded-for; the first entry is the real client.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/** true = allowed, false = over the limit. */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const r = await db().execute(sql`
      INSERT INTO rate_limits (key, count, window_start)
      VALUES (${key}, 1, now())
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                     THEN 1 ELSE rate_limits.count + 1 END,
        window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                     THEN now() ELSE rate_limits.window_start END
      RETURNING count`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = Number((r.rows[0] as any)?.count ?? 0);
    return count <= limit;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[rate-limit] failed open:', e);
    return true;
  }
}

/** Returns a 429 response when over the limit, else null. */
export async function limitByIp(req: Request, route: string, limit: number, windowSeconds: number) {
  const allowed = await hit(`${route}:${clientIp(req)}`, limit, windowSeconds);
  return allowed ? null : fail('RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.');
}
