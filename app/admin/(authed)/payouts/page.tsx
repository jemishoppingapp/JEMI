import type { Metadata } from 'next';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireSuperAdmin } from '@/lib/session';
import { getPayoutQueue } from '@/lib/payouts-server';
import { formatCurrency } from '@/lib/utils';
import { PayoutQueueSection } from './PayoutQueueSection';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payouts', robots: { index: false } };

export default async function AdminPayoutsPage() {
  await requireSuperAdmin(); // money: super admins only
  const [{ weekly, monthly }, history] = await Promise.all([
    getPayoutQueue(),
    // Last 20 payouts, so you can check what was already paid.
    db()
      .select({
        id: schema.payouts.id,
        amount: schema.payouts.amount,
        method: schema.payouts.method,
        status: schema.payouts.status,
        transferRef: schema.payouts.transferRef,
        createdAt: schema.payouts.createdAt,
        businessName: schema.sellers.businessName,
        createdByEmail: schema.users.email,
      })
      .from(schema.payouts)
      .leftJoin(schema.sellers, eq(schema.payouts.sellerId, schema.sellers.id))
      .leftJoin(schema.users, eq(schema.payouts.createdBy, schema.users.id))
      .orderBy(desc(schema.payouts.createdAt))
      .limit(20)
      .catch(() => []),
  ]);

  const transfersEnabled = process.env.PAYSTACK_TRANSFERS_ENABLED === 'true';
  const weeklyTotal = weekly.reduce((s, e) => s + e.availableBalance, 0);
  const monthlyTotal = monthly.reduce((s, e) => s + e.availableBalance, 0);

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-5xl">
      <div className="mb-7">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-fg mb-1">Payouts</h1>
        <p className="text-sm text-fg-2">
          Sellers with a balance ready to be paid out. Total due:{' '}
          <span className="font-medium text-fg">{formatCurrency(weeklyTotal + monthlyTotal)}</span>
        </p>
      </div>

      {!transfersEnabled && (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-fg-1">
          <span className="font-semibold">Manual mode.</span> Paystack transfers
          aren&apos;t enabled yet, so payouts are recorded manually: send the money
          via your bank or the Paystack dashboard, then record the reference here.
          Enable <code className="text-xs">PAYSTACK_TRANSFERS_ENABLED</code> once your
          account supports transfers.
        </div>
      )}

      <PayoutQueueSection
        title="Weekly — due now"
        cadenceLabel="weekly"
        entries={weekly}
        transfersEnabled={transfersEnabled}
      />

      <div className="h-8" />

      <PayoutQueueSection
        title="Monthly — due now"
        cadenceLabel="monthly"
        entries={monthly}
        transfersEnabled={transfersEnabled}
      />

      <section className="mt-10 bg-surface border border-border-soft rounded-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-border-soft">
          <h2 className="font-display text-base font-semibold text-fg">Recent payouts</h2>
        </header>
        {history.length === 0 ? (
          <p className="p-6 text-sm text-fg-2">No payouts recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border-soft">
            {history.map((h) => (
              <li key={h.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-fg truncate">{h.businessName ?? 'Seller'}</p>
                  <p className="text-[11px] text-fg-3">
                    {new Date(h.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    {' · '}{h.method}{h.transferRef ? ` · ref ${h.transferRef}` : ''}{h.createdByEmail ? ` · by ${h.createdByEmail}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-fg">{formatCurrency(Number(h.amount))}</p>
                  <p className="text-[11px] text-fg-3 capitalize">{h.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}