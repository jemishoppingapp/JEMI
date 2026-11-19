-- JEMI fixes, 2026-11-19. Safe to run more than once.
-- Run in the Neon SQL editor (or psql) BEFORE deploying the new code.
-- Nothing here deletes or rewrites data.

-- 1. Payouts: payout ledger rows have no order. The column was NOT NULL,
--    so lib/payouts-server.ts could never record a payout.
ALTER TABLE escrow_ledger ALTER COLUMN order_id DROP NOT NULL;

-- 2. Indexes for the queries sellers and admins run on every page.
CREATE INDEX IF NOT EXISTS products_seller_id_idx
  ON products (seller_id);
CREATE INDEX IF NOT EXISTS orders_payment_status_created_idx
  ON orders (payment_status, created_at);
CREATE INDEX IF NOT EXISTS escrow_ledger_seller_type_idx
  ON escrow_ledger (seller_id, type);

-- 3. (Optional check) Products whose stock went wrong because
--    pay-on-delivery orders never reduced stock before this fix.
--    Review and correct stock by hand in the admin product editor.
-- SELECT p.name, p.stock_quantity,
--        SUM((item->>'quantity')::int) AS pod_units_sold
-- FROM orders o
-- CROSS JOIN LATERAL jsonb_array_elements(o.sub_orders) so
-- CROSS JOIN LATERAL jsonb_array_elements(so->'items') item
-- JOIN products p ON p.id = (item->>'productId')::uuid
-- WHERE o.payment_method = 'pod' AND o.status <> 'cancelled'
-- GROUP BY p.name, p.stock_quantity
-- ORDER BY pod_units_sold DESC;
