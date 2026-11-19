'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useCartStore, type CartLineCheck } from '@/store/cart';
import { apiFetch } from '@/lib/api-client';

/**
 * Refresh the cart from the server once when a page mounts (cart page,
 * checkout): current prices, removed products, stock limits. Tells the
 * buyer what changed. Network trouble is silent: the server re-checks
 * everything at checkout anyway.
 *
 * Returns `checking` so a page can show that prices are being confirmed.
 */
export function useCartSync(): { checking: boolean } {
  const syncFromServer = useCartStore((s) => s.syncFromServer);
  const [checking, setChecking] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const ids = useCartStore.getState().items.map((i) => i.productId).slice(0, 50);
    if (ids.length === 0) return;

    setChecking(true);
    apiFetch<{ lines: CartLineCheck[] }>('/api/cart/validate', { method: 'POST', body: { productIds: ids } })
      .then(({ lines }) => {
        const r = syncFromServer(lines);
        for (const name of r.removed) toast.error(`${name} is no longer available and was removed from your cart.`);
        for (const { name, qty } of r.reduced) toast.warning(`Only ${qty} of ${name} left. We updated your cart.`);
        if (r.priceChanged.length > 0) {
          toast.info(
            r.priceChanged.length === 1
              ? `The price of ${r.priceChanged[0]} changed. Your total is updated.`
              : `${r.priceChanged.length} prices changed. Your total is updated.`
          );
        }
      })
      .catch(() => { /* offline or server hiccup: keep the cart as is */ })
      .finally(() => setChecking(false));
  }, [syncFromServer]);

  return { checking };
}
