import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Class name merger. Use everywhere we conditionally compose Tailwind
 * classes — twMerge resolves conflicts like "p-2 p-4" → "p-4".
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a numeric value as Nigerian Naira.
 * Internal storage is always a Number (kobo NOT used — we store whole
 * naira; Paystack wants kobo at the API boundary, we convert there).
 *
 *   formatCurrency(12500)  -> "₦12,500"
 *   formatCurrency(0)      -> "₦0"
 */
export function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return '₦0';
  return '₦' + Math.round(amount).toLocaleString('en-NG');
}

/**
 * URL-safe slug from a string. Used for product slugs.
 *   slugify("Basic Tee Premium Cotton") -> "basic-tee-premium-cotton"
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Pickup code: 6 uppercase alphanumeric characters, ambiguity-free
 * (no 0/O, no 1/I/L). Shown to the customer on the verify page and
 * required for collection at the pickup point.
 *
 * 28-char alphabet, 6 chars → ~481M possibilities. Collision risk
 * is negligible for this scale.
 */
const PICKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Cryptographically secure random string from PICKUP_ALPHABET.
 *  Uses Web Crypto (works in Node 20+ and Edge). Math.random is
 *  predictable and must never be used for codes people rely on. */
function secureRandomString(length: number): string {
  const bytes = new Uint32Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PICKUP_ALPHABET[bytes[i] % PICKUP_ALPHABET.length];
  }
  return out;
}

export function generatePickupCode(): string {
  return secureRandomString(6);
}

/**
 * Order number: human-readable, prefixed.
 *   JM-YYMMDD-XXXXXX
 *
 * Stable enough for support tickets and not embarrassingly long.
 * The suffix used to be 5 random digits (100k/day), which collides
 * (birthday problem) once a day has a few hundred orders and makes
 * order numbers guessable. Now 6 chars from a 31-letter alphabet
 * (~887M/day), generated with Web Crypto. Date is Lagos time.
 */
export function generateOrderNumber(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', year: '2-digit', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `JM-${get('year')}${get('month')}${get('day')}-${secureRandomString(6)}`;
}

/** Midnight today in Lagos (WAT, UTC+1), as a Date. Servers run in UTC. */
export function startOfTodayLagos(): Date {
  const now = new Date();
  const lagos = new Date(now.getTime() + 60 * 60 * 1000); // shift to WAT
  lagos.setUTCHours(0, 0, 0, 0);
  return new Date(lagos.getTime() - 60 * 60 * 1000);
}

/**
 * Convert Naira (our storage) to kobo (Paystack API).
 *   100 -> 10000
 */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/**
 * Validate a Nigerian phone number. Accepts:
 *   08012345678, 07012345678, 09012345678
 *   +2348012345678, 2348012345678
 *
 * Returns the normalized form (+234 prefix, 13 chars) or null.
 */
export function normalizeNigerianPhone(input: string): string | null {
  const cleaned = input.replace(/[\s-]/g, '');
  // 0[789]XXXXXXXXX  (11 digits)
  let match = /^0([789]\d{9})$/.exec(cleaned);
  if (match) return '+234' + match[1];
  // \+?234[789]XXXXXXXXX  (13 digits)
  match = /^\+?234([789]\d{9})$/.exec(cleaned);
  if (match) return '+234' + match[1];
  return null;
}
/**
 * A `?from=` value that is safe to redirect to: a path on THIS site.
 * "//evil.com" and "/\evil.com" start with "/" but browsers treat them
 * as another website, so they are rejected. Anything unsafe -> fallback.
 */
export function safeRedirectPath(from: string | null | undefined, fallback = '/'): string {
  if (!from || typeof from !== 'string') return fallback;
  if (!from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return fallback;
  return from;
}
