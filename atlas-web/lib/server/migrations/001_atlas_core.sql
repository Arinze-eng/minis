-- Atlas core schema (reviewed + committed; no runtime CREATE TABLE IF NOT EXISTS
-- outside the migration runner).
--
-- Conventions:
-- - Every private table is scoped by principal_id (server-verified); all private
--   queries MUST filter on it (enforced by the store layer + tests).
-- - Text enums over domain enums for migration simplicity; validated at the
--   store boundary by the same zod/TS types the UI consumes.
-- - Timestamps are timestamptz (UTC).
-- - Idempotency: unique (principal_id, key) on wear events, feedback, and
--   findings dedup; a dedicated idempotency_keys table guards retries.

BEGIN;

CREATE TABLE IF NOT EXISTS wardrobe_garments (
  id            TEXT PRIMARY KEY,                       -- server-generated uuid
  principal_id  TEXT NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  colors        JSONB NOT NULL DEFAULT '[]'::jsonb,
  material      TEXT,
  pattern       TEXT,
  warmth        INT  NOT NULL DEFAULT 1 CHECK (warmth BETWEEN 0 AND 3),
  formality     INT  NOT NULL DEFAULT 1 CHECK (formality BETWEEN 0 AND 3),
  seasons       JSONB NOT NULL DEFAULT '[]'::jsonb,
  occasions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  price         NUMERIC(12,2),
  currency      TEXT,
  wear_count    INT  NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'needs_confirmation',
  analysis_provider TEXT NOT NULL DEFAULT 'demo',
  image_ref     TEXT,                                  -- opaque asset ref (Phase 2 upload)
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_garments_principal_status
  ON wardrobe_garments (principal_id, status);
CREATE INDEX IF NOT EXISTS idx_garments_principal_category
  ON wardrobe_garments (principal_id, category);

CREATE TABLE IF NOT EXISTS wear_events (
  id            TEXT PRIMARY KEY,
  principal_id  TEXT NOT NULL,
  garment_id    TEXT NOT NULL REFERENCES wardrobe_garments(id) ON DELETE CASCADE,
  worn_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (principal_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_wear_principal_garment
  ON wear_events (principal_id, garment_id, worn_at DESC);

CREATE TABLE IF NOT EXISTS money_findings (
  id            TEXT PRIMARY KEY,
  principal_id  TEXT NOT NULL,
  merchant      TEXT NOT NULL,
  product_name  TEXT,
  amount        NUMERIC(12,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  cadence       TEXT NOT NULL DEFAULT 'unknown',
  annualized    NUMERIC(12,2),
  next_renewal  TIMESTAMPTZ,
  trial_end     TIMESTAMPTZ,
  price_changed JSONB,                                 -- {from,to,detectedAt}
  state         TEXT NOT NULL DEFAULT 'active',
  confidence    REAL NOT NULL DEFAULT 0.5,
  extraction_version TEXT NOT NULL DEFAULT 'ext-2026.09',
  sources       JSONB NOT NULL DEFAULT '[]'::jsonb,    -- sanitized refs only
  dedup_key     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (principal_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_findings_principal_state
  ON money_findings (principal_id, state);
CREATE INDEX IF NOT EXISTS idx_findings_principal_renewal
  ON money_findings (principal_id, next_renewal);

CREATE TABLE IF NOT EXISTS signals (
  id            TEXT PRIMARY KEY,
  principal_id  TEXT NOT NULL,
  kind          TEXT NOT NULL,                          -- renewal|price_change|unworn|cpw_milestone|cross_domain
  title         TEXT NOT NULL,
  implication   TEXT NOT NULL,
  noticed       TEXT NOT NULL,
  urgency       TEXT NOT NULL DEFAULT 'normal',
  domains       JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence      JSONB NOT NULL DEFAULT '[]'::jsonb,     -- bounded, sanitized
  uncertainty   REAL NOT NULL DEFAULT 0.5,
  capability    TEXT NOT NULL DEFAULT 'advise',
  primary_action JSONB NOT NULL,                        -- {label,kind,href}
  state         TEXT NOT NULL DEFAULT 'active',         -- active|snoozed|dismissed|paused
  state_until   TIMESTAMPTZ,
  dedup_key     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (principal_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_signals_principal_state
  ON signals (principal_id, state);
CREATE INDEX IF NOT EXISTS idx_signals_principal_freshness
  ON signals (principal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  principal_id  TEXT NOT NULL,
  category      TEXT NOT NULL,                          -- renewals|closet|system
  title         TEXT NOT NULL,
  detail        TEXT NOT NULL,
  action        JSONB NOT NULL,                         -- {kind,label,href}
  urgency       TEXT NOT NULL DEFAULT 'normal',
  read          BOOLEAN NOT NULL DEFAULT FALSE,
  dedup_key     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (principal_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_notifications_principal_read
  ON notifications (principal_id, read, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id            TEXT PRIMARY KEY,
  principal_id  TEXT NOT NULL,
  kind          TEXT NOT NULL,                          -- garment_added|wear_logged|signal_state|finding_state|...
  subject_id    TEXT,
  detail        JSONB NOT NULL DEFAULT '{}'::jsonb,     -- bounded; never secrets/payloads
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_principal_time
  ON audit_events (principal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  principal_id  TEXT NOT NULL,
  key           TEXT NOT NULL,
  consumed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_id, key)
);

COMMIT;
