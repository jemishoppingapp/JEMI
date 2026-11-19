'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Banknote, Truck, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';

interface Props {
  orderNumber: string;
  status: string;
  total: number;
  paymentMethod: string;     // 'pod' | 'paystack'
  paymentStatus: string;     // 'pay_on_delivery' | 'collected' | ...
  podCollectedAmount: number | null;
  podCollectedMethod: string;
}

export function AdminPodDelivery({
  orderNumber, status, total, paymentMethod, paymentStatus,
  podCollectedAmount, podCollectedMethod,
}: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(total));
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  // Only render for POD orders.
  if (paymentMethod !== 'pod') return null;
  if (status === 'cancelled') return null;

  // Already collected — show a summary.
  if (paymentStatus === 'collected') {
    return (
      <div className="mt-6 rounded-2xl border border-success/30 bg-success/5 p-5 flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-fg">Delivered &amp; collected</p>
          <p className="text-xs text-fg-2 mt-0.5">
            {podCollectedAmount != null ? formatCurrency(podCollectedAmount) : '—'} collected
            {podCollectedMethod ? ` by ${podCollectedMethod}` : ''}. Sellers have been credited.
          </p>
        </div>
      </div>
    );
  }

  async function handleDeliver() {
    const amt = parseFloat(amount);
    if (Number.isNaN(amt) || amt < 0) {
      toast.error('Enter a valid amount collected.');
      return;
    }
    if (code.trim().length < 4) {
      toast.error("Type the pickup code the buyer shows you.");
      return;
    }
    const diff = total - amt;
    if (!confirm(
      `Hand over ${orderNumber}?\n\n` +
      `Collected: ${formatCurrency(amt)} (${method})` +
      (diff > 0 ? `\n⚠ That is ${formatCurrency(diff)} LESS than the order total.` : '') +
      (diff < 0 ? `\n⚠ That is ${formatCurrency(-diff)} MORE than the order total.` : '') +
      `\n\nThis completes the order and credits the seller(s). It can't be undone.`
    )) return;

    setSaving(true);
    try {
      const res = await apiFetch<{ sellersCredited: number }>(
        `/api/admin/orders/${orderNumber}/pod-deliver`,
        { method: 'POST', body: { amount: amt, method, pickupCode: code.trim() } }
      );
      toast.success(`Delivered. ${res.sellersCredited} seller(s) credited.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not complete delivery');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border-2 border-primary-soft bg-primary-soft/20 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Truck className="h-4 w-4 text-primary-text" />
        <h2 className="font-display text-base font-semibold text-fg">Collect payment at the gate</h2>
      </div>
      <p className="text-sm text-fg-2 mb-4">
        Buyer pays <span className="font-semibold text-fg">{formatCurrency(total)}</span>.
        Check their pickup code, take the money, then record it here.
      </p>
      <div className="mb-3">
        <label htmlFor="pod-code" className="text-[11px] uppercase tracking-[0.15em] text-fg-2 font-medium mb-1 block">
          Pickup code the buyer shows
        </label>
        <Input
          id="pod-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7MX2P" autoComplete="off" autoCapitalize="characters" spellCheck={false}
          className="font-mono tracking-[0.3em] text-lg uppercase"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-[11px] uppercase tracking-[0.15em] text-fg-2 font-medium mb-1 block">
            Amount collected
          </label>
          <Input
            type="number" inputMode="numeric" step="0.01" min="0"
            value={amount} onChange={(e) => setAmount(e.target.value)}
          />
          {(() => {
            const a = parseFloat(amount);
            if (Number.isNaN(a) || a === total) return <p className="text-[11px] text-fg-3 mt-1">Order total: {formatCurrency(total)}</p>;
            return (
              <p className="text-[11px] text-warning mt-1">
                {a < total ? `${formatCurrency(total - a)} short of` : `${formatCurrency(a - total)} more than`} the total ({formatCurrency(total)})
              </p>
            );
          })()}
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.15em] text-fg-2 font-medium mb-1 block">
            Method
          </label>
          <div className="flex gap-2">
            {(['cash', 'transfer'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={
                  'flex-1 h-11 rounded-lg border text-sm font-medium capitalize transition-colors ' +
                  (method === m
                    ? 'border-primary bg-primary-soft text-primary-text'
                    : 'border-border bg-surface text-fg-2 hover:bg-surface-1')
                }
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button type="button" variant="default" size="tap" className="w-full sm:w-auto" onClick={handleDeliver} disabled={saving || code.trim().length < 4}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
        Collected, hand over items
      </Button>
    </div>
  );
}