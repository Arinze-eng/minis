import { Pool } from "pg";
import type { StoreGarment, StoreOutfit } from "./dripadvisor.store";

const pool = process.env.NEON_DATABASE_URL
  ? new Pool({ connectionString: process.env.NEON_DATABASE_URL, max: 4, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000, ssl: { rejectUnauthorized: true } })
  : null;

let schemaPromise: Promise<void> | null = null;

const schemaSql = `
CREATE TABLE IF NOT EXISTS wardrobe_items (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT NOT NULL DEFAULT 0,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(40) NOT NULL,
  colors JSONB NOT NULL DEFAULT '[]'::jsonb,
  pattern VARCHAR(80),
  material VARCHAR(80),
  warmth INTEGER NOT NULL DEFAULT 1,
  formality INTEGER NOT NULL DEFAULT 1,
  image_url TEXT,
  image_key TEXT,
  analysis_provider VARCHAR(20) NOT NULL DEFAULT 'demo',
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS outfit_plans (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT NOT NULL DEFAULT 0,
  request_text TEXT NOT NULL,
  title VARCHAR(240) NOT NULL,
  note TEXT NOT NULL,
  item_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  score INTEGER NOT NULL DEFAULT 0,
  provider VARCHAR(20) NOT NULL DEFAULT 'demo',
  preview_url TEXT,
  preview_status VARCHAR(20) NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS outfit_feedback (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT NOT NULL DEFAULT 0,
  outfit_id BIGINT NOT NULL,
  decision VARCHAR(20) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export function neonConfigured() {
  return Boolean(pool);
}

async function ensureSchema() {
  if (!pool) return;
  if (!schemaPromise) schemaPromise = pool.query(schemaSql).then(() => undefined);
  await schemaPromise;
}

function colors(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function garment(row: Record<string, unknown>): StoreGarment {
  return {
    id: Number(row.id),
    name: String(row.name),
    category: String(row.category),
    colors: colors(row.colors),
    pattern: row.pattern ? String(row.pattern) : null,
    material: row.material ? String(row.material) : null,
    warmth: Number(row.warmth),
    formality: Number(row.formality),
    imageUrl: row.image_url ? String(row.image_url) : null,
    status: String(row.status),
    analysisProvider: String(row.analysis_provider),
  };
}

function outfit(row: Record<string, unknown>): StoreOutfit {
  return {
    id: Number(row.id),
    requestText: String(row.request_text),
    title: String(row.title),
    note: String(row.note),
    itemIds: Array.isArray(row.item_ids) ? row.item_ids.map(Number) : [],
    score: Number(row.score),
    provider: String(row.provider),
    previewUrl: row.preview_url ? String(row.preview_url) : null,
    previewStatus: String(row.preview_status),
  };
}

export type NeonGarmentInput = {
  ownerUserId: number;
  name: string;
  category: string;
  colors: string[];
  pattern?: string | null;
  material?: string | null;
  warmth: number;
  formality: number;
  imageUrl?: string | null;
  imageKey?: string | null;
  analysisProvider: string;
  status: string;
};

export type NeonOutfitInput = {
  ownerUserId: number;
  requestText: string;
  title: string;
  note: string;
  itemIds: number[];
  score: number;
  provider: string;
};

export async function listNeonGarments(ownerUserId: number): Promise<StoreGarment[] | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query("SELECT * FROM wardrobe_items WHERE owner_user_id = $1 ORDER BY created_at DESC", [ownerUserId]);
  return result.rows.map(garment);
}

export async function createNeonGarment(input: NeonGarmentInput): Promise<StoreGarment | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query("INSERT INTO wardrobe_items (owner_user_id, name, category, colors, pattern, material, warmth, formality, image_url, image_key, analysis_provider, status) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *", [input.ownerUserId, input.name, input.category, JSON.stringify(input.colors), input.pattern ?? null, input.material ?? null, input.warmth, input.formality, input.imageUrl ?? null, input.imageKey ?? null, input.analysisProvider, input.status]);
  return garment(result.rows[0]);
}

export async function deleteNeonGarment(id: number, ownerUserId: number): Promise<boolean | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query("DELETE FROM wardrobe_items WHERE id = $1 AND owner_user_id = $2", [id, ownerUserId]);
  return (result.rowCount ?? 0) > 0;
}

export async function listNeonOutfits(ownerUserId: number): Promise<StoreOutfit[] | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query("SELECT * FROM outfit_plans WHERE owner_user_id = $1 ORDER BY created_at DESC", [ownerUserId]);
  return result.rows.map(outfit);
}

export async function createNeonOutfit(input: NeonOutfitInput): Promise<StoreOutfit | null> {
  if (!pool) return null;
  await ensureSchema();
  const result = await pool.query("INSERT INTO outfit_plans (owner_user_id, request_text, title, note, item_ids, score, provider) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *", [input.ownerUserId, input.requestText, input.title, input.note, JSON.stringify(input.itemIds), input.score, input.provider]);
  return outfit(result.rows[0]);
}

export async function createNeonFeedback(input: { ownerUserId: number; outfitId: number; decision: string; reason?: string }): Promise<boolean | null> {
  if (!pool) return null;
  await ensureSchema();
  await pool.query("INSERT INTO outfit_feedback (owner_user_id, outfit_id, decision, reason) VALUES ($1,$2,$3,$4)", [input.ownerUserId, input.outfitId, input.decision, input.reason ?? null]);
  return true;
}
