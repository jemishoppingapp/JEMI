'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Client cart, persisted to localStorage as `jemi-cart`.
 *
 * Items reference products by id. The display fields (name, price,
 * image) are snapshots from when the item was added; the cart and
 * checkout pages refresh them from POST /api/cart/validate (see
 * hooks/use-cart-sync.ts), and the server re-prices at checkout anyway.
 */

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  price: number;        // naira (whole)
  imageUrl: string;
  quantity: number;
  seller: string;
  /** Known stock limit (from the product page or the last server check). */
  maxQty?: number;
}

/** What the server said about one cart line (POST /api/cart/validate). */
export interface CartLineCheck {
  productId: string;
  available: boolean;
  name?: string;
  price?: number;
  imageUrl?: string;
  stockQuantity?: number;
}

export interface CartSyncResult {
  removed: string[];               // names no longer available
  priceChanged: string[];          // names whose price changed
  reduced: { name: string; qty: number }[]; // quantity cut to stock
}

interface CartState {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  /** Apply a server check: drop unavailable items, refresh prices, cap to stock. */
  syncFromServer: (checks: CartLineCheck[]) => CartSyncResult;
}

/** Server rejects more than 99 of one item; keep the cart in step so the
 *  buyer never hits a confusing checkout error. */
export const MAX_QTY_PER_ITEM = 99;
const clampQty = (n: number, max?: number) =>
  Math.max(1, Math.min(MAX_QTY_PER_ITEM, max && max > 0 ? max : MAX_QTY_PER_ITEM, Math.floor(n)));

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId
                  ? { ...i, ...item, quantity: clampQty(i.quantity + quantity, item.maxQty ?? i.maxQty) }
                  : i
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: clampQty(quantity, item.maxQty) }] };
        }),

      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),

      updateQuantity: (productId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.productId !== productId)
              : state.items.map((i) =>
                  i.productId === productId ? { ...i, quantity: clampQty(quantity, i.maxQty) } : i
                ),
        })),

      clear: () => set({ items: [] }),

      syncFromServer: (checks) => {
        const byId = new Map(checks.map((c) => [c.productId, c]));
        const result: CartSyncResult = { removed: [], priceChanged: [], reduced: [] };
        const next: CartItem[] = [];
        for (const item of get().items) {
          const c = byId.get(item.productId);
          if (!c) { next.push(item); continue; }          // not checked: keep as is
          if (!c.available) { result.removed.push(item.name); continue; }
          const updated: CartItem = {
            ...item,
            name: c.name ?? item.name,
            price: c.price ?? item.price,
            imageUrl: c.imageUrl ?? item.imageUrl,
            maxQty: c.stockQuantity && c.stockQuantity > 0 ? c.stockQuantity : item.maxQty,
          };
          if (c.price !== undefined && c.price !== item.price) result.priceChanged.push(updated.name);
          const capped = clampQty(updated.quantity, updated.maxQty);
          if (capped < updated.quantity) result.reduced.push({ name: updated.name, qty: capped });
          next.push({ ...updated, quantity: capped });
        }
        set({ items: next });
        return result;
      },
    }),
    {
      name: 'jemi-cart',
      // Only persist items — don't try to serialize the action functions.
      partialize: (state) => ({ items: state.items }),
    }
  )
);