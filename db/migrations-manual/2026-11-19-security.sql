-- JEMI security fixes, 2026-11-19. Safe to run more than once; deletes no data.
-- Run AFTER 2026-11-19.sql and BEFORE deploying the security code.

-- V2: session versioning. Existing cookies count as version 0, so
-- nobody is logged out by this migration itself.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

-- V9: per-IP rate-limit counters.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          varchar(200) PRIMARY KEY,
  count        integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

-- V1 audit: products whose JEMI margin is below the 5% default.
-- Review the list; to reset them all to 5%, run the UPDATE below.
-- SELECT id, name, seller, margin_percent FROM products WHERE margin_percent < 5 ORDER BY margin_percent;
-- UPDATE products SET margin_percent = 5, updated_at = now() WHERE margin_percent < 5;
