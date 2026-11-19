/**
 * Shop-wide constants shared by server code AND the browser.
 * No server imports here, so client components can use it.
 *
 * DELIVERY_FEE and DELIVERY_ZONES used to be copied into three files
 * (checkout logic, checkout form, cart page). Change them here only.
 */
export const DELIVERY_FEE = 500; // ₦, flat, per order

export const DELIVERY_ZONES = [
  { slug: 'lasu-iba-gate', name: 'LASU Iba Gate', description: 'Main entrance' },
  { slug: 'iyana-iba-gate', name: 'Iyana Iba Gate', description: 'Iyana Iba bus stop' },
] as const;

export type DeliveryZoneSlug = (typeof DELIVERY_ZONES)[number]['slug'];

export type PaymentMode = 'pod' | 'paystack';
