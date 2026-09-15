-- Delivery preferences (DeliveryPreference in the §8 data model).
-- One JSONB document per principal — the shape is heterogeneous and
-- versioned client-side; unknown fields survive round-trips.

CREATE TABLE IF NOT EXISTS preferences (
  principal_id TEXT PRIMARY KEY,
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preferences_updated ON preferences (updated_at);
