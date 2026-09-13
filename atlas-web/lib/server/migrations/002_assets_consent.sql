-- Assets + consent (Phase 2 image path).
--
-- - wardrobe_assets: one row per stored private image. `public_id` is the
--   Cloudinary identifier and is treated as server-only; clients reference
--   assets by the opaque `id` and only via owner-scoped routes.
-- - consent_grants: per-scope, per-principal consent records. Analysis
--   routes MUST check the row server-side before any provider call.
--   Revocation is recorded (revoked_at), never deleted, so the audit trail
--   survives a later re-grant.

BEGIN;

CREATE TABLE IF NOT EXISTS wardrobe_assets (
  id            TEXT PRIMARY KEY,                       -- opaque, client-visible
  principal_id  TEXT NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'cloudinary',
  public_id     TEXT NOT NULL,                          -- server-only
  bytes         INT NOT NULL,
  width         INT,
  height        INT,
  mime          TEXT NOT NULL,
  purpose       TEXT NOT NULL DEFAULT 'garment',        -- garment|reference_person
  status        TEXT NOT NULL DEFAULT 'active',         -- active|deleted
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_assets_principal_status
  ON wardrobe_assets (principal_id, status);

CREATE TABLE IF NOT EXISTS consent_grants (
  principal_id    TEXT NOT NULL,
  scope           TEXT NOT NULL,                        -- garment_image_analysis|person_image_use|...
  granted         BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  consent_version TEXT NOT NULL DEFAULT 'v1',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_id, scope)
);

COMMIT;
