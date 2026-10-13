BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_reference TEXT NOT NULL UNIQUE,
  request_key UUID NOT NULL UNIQUE,
  plan_key TEXT NOT NULL,
  plan_snapshot JSONB NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  monthly_amount NUMERIC(10,2) NOT NULL CHECK (monthly_amount >= 0),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN (
    'draft','awaiting_discord','ticket_open','awaiting_staff_review',
    'awaiting_payment','payment_review','paid_verified','provisioning_queued',
    'provisioning','active','needs_customer_info','staff_handoff',
    'cancelled','payment_rejected','provisioning_failed','refunded'
  )),
  discord_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  CHECK (discord_user_id IS NULL OR discord_user_id ~ '^[0-9]{15,22}$')
);
CREATE INDEX IF NOT EXISTS orders_state_created_idx ON orders(state, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_discord_user_idx ON orders(discord_user_id) WHERE discord_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS discord_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL CHECK (discord_user_id ~ '^[0-9]{15,22}$'),
  claim_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discord_links_order_idx ON discord_links(order_id);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL,
  channel_id TEXT UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','open','closed','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payment_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL,
  evidence_reference TEXT,
  reviewer_discord_id TEXT NOT NULL CHECK (reviewer_discord_id ~ '^[0-9]{15,22}$'),
  reason TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_reviews_order_idx ON payment_reviews(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','cancelled')),
  provider_resource_reference TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provisioning_jobs_state_created_idx ON provisioning_jobs(state, created_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system','customer','staff','bot','ai','worker')),
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_target_idx ON audit_events(target_type, target_id, created_at DESC);

COMMIT;