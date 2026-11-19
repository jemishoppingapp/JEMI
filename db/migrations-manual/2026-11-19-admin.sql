-- JEMI admin upgrade, 2026-11-19. Safe to run more than once; deletes no data.
-- MUST run BEFORE deploying the admin code (sign-in reads is_super_admin).

-- Admin levels. Everyone who is an admin TODAY becomes a super admin, so
-- nobody loses access. (Runs only while no super admin exists yet, so a
-- re-run never promotes staff admins added later.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;
UPDATE users SET is_super_admin = true
  WHERE role = 'admin' AND NOT EXISTS (SELECT 1 FROM users WHERE is_super_admin = true);

-- Who-did-what log for the admin panel.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,
  actor_email varchar(255) NOT NULL DEFAULT '',
  action      varchar(50)  NOT NULL,
  target_type varchar(30)  NOT NULL DEFAULT '',
  target_id   varchar(100) NOT NULL DEFAULT '',
  summary     text         NOT NULL DEFAULT '',
  details     jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at);

-- Fast "find order by pickup code" for the gate.
CREATE INDEX IF NOT EXISTS orders_sub_orders_gin_idx ON orders USING gin (sub_orders jsonb_path_ops);
