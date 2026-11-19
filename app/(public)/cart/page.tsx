import type { Metadata } from 'next';
import { CartPageContent } from './CartPageContent';
import { getPaymentMode } from '@/lib/payment-mode';

export const metadata: Metadata = { title: 'Your Cart', robots: { index: false } };

export default function CartPage() {
  return <CartPageContent paymentMode={getPaymentMode()} />;
}
