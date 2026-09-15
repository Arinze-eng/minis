-- 003: source connections (Gmail OAuth), oauth state store, email findings,
-- scan jobs. All private rows are principal-scoped. Refresh tokens are stored
-- only as AES-256-GCM envelopes produced by lib/server/secretBox.ts.

CREATE TABLE IF NOT EXISTS source_connections (
  principal_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected', -- connected | disconnected | error
  scopes TEXT[] NOT NULL DEFAULT '{}',
  encrypted_refresh_token TEXT,
  account_email TEXT,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_source_connections_status
  ON source_connections (principal_id, status);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  action TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Bounded extraction only: never full bodies. One row per (principal, message,
-- kind, merchant) so repeat scans are idempotent.
CREATE TABLE IF NOT EXISTS email_findings (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  merchant TEXT NOT NULL,
  product_name TEXT,
  amount NUMERIC,
  currency TEXT,
  cadence TEXT,
  next_renewal TIMESTAMPTZ,
  message_ref TEXT NOT NULL,
  snippet TEXT,
  confidence NUMERIC NOT NULL,
  extraction_version TEXT NOT NULL,
  occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_findings_dedup
  ON email_findings (principal_id, message_ref, kind, merchant);
CREATE INDEX IF NOT EXISTS idx_email_findings_principal
  ON email_findings (principal_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS scan_jobs (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gmail',
  status TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  discovered INT NOT NULL DEFAULT 0,
  processed INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  deduplicated INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scan_jobs_principal
  ON scan_jobs (principal_id, created_at DESC);
