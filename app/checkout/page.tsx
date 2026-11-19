import type { Metadata } from 'next';
import { requireAuth } from '@/lib/session';
import { CheckoutForm } from './CheckoutForm';
import { Container } from '@/components/Container';
import { getPaymentMode } from '@/lib/payment-mode';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };

export default async function CheckoutPage() {
  const user = await requireAuth('/checkout');
  const paymentMode = getPaymentMode();
  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-3">Checkout</p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-fg leading-tight">
          {paymentMode === 'pod' ? 'Confirm your order' : 'Confirm and pay'}
        </h1>
        <p className="text-sm text-fg-2 mt-2">
          {paymentMode === 'pod'
            ? 'Choose your pickup gate. You pay when you collect.'
            : 'Confirm your details and pay securely with Paystack.'}
        </p>
      </div>
      <CheckoutForm user={{ id: user.id, email: user.email, name: user.name }} paymentMode={paymentMode} />
    </Container>
  );
}