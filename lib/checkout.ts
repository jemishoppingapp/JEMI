/**
 * Transactional checkout primitives.
 *
 * Three operations live here:
 *
 *  createPendingOrder()
 *    /api/payment/initialize — validates cart against live products,
 *    locks stock with SELECT FOR UPDATE, inserts a pending Order row.
 *    Entire flow is wrapped in a transaction so concurrent buyers of
 *    the last unit serialize correctly.
 *
 *  markOrderPaid()
 *    /api/payment/verify and /api/payment/webhook — idempotently
 *    transitions an order to paid, generates pickup codes, decrements
 *    stock. SELECT FOR UPDATE on the order row serializes concurrent
 *    verify+webhook arrivals.
 *
 *  expireStaleOrders()
 *    Both the nightly Vercel Cron and the lazy /orders cleanup call
 *    this. Marks pending orders older than ORDER_TTL_MS as cancelled.
 *    Idempotent. Returns count of orders expired.
 *
 *  deletePendingOrderByReference()
 *    If /api/payment/initialize creates a pending order and then the
 *    Paystack init API call fails, we delete the orphaned order. Only
 *    deletes orders still in `pending` paymentStatus — safe to call
 *    even if the order has already been paid (no-op in that case).
 */
import { and, eq, lt, sql, inArray } from 'drizzle-orm';
import { uuidArray } from '@/lib/sql-array';
import { dbPool } from '@/db/pool';
import { schema } from '@/db';
import { ApiServerError } from '@/lib/api';
import { generateOrderNumber, generatePickupCode } from '@/lib/utils';

import { DELIVERY_FEE, DELIVERY_ZONES, type DeliveryZoneSlug } from '@/lib/shop-config';

export { DELIVERY_ZONES, type DeliveryZoneSlug };
export const ORDER_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface CheckoutCartItem {
  productId: string;
  quantity: number;
}

export interface CheckoutInput {
  userId: string;
  userEmail: string;
  items: CheckoutCartItem[];
  deliveryZone: DeliveryZoneSlug;
  deliveryDescription: string;
  customerNote: string;
  /**
   * Decrement stock inside the same locked transaction. Pay-on-delivery
   * orders need this: they never pass through markOrderPaid(), which is
   * where Paystack orders lose their stock. Without it POD orders never
   * reduced stock and the same item could be sold again and again.
   */
  reserveStock?: boolean;
}

/** Payment states that mean "a real order exists" (not abandoned). */
export const LIVE_PAYMENT_STATUSES = ['paid', 'pay_on_delivery', 'collected'] as const;
/** Payment states where JEMI actually has the money. */
export const MONEY_RECEIVED_STATUSES = ['paid', 'collected'] as const;

/**
 * Merge duplicate cart lines (same product twice) into one line.
 * Otherwise each line is stock-checked on its own and two lines of
 * 3 can pass against a stock of 4.
 */
export function mergeCartItems(items: CheckoutCartItem[]): CheckoutCartItem[] {
  const merged = new Map<string, number>();
  for (const i of items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.quantity);
  return Array.from(merged, ([productId, quantity]) => ({ productId, quantity }));
}

export interface CreatePendingOrderResult {
  orderId: string;
  orderNumber: string;
  reference: string;
  total: number;
}

/**
 * Creates a pending order transactionally:
 *   1. SELECT FOR UPDATE the product rows referenced in cart
 *   2. Verify each row is active, in stock, has enough quantity
 *   3. Recompute prices server-side (don't trust client)
 *   4. INSERT the order
 *
 * Throws ApiServerError with human-readable messages. Caller wraps in
 * withErrorHandling so they reach the user as proper API responses.
 */
export async function createPendingOrder(
  input: CheckoutInput
): Promise<CreatePendingOrderResult> {
  const items = mergeCartItems(input.items);
  if (items.length === 0) {
    throw new ApiServerError('CART_EMPTY', "Your cart is empty.");
  }
  if (items.some((i) => i.quantity > 99)) {
    throw new ApiServerError('VALIDATION_ERROR', 'You can order at most 99 of one item.', 'items');
  }

  const productIds = items.map((i) => i.productId);
  const orderNumber = generateOrderNumber();
  const reference = `${orderNumber}-${Date.now().toString(36).toUpperCase()}`;

  return await dbPool().transaction(async (tx) => {
    // SELECT FOR UPDATE locks the rows so other transactions buying the
    // same items wait until we COMMIT. Without this, two simultaneous
    // checkouts can both pass the in-stock check on the last unit.
    const lockedRows = await tx.execute(
      sql`SELECT id, name, slug, description, price, original_price,
                 images, category, in_stock, stock_quantity, seller, is_active
          FROM products
          WHERE id = ANY(${uuidArray(productIds)})
            AND is_active = true
          FOR UPDATE`
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products = lockedRows.rows as any[];
    const byId = new Map(products.map((p) => [p.id, p]));

    const orderItems: Array<{
      productId: string;
      name: string;
      slug: string;
      imageUrl: string;
      price: number;
      quantity: number;
      seller: string;
    }> = [];
    let subtotal = 0;

    for (const cartItem of items) {
      const p = byId.get(cartItem.productId);
      if (!p) {
        throw new ApiServerError(
          'PRODUCT_NOT_FOUND',
          'One of the items in your cart is no longer available. Please refresh.',
          'items'
        );
      }
      if (!p.in_stock || Number(p.stock_quantity) < cartItem.quantity) {
        const have = Number(p.stock_quantity);
        throw new ApiServerError(
          'INSUFFICIENT_STOCK',
          have === 0
            ? `"${p.name}" is out of stock.`
            : `Only ${have} of "${p.name}" left — please reduce the quantity.`,
          'items'
        );
      }
      const price = Number(p.price);
      orderItems.push({
        productId: p.id,
        name: p.name,
        slug: p.slug,
        imageUrl: Array.isArray(p.images) && p.images[0]?.url ? p.images[0].url : '',
        price,
        quantity: cartItem.quantity,
        seller: p.seller,
      });
      subtotal += price * cartItem.quantity;
    }

    const total = subtotal + DELIVERY_FEE;

    // POD: take the stock now, while the rows are still locked.
    if (input.reserveStock) {
      for (const item of orderItems) {
        await tx.execute(
          sql`UPDATE products
              SET stock_quantity = stock_quantity - ${item.quantity},
                  in_stock = (stock_quantity - ${item.quantity}) > 0,
                  updated_at = now()
              WHERE id = ${item.productId}`
        );
      }
    }

    const subOrders = [
      {
        subOrderNumber: `${orderNumber}-1`,
        sellerName: 'JEMI Store',
        items: orderItems,
        subtotal,
        status: 'pending' as const,
        pickupCode: '',
        pickupCodeUsed: false,
      },
    ];

    const timeline = [
      {
        status: 'pending',
        timestamp: new Date().toISOString(),
        note: 'Order created, awaiting payment',
      },
    ];

    const inserted = await tx.insert(schema.orders).values({
      userId: input.userId,
      orderNumber,
      subOrders,
      subtotal: String(subtotal),
      deliveryFee: String(DELIVERY_FEE),
      total: String(total),
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: 'paystack',
      paystackReference: reference,
      deliveryZone: input.deliveryZone,
      deliveryDescription: input.deliveryDescription,
      customerNote: input.customerNote,
      timeline,
    }).returning({ id: schema.orders.id });

    if (!inserted[0]) {
      throw new ApiServerError(
        'SERVER_ERROR',
        'Could not save your order. Please try again.'
      );
    }

    return {
      orderId: inserted[0].id,
      orderNumber,
      reference,
      total,
    };
  });
}

/**
 * Mark an order paid. Idempotent. Decrements stock atomically.
 */
export async function markOrderPaid(
  reference: string,
  /** SECURITY (V3): what Paystack says was actually paid. The order is
   *  only confirmed when this matches the order total in NGN. */
  paid: { amountKobo: number; currency: string },
): Promise<{
  alreadyPaid: boolean;
  amountMismatch?: boolean;
  order: {
    id: string;
    orderNumber: string;
    pickupCode: string;
    pickupLocation: string;
    total: number;
    status: string;
  } | null;
}> {
  return await dbPool().transaction(async (tx) => {
    const lockedRows = await tx.execute(
      sql`SELECT id, order_number, payment_status, sub_orders, delivery_zone, total
          FROM orders
          WHERE paystack_reference = ${reference}
          FOR UPDATE`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lockedRow = lockedRows.rows[0] as any;

    if (!lockedRow) {
      return { alreadyPaid: false, order: null };
    }

    if (lockedRow.payment_status === 'paid') {
      const subOrder = lockedRow.sub_orders[0];
      return {
        alreadyPaid: true,
        order: {
          id: lockedRow.id,
          orderNumber: lockedRow.order_number,
          pickupCode: subOrder?.pickupCode ?? '',
          pickupLocation: lookupZoneName(lockedRow.delivery_zone),
          total: Number(lockedRow.total),
          status: 'paid',
        },
      };
    }

    // SECURITY (V3): never confirm an order for less than its total.
    const expectedKobo = Math.round(Number(lockedRow.total) * 100);
    if (paid.currency !== 'NGN' || Math.round(paid.amountKobo) !== expectedKobo) {
      // eslint-disable-next-line no-console
      console.error(`[payment] AMOUNT MISMATCH ref=${reference} expected=${expectedKobo} got=${paid.amountKobo} ${paid.currency}`);
      await tx.execute(sql`
        UPDATE orders
        SET timeline = timeline || ${JSON.stringify([{
              status: 'payment_review',
              timestamp: new Date().toISOString(),
              note: `Paid ${paid.amountKobo / 100} ${paid.currency}, expected ${expectedKobo / 100} NGN — needs admin review`,
            }])}::jsonb,
            updated_at = now()
        WHERE id = ${lockedRow.id}`);
      return { alreadyPaid: false, amountMismatch: true, order: null };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedSubOrders = lockedRow.sub_orders.map((so: any) => ({
      ...so,
      status: 'confirmed' as const,
      pickupCode: generatePickupCode(),
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const subOrder of updatedSubOrders) {
      for (const item of subOrder.items) {
        await tx.execute(
          sql`UPDATE products
              SET stock_quantity = GREATEST(0, stock_quantity - ${item.quantity}),
                  in_stock = CASE WHEN stock_quantity - ${item.quantity} <= 0 THEN false ELSE in_stock END
              WHERE id = ${item.productId}`
        );
      }
    }

    await tx.execute(
      sql`UPDATE orders
          SET payment_status = 'paid',
              status = 'confirmed',
              sub_orders = ${JSON.stringify(updatedSubOrders)}::jsonb,
              timeline = timeline || ${JSON.stringify([
                {
                  status: 'paid',
                  timestamp: new Date().toISOString(),
                  note: 'Payment confirmed',
                },
              ])}::jsonb,
              updated_at = now()
          WHERE id = ${lockedRow.id}`
    );

    return {
      alreadyPaid: false,
      order: {
        id: lockedRow.id,
        orderNumber: lockedRow.order_number,
        pickupCode: updatedSubOrders[0]?.pickupCode ?? '',
        pickupLocation: lookupZoneName(lockedRow.delivery_zone),
        total: Number(lockedRow.total),
        status: 'paid',
      },
    };
  });
}

/**
 * Marks pending orders older than ORDER_TTL_MS as cancelled.
 * Idempotent. Returns the number of orders expired.
 * Called by:
 *   - GET /api/cron/cleanup-orders (Vercel Cron, nightly)
 *   - The /orders server component (lazy cleanup, on every visit)
 *
 * We only touch orders whose paymentStatus is still 'pending' — never
 * touches orders that paid. Even if cron and lazy cleanup race on the
 * same order, both are no-ops if the other already cancelled it.
 */
/**
 * Put stock back for every item in an order's sub-orders. Used when a
 * pay-on-delivery order (whose stock was reserved at checkout) is
 * cancelled. Call inside the transaction that cancels the order.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function restockOrderItems(tx: { execute: (q: any) => Promise<unknown> }, subOrders: Array<{ items?: Array<{ productId: string; quantity: number }> }>): Promise<void> {
  for (const so of subOrders ?? []) {
    for (const item of so.items ?? []) {
      await tx.execute(
        sql`UPDATE products
            SET stock_quantity = stock_quantity + ${Number(item.quantity)},
                in_stock = true,
                updated_at = now()
            WHERE id = ${item.productId}`
      );
    }
  }
}

export async function expireStaleOrders(userId?: string): Promise<number> {
  const cutoff = new Date(Date.now() - ORDER_TTL_MS);
  const cutoffTimeline = JSON.stringify([
    {
      status: 'cancelled',
      timestamp: new Date().toISOString(),
      note: 'Order expired (payment not completed within 1 hour)',
    },
  ]);

  // Use the regular DB client (HTTP) — no transactions needed, this is
  // a single UPDATE statement.
  const result = await dbPool().execute(
    sql`UPDATE orders
        SET status = 'cancelled',
            payment_status = 'failed',
            timeline = timeline || ${cutoffTimeline}::jsonb,
            updated_at = now()
        WHERE payment_status = 'pending'
          AND status = 'pending'
          AND created_at < ${cutoff.toISOString()}
          ${userId ? sql`AND user_id = ${userId}` : sql``}`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (result as any).rowCount ?? 0;
}

/**
 * Delete a pending order by Paystack reference. Used by
 * /api/payment/initialize if the Paystack init API call fails AFTER
 * we created the order row — we don't want orphaned pending orders.
 * Only deletes if still in 'pending' paymentStatus.
 */
export async function deletePendingOrderByReference(reference: string): Promise<void> {
  await dbPool().execute(
    sql`DELETE FROM orders
        WHERE paystack_reference = ${reference}
          AND payment_status = 'pending'`
  );
}

function lookupZoneName(slug: string): string {
  return DELIVERY_ZONES.find((z) => z.slug === slug)?.name ?? slug;
}