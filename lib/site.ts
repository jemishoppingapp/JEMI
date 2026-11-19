/**
 * One place for JEMI's public contact details. The contact page and
 * the legal pages read from here.
 */
export const SITE = {
  name: 'JEMI',
  supportEmail: 'jemishoppingapp001@gmail.com',
  whatsapp: '+234 901 446 5194',
  whatsappLink: 'https://wa.me/2349014465194',
  instagram: '',                              // optional: full URL or leave ''
};
/**
 * The site's public address, used for canonical URLs, the sitemap,
 * robots.txt, emails and Paystack callbacks. ONE place, so Google always
 * sees the same domain.
 *
 * Order: NEXT_PUBLIC_SITE_URL if set -> the real domain in production ->
 * the preview deployment's own URL -> localhost. Production must never
 * fall back to the *.vercel.app address (Google would index that).
 */
export const CANONICAL_ORIGIN = 'https://www.jemi.com.ng';

export const SITE_URL: string = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_ENV === 'production'
    ? CANONICAL_ORIGIN
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')
).replace(/\/+$/, '');
