import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Atlas server store — one interface, two backends:
 *
 *  - Postgres (Neon-compatible) when DATABASE_URL is set: pooled connections,
 *    committed migrations, user-scoped queries only.
 *  - Local file store otherwise: explicitly labelled `local_file` mode; same
 *    user scoping (a directory per principal); for dev/demo only.
 *
 * Every private read/write takes the verified principal. There is no API that
 * reads across principals.
 */

export type StoreMode = "postgres" | "local_file";

export interface GarmentRow {
  id: string;
  principalId: string;
  name: string;
  category: string;
  colors: string[];
  material?: string | null;
  pattern?: string | null;
  warmth: number;
  formality: number;
  seasons: string[];
  occasions: string[];
  price?: number | null;
  currency?: string | null;
  wearCount: number;
  status: string;
  analysisProvider: string;
  imageRef?: string | null;
  addedAt: string;
}

export interface FindingRow {
  id: string;
  principalId: string;
  merchant: string;
  productName?: string | null;
  amount: number;
  currency: string;
  cadence: string;
  annualized?: number | null;
  nextRenewal?: string | null;
  trialEnd?: string | null;
  priceChanged?: { from: number; to: number; detectedAt: string } | null;
  state: string;
  confidence: number;
  extractionVersion: string;
  sources: unknown[];
}

export interface SignalRow {
  id: string;
  principalId: string;
  kind: string;
  title: string;
  implication: string;
  noticed: string;
  urgency: string;
  domains: string[];
  evidence: unknown[];
  uncertainty: number;
  capability: string;
  primaryAction: { label: string; kind: string; href: string };
  state: string;
  stateUntil?: string | null;
  createdAt: string;
}

export interface NotificationRow {
  id: string;
  principalId: string;
  category: string;
  title: string;
  detail: string;
  action: { kind: string; label: string; href: string };
  urgency: string;
  read: boolean;
  createdAt: string;
}

const MIGRATIONS = ["001_atlas_core", "002_assets_consent"] as const;

export interface AssetRow {
  id: string;
  principalId: string;
  provider: string;
  publicId: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  mime: string;
  purpose: string;
  status: string;
  createdAt: string;
  deletedAt?: string | null;
}

export interface ConsentRow {
  scope: string;
  granted: boolean;
  grantedAt?: string | null;
  revokedAt?: string | null;
  consentVersion: string;
}

// ---------------------------------------------------------------------------
// Postgres backend
// ---------------------------------------------------------------------------

class PgStore {
  private pool: import("pg").Pool | null = null;
  private migrated = false;
  // Single-flight guard so N parallel first requests run the migration check
  // once instead of racing each other (and double-applying DDL).
  private migratePromise: Promise<void> | null = null;

  private async getPool(): Promise<import("pg").Pool> {
    if (!this.pool) {
      const { Pool } = await import("pg");
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 4,
        idleTimeoutMillis: 30_000,
        // Neon cold-start can take several seconds; a tight budget killed the
        // first parallel burst of requests. 20s covers a cold compute start.
        connectionTimeoutMillis: 20_000,
        // Let the URL drive TLS (sslmode=require); allow unverified fallback
        // for local Postgres where certs are self-signed.
        ssl: process.env.DATABASE_URL?.includes("sslmode=disable")
          ? false
          : { rejectUnauthorized: false },
      });
    }
    return this.pool;
  }

  private async ensureMigrated(): Promise<void> {
    if (this.migrated) return;
    if (!this.migratePromise) {
      this.migratePromise = this.runMigrations().finally(() => {
        this.migratePromise = null;
      });
    }
    await this.migratePromise;
    this.migrated = true;
  }

  private async runMigrations(): Promise<void> {
    const pool = await this.getPool();
    // Migration journal: apply committed files in order, once. INSERT is
    // guarded so a race with another instance cannot double-apply.
    await pool.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const applied = await pool.query("SELECT name FROM schema_migrations");
    const done = new Set(applied.rows.map((r: { name: string }) => r.name));
    for (const name of MIGRATIONS) {
      if (done.has(name)) continue;
      const sql = readFileSync(
        join(process.cwd(), "lib/server/migrations", `${name}.sql`),
        "utf8",
      );
      await pool.query(sql);
      await pool.query(
        "INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
        [name],
      );
    }
  }

  async listGarments(principalId: string): Promise<GarmentRow[]> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const { rows } = await pool.query(
      `SELECT * FROM wardrobe_garments WHERE principal_id = $1 ORDER BY added_at DESC`,
      [principalId],
    );
    return rows.map(mapGarment);
  }

  async createGarment(
    principalId: string,
    g: Omit<GarmentRow, "principalId" | "addedAt">,
  ): Promise<GarmentRow> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const { rows } = await pool.query(
      `INSERT INTO wardrobe_garments
        (id, principal_id, name, category, colors, material, pattern, warmth, formality,
         seasons, occasions, price, currency, wear_count, status, analysis_provider, image_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        g.id, principalId, g.name, g.category, JSON.stringify(g.colors),
        g.material ?? null, g.pattern ?? null, g.warmth, g.formality,
        JSON.stringify(g.seasons), JSON.stringify(g.occasions),
        g.price ?? null, g.currency ?? null, g.wearCount, g.status, g.analysisProvider,
        g.imageRef ?? null,
      ],
    );
    return mapGarment(rows[0]);
  }

  async deleteGarment(principalId: string, id: string): Promise<boolean> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const res = await pool.query(
      "DELETE FROM wardrobe_garments WHERE id = $1 AND principal_id = $2",
      [id, principalId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Confirm-and-update a pending garment; ownership-checked, returns the row. */
  async updateGarment(
    principalId: string,
    id: string,
    patch: {
      name: string;
      category: string;
      colors: string[];
      material?: string | null;
      pattern?: string | null;
      warmth: number;
      formality: number;
      seasons: string[];
      occasions: string[];
      price?: number | null;
      currency?: string | null;
    },
  ): Promise<GarmentRow | null> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const { rows } = await pool.query(
      `UPDATE wardrobe_garments SET
         name = $3, category = $4, colors = $5, material = $6, pattern = $7,
         warmth = $8, formality = $9, seasons = $10, occasions = $11,
         price = $12, currency = $13, status = 'confirmed',
         analysis_provider = 'user_confirmed', updated_at = now()
       WHERE id = $1 AND principal_id = $2 RETURNING *`,
      [
        id, principalId, patch.name, patch.category, JSON.stringify(patch.colors),
        patch.material ?? null, patch.pattern ?? null, patch.warmth, patch.formality,
        JSON.stringify(patch.seasons), JSON.stringify(patch.occasions),
        patch.price ?? null, patch.currency ?? null,
      ],
    );
    return rows[0] ? mapGarment(rows[0]) : null;
  }

  /** Log a wear; idempotent per key; bumps wear_count in one transaction. */
  async logWear(
    principalId: string,
    garmentId: string,
    idempotencyKey: string,
  ): Promise<{ ok: boolean; duplicate: boolean; wearCount?: number }> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const garment = await client.query(
        "SELECT id FROM wardrobe_garments WHERE id = $1 AND principal_id = $2",
        [garmentId, principalId],
      );
      if (garment.rowCount === 0) {
        await client.query("ROLLBACK");
        return { ok: false, duplicate: false };
      }
      const dup = await client.query(
        "SELECT 1 FROM idempotency_keys WHERE principal_id = $1 AND key = $2",
        [principalId, idempotencyKey],
      );
      if ((dup.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        const current = await client.query(
          "SELECT wear_count FROM wardrobe_garments WHERE id = $1 AND principal_id = $2",
          [garmentId, principalId],
        );
        return { ok: true, duplicate: true, wearCount: current.rows[0]?.wear_count };
      }
      await client.query(
        "INSERT INTO wear_events (id, principal_id, garment_id, idempotency_key) VALUES ($1,$2,$3,$4)",
        [randomUUID(), principalId, garmentId, idempotencyKey],
      );
      await client.query(
        "INSERT INTO idempotency_keys (principal_id, key) VALUES ($1,$2)",
        [principalId, idempotencyKey],
      );
      const updated = await client.query(
        `UPDATE wardrobe_garments SET wear_count = wear_count + 1, updated_at = now()
         WHERE id = $1 AND principal_id = $2 RETURNING wear_count`,
        [garmentId, principalId],
      );
      await client.query("COMMIT");
      return { ok: true, duplicate: false, wearCount: updated.rows[0]?.wear_count };
    } finally {
      client.release();
    }
  }

  async listFindings(principalId: string): Promise<FindingRow[]> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const { rows } = await pool.query(
      "SELECT * FROM money_findings WHERE principal_id = $1 ORDER BY created_at DESC",
      [principalId],
    );
    return rows.map(mapFinding);
  }

  async upsertFinding(principalId: string, f: FindingRow & { dedupKey: string }): Promise<void> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    await pool.query(
      `INSERT INTO money_findings
        (id, principal_id, merchant, product_name, amount, currency, cadence, annualized,
         next_renewal, trial_end, price_changed, state, confidence, extraction_version, sources, dedup_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (principal_id, dedup_key) DO UPDATE SET
         amount = EXCLUDED.amount, currency = EXCLUDED.currency, cadence = EXCLUDED.cadence,
         annualized = EXCLUDED.annualized, next_renewal = EXCLUDED.next_renewal,
         trial_end = EXCLUDED.trial_end, price_changed = EXCLUDED.price_changed,
         confidence = EXCLUDED.confidence, sources = EXCLUDED.sources, updated_at = now()`,
      [
        f.id, principalId, f.merchant, f.productName ?? null, f.amount, f.currency,
        f.cadence, f.annualized ?? null, f.nextRenewal ?? null, f.trialEnd ?? null,
        f.priceChanged ? JSON.stringify(f.priceChanged) : null, f.state, f.confidence,
        f.extractionVersion, JSON.stringify(f.sources), f.dedupKey,
      ],
    );
  }

  async setFindingState(principalId: string, id: string, state: string): Promise<boolean> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const res = await pool.query(
      "UPDATE money_findings SET state = $3, updated_at = now() WHERE id = $1 AND principal_id = $2",
      [id, principalId, state],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async listSignals(principalId: string): Promise<SignalRow[]> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const { rows } = await pool.query(
      "SELECT * FROM signals WHERE principal_id = $1 ORDER BY created_at DESC",
      [principalId],
    );
    return rows.map(mapSignal);
  }

  async upsertSignal(principalId: string, s: SignalRow & { dedupKey: string }): Promise<void> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    await pool.query(
      `INSERT INTO signals
        (id, principal_id, kind, title, implication, noticed, urgency, domains, evidence,
         uncertainty, capability, primary_action, state, dedup_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (principal_id, dedup_key) DO UPDATE SET
         title = EXCLUDED.title, implication = EXCLUDED.implication, noticed = EXCLUDED.noticed,
         urgency = EXCLUDED.urgency, evidence = EXCLUDED.evidence, uncertainty = EXCLUDED.uncertainty,
         primary_action = EXCLUDED.primary_action, updated_at = now()`,
      [
        s.id, principalId, s.kind, s.title, s.implication, s.noticed, s.urgency,
        JSON.stringify(s.domains), JSON.stringify(s.evidence), s.uncertainty,
        s.capability, JSON.stringify(s.primaryAction), s.state, s.dedupKey,
      ],
    );
  }

  async setSignalState(
    principalId: string,
    id: string,
    state: string,
    until?: string | null,
  ): Promise<boolean> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const res = await pool.query(
      `UPDATE signals SET state = $3, state_until = $4, updated_at = now()
       WHERE id = $1 AND principal_id = $2`,
      [id, principalId, state, until ?? null],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async listNotifications(principalId: string): Promise<NotificationRow[]> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const { rows } = await pool.query(
      "SELECT * FROM notifications WHERE principal_id = $1 ORDER BY created_at DESC",
      [principalId],
    );
    return rows.map(mapNotification);
  }

  async upsertNotification(
    principalId: string,
    n: NotificationRow & { dedupKey: string },
  ): Promise<void> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    await pool.query(
      `INSERT INTO notifications (id, principal_id, category, title, detail, action, urgency, read, dedup_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (principal_id, dedup_key) DO UPDATE SET
         title = EXCLUDED.title, detail = EXCLUDED.detail, urgency = EXCLUDED.urgency`,
      [
        n.id, principalId, n.category, n.title, n.detail, JSON.stringify(n.action),
        n.urgency, n.read, n.dedupKey,
      ],
    );
  }

  async markNotificationRead(principalId: string, id: string): Promise<boolean> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const res = await pool.query(
      "UPDATE notifications SET read = TRUE WHERE id = $1 AND principal_id = $2",
      [id, principalId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async audit(principalId: string, kind: string, subjectId: string | null, detail: Record<string, unknown>): Promise<void> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    await pool.query(
      "INSERT INTO audit_events (id, principal_id, kind, subject_id, detail) VALUES ($1,$2,$3,$4,$5)",
      [randomUUID(), principalId, kind, subjectId, JSON.stringify(detail)],
    );
  }

  /** Consume an idempotency key; false means it was already used. */
  async consumeIdempotencyKey(principalId: string, key: string): Promise<boolean> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const res = await pool.query(
      "INSERT INTO idempotency_keys (principal_id, key) VALUES ($1,$2) ON CONFLICT (principal_id, key) DO NOTHING",
      [principalId, key],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // --- Assets + consent (migration 002) ------------------------------------

  async createAsset(
    principalId: string,
    a: Omit<AssetRow, "principalId" | "createdAt" | "deletedAt" | "status">,
  ): Promise<AssetRow> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const { rows } = await pool.query(
      `INSERT INTO wardrobe_assets
        (id, principal_id, provider, public_id, bytes, width, height, mime, purpose, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active') RETURNING *`,
      [a.id, principalId, a.provider, a.publicId, a.bytes, a.width ?? null, a.height ?? null, a.mime, a.purpose],
    );
    return mapAsset(rows[0]);
  }

  async getAsset(principalId: string, id: string): Promise<AssetRow | null> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const { rows } = await pool.query(
      "SELECT * FROM wardrobe_assets WHERE id = $1 AND principal_id = $2",
      [id, principalId],
    );
    return rows[0] ? mapAsset(rows[0]) : null;
  }

  async markAssetDeleted(principalId: string, id: string): Promise<AssetRow | null> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const { rows } = await pool.query(
      `UPDATE wardrobe_assets SET status = 'deleted', deleted_at = now()
       WHERE id = $1 AND principal_id = $2 AND status = 'active' RETURNING *`,
      [id, principalId],
    );
    return rows[0] ? mapAsset(rows[0]) : null;
  }

  async getConsent(principalId: string, scope: string): Promise<ConsentRow> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const { rows } = await pool.query(
      "SELECT * FROM consent_grants WHERE principal_id = $1 AND scope = $2",
      [principalId, scope],
    );
    if (!rows[0]) {
      return { scope, granted: false, grantedAt: null, revokedAt: null, consentVersion: "v1" };
    }
    const r = rows[0];
    return {
      scope,
      granted: Boolean(r.granted) && !r.revoked_at,
      grantedAt: r.granted_at ? new Date(r.granted_at as string).toISOString() : null,
      revokedAt: r.revoked_at ? new Date(r.revoked_at as string).toISOString() : null,
      consentVersion: String(r.consent_version),
    };
  }

  async setConsent(principalId: string, scope: string, granted: boolean): Promise<ConsentRow> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const { rows } = await pool.query(
      `INSERT INTO consent_grants (principal_id, scope, granted, granted_at, revoked_at)
       VALUES ($1,$2,$3,CASE WHEN $3 THEN now() ELSE NULL END, CASE WHEN $3 THEN NULL ELSE now() END)
       ON CONFLICT (principal_id, scope) DO UPDATE SET
         granted = EXCLUDED.granted,
         granted_at = EXCLUDED.granted_at,
         revoked_at = CASE WHEN EXCLUDED.granted THEN NULL ELSE now() END,
         updated_at = now()
       RETURNING *`,
      [principalId, scope, granted],
    );
    const r = rows[0];
    return {
      scope,
      granted: Boolean(r.granted) && !r.revoked_at,
      grantedAt: r.granted_at ? new Date(r.granted_at as string).toISOString() : null,
      revokedAt: r.revoked_at ? new Date(r.revoked_at as string).toISOString() : null,
      consentVersion: String(r.consent_version),
    };
  }

  async wipe(principalId: string): Promise<void> {
    await this.ensureMigrated();
    const pool = await this.getPool();
    const tables = [
      "wear_events", "wardrobe_garments", "money_findings", "signals",
      "notifications", "audit_events", "idempotency_keys",
      "wardrobe_assets", "consent_grants",
    ];
    for (const t of tables) {
      await pool.query(`DELETE FROM ${t} WHERE principal_id = $1`, [principalId]);
    }
  }
}

function mapGarment(r: Record<string, unknown>): GarmentRow {
  return {
    id: String(r.id),
    principalId: String(r.principal_id),
    name: String(r.name),
    category: String(r.category),
    colors: asArray(r.colors),
    material: (r.material as string) ?? null,
    pattern: (r.pattern as string) ?? null,
    warmth: Number(r.warmth),
    formality: Number(r.formality),
    seasons: asArray(r.seasons),
    occasions: asArray(r.occasions),
    price: r.price !== null ? Number(r.price) : null,
    currency: (r.currency as string) ?? null,
    wearCount: Number(r.wear_count),
    status: String(r.status),
    analysisProvider: String(r.analysis_provider),
    imageRef: (r.image_ref as string) ?? null,
    addedAt: new Date(r.added_at as string).toISOString(),
  };
}

function mapFinding(r: Record<string, unknown>): FindingRow {
  return {
    id: String(r.id),
    principalId: String(r.principal_id),
    merchant: String(r.merchant),
    productName: (r.product_name as string) ?? null,
    amount: Number(r.amount),
    currency: String(r.currency),
    cadence: String(r.cadence),
    annualized: r.annualized !== null ? Number(r.annualized) : null,
    nextRenewal: r.next_renewal ? new Date(r.next_renewal as string).toISOString() : null,
    trialEnd: r.trial_end ? new Date(r.trial_end as string).toISOString() : null,
    priceChanged: (r.price_changed as FindingRow["priceChanged"]) ?? null,
    state: String(r.state),
    confidence: Number(r.confidence),
    extractionVersion: String(r.extraction_version),
    sources: asArray(r.sources),
  };
}

function mapSignal(r: Record<string, unknown>): SignalRow {
  return {
    id: String(r.id),
    principalId: String(r.principal_id),
    kind: String(r.kind),
    title: String(r.title),
    implication: String(r.implication),
    noticed: String(r.noticed),
    urgency: String(r.urgency),
    domains: asArray(r.domains),
    evidence: asArray(r.evidence),
    uncertainty: Number(r.uncertainty),
    capability: String(r.capability),
    primaryAction: r.primary_action as SignalRow["primaryAction"],
    state: String(r.state),
    stateUntil: r.state_until ? new Date(r.state_until as string).toISOString() : null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

function mapAsset(r: Record<string, unknown>): AssetRow {
  return {
    id: String(r.id),
    principalId: String(r.principal_id),
    provider: String(r.provider),
    publicId: String(r.public_id),
    bytes: Number(r.bytes),
    width: r.width !== null && r.width !== undefined ? Number(r.width) : null,
    height: r.height !== null && r.height !== undefined ? Number(r.height) : null,
    mime: String(r.mime),
    purpose: String(r.purpose),
    status: String(r.status),
    createdAt: new Date(r.created_at as string).toISOString(),
    deletedAt: r.deleted_at ? new Date(r.deleted_at as string).toISOString() : null,
  };
}

function mapNotification(r: Record<string, unknown>): NotificationRow {
  return {
    id: String(r.id),
    principalId: String(r.principal_id),
    category: String(r.category),
    title: String(r.title),
    detail: String(r.detail),
    action: r.action as NotificationRow["action"],
    urgency: String(r.urgency),
    read: Boolean(r.read),
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

// ---------------------------------------------------------------------------
// Local file backend (labelled; same scoping guarantees)
// ---------------------------------------------------------------------------

class LocalFileStore {
  private root: string;

  constructor() {
    this.root = process.env.ATLAS_LOCAL_STORE_DIR?.trim() || join(process.cwd(), ".atlas-local-store");
  }

  private dir(principalId: string): string {
    // Hash the principal so no raw id becomes a path element.
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const hashed = createHash("sha256").update(principalId).digest("hex").slice(0, 32);
    return join(this.root, hashed);
  }

  private read<T>(principalId: string, name: string): T[] {
    try {
      return JSON.parse(readFileSync(join(this.dir(principalId), `${name}.json`), "utf8")) as T[];
    } catch {
      return [];
    }
  }

  private write<T>(principalId: string, name: string, rows: T[]): void {
    mkdirSync(this.dir(principalId), { recursive: true });
    writeFileSync(join(this.dir(principalId), `${name}.json`), JSON.stringify(rows, null, 2), "utf8");
  }

  async listGarments(principalId: string): Promise<GarmentRow[]> {
    return this.read<GarmentRow>(principalId, "garments").sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  async createGarment(principalId: string, g: Omit<GarmentRow, "principalId" | "addedAt">): Promise<GarmentRow> {
    const row: GarmentRow = { ...g, principalId, addedAt: new Date().toISOString() };
    const rows = this.read<GarmentRow>(principalId, "garments");
    rows.push(row);
    this.write(principalId, "garments", rows);
    return row;
  }

  async deleteGarment(principalId: string, id: string): Promise<boolean> {
    const rows = this.read<GarmentRow>(principalId, "garments");
    const next = rows.filter((g) => g.id !== id);
    const removed = next.length < rows.length;
    if (removed) this.write(principalId, "garments", next);
    return removed;
  }

  async updateGarment(
    principalId: string,
    id: string,
    patch: {
      name: string;
      category: string;
      colors: string[];
      material?: string | null;
      pattern?: string | null;
      warmth: number;
      formality: number;
      seasons: string[];
      occasions: string[];
      price?: number | null;
      currency?: string | null;
    },
  ): Promise<GarmentRow | null> {
    const rows = this.read<GarmentRow>(principalId, "garments");
    const target = rows.find((g) => g.id === id);
    if (!target) return null;
    Object.assign(target, patch, { status: "confirmed", analysisProvider: "user_confirmed" });
    this.write(principalId, "garments", rows);
    return target;
  }

  async logWear(principalId: string, garmentId: string, idempotencyKey: string): Promise<{ ok: boolean; duplicate: boolean; wearCount?: number }> {
    const keys = this.read<{ key: string }>(principalId, "idempotency");
    if (keys.some((k) => k.key === idempotencyKey)) {
      const garments = await this.listGarments(principalId);
      return { ok: true, duplicate: true, wearCount: garments.find((g) => g.id === garmentId)?.wearCount };
    }
    const garments = this.read<GarmentRow>(principalId, "garments");
    const target = garments.find((g) => g.id === garmentId);
    if (!target) return { ok: false, duplicate: false };
    target.wearCount += 1;
    this.write(principalId, "garments", garments);
    keys.push({ key: idempotencyKey });
    this.write(principalId, "idempotency", keys);
    const wears = this.read<{ id: string; principalId: string; garmentId: string; wornAt: string }>(principalId, "wear_events");
    wears.push({ id: randomUUID(), principalId, garmentId, wornAt: new Date().toISOString() });
    this.write(principalId, "wear_events", wears);
    return { ok: true, duplicate: false, wearCount: target.wearCount };
  }

  async listFindings(principalId: string): Promise<FindingRow[]> {
    return this.read<FindingRow>(principalId, "findings").sort((a, b) =>
      String((b as FindingRow & { createdAt?: string }).createdAt ?? "").localeCompare(
        String((a as FindingRow & { createdAt?: string }).createdAt ?? ""),
      ),
    );
  }

  async upsertFinding(principalId: string, f: FindingRow & { dedupKey: string }): Promise<void> {
    const rows = this.read<FindingRow & { dedupKey?: string }>(principalId, "findings");
    const idx = rows.findIndex((r) => r.dedupKey === f.dedupKey);
    const { dedupKey, ...rest } = f;
    if (idx >= 0) rows[idx] = { ...rows[idx], ...rest };
    else rows.push({ ...rest, dedupKey } as FindingRow & { dedupKey: string });
    this.write(principalId, "findings", rows);
  }

  async setFindingState(principalId: string, id: string, state: string): Promise<boolean> {
    const rows = this.read<FindingRow>(principalId, "findings");
    const target = rows.find((r) => r.id === id);
    if (!target) return false;
    target.state = state;
    this.write(principalId, "findings", rows);
    return true;
  }

  async listSignals(principalId: string): Promise<SignalRow[]> {
    return this.read<SignalRow>(principalId, "signals").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async upsertSignal(principalId: string, s: SignalRow & { dedupKey: string }): Promise<void> {
    const rows = this.read<SignalRow & { dedupKey?: string }>(principalId, "signals");
    const idx = rows.findIndex((r) => r.dedupKey === s.dedupKey);
    const { dedupKey, ...rest } = s;
    if (idx >= 0) rows[idx] = { ...rows[idx], ...rest };
    else rows.push({ ...rest, dedupKey } as SignalRow & { dedupKey: string });
    this.write(principalId, "signals", rows);
  }

  async setSignalState(principalId: string, id: string, state: string, until?: string | null): Promise<boolean> {
    const rows = this.read<SignalRow>(principalId, "signals");
    const target = rows.find((r) => r.id === id);
    if (!target) return false;
    target.state = state;
    target.stateUntil = until ?? null;
    this.write(principalId, "signals", rows);
    return true;
  }

  async listNotifications(principalId: string): Promise<NotificationRow[]> {
    return this.read<NotificationRow>(principalId, "notifications").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async upsertNotification(principalId: string, n: NotificationRow & { dedupKey: string }): Promise<void> {
    const rows = this.read<NotificationRow & { dedupKey?: string }>(principalId, "notifications");
    const idx = rows.findIndex((r) => r.dedupKey === n.dedupKey);
    const { dedupKey, ...rest } = n;
    if (idx >= 0) rows[idx] = { ...rows[idx], ...rest };
    else rows.push({ ...rest, dedupKey } as NotificationRow & { dedupKey: string });
    this.write(principalId, "notifications", rows);
  }

  async markNotificationRead(principalId: string, id: string): Promise<boolean> {
    const rows = this.read<NotificationRow>(principalId, "notifications");
    const target = rows.find((r) => r.id === id);
    if (!target) return false;
    target.read = true;
    this.write(principalId, "notifications", rows);
    return true;
  }

  async audit(principalId: string, kind: string, subjectId: string | null, detail: Record<string, unknown>): Promise<void> {
    const rows = this.read<{ id: string; principalId: string; kind: string; subjectId: string | null; detail: Record<string, unknown>; createdAt: string }>(principalId, "audit");
    rows.push({ id: randomUUID(), principalId, kind, subjectId, detail, createdAt: new Date().toISOString() });
    this.write(principalId, "audit", rows);
  }

  async consumeIdempotencyKey(principalId: string, key: string): Promise<boolean> {
    const rows = this.read<{ key: string }>(principalId, "idempotency");
    if (rows.some((k) => k.key === key)) return false;
    rows.push({ key });
    this.write(principalId, "idempotency", rows);
    return true;
  }

  // --- Assets + consent (mirrors the Postgres backend) ---------------------

  async createAsset(
    principalId: string,
    a: Omit<AssetRow, "principalId" | "createdAt" | "deletedAt" | "status">,
  ): Promise<AssetRow> {
    const row: AssetRow = {
      ...a, principalId, status: "active", createdAt: new Date().toISOString(), deletedAt: null,
    };
    const rows = this.read<AssetRow>(principalId, "assets");
    rows.push(row);
    this.write(principalId, "assets", rows);
    return row;
  }

  async getAsset(principalId: string, id: string): Promise<AssetRow | null> {
    return this.read<AssetRow>(principalId, "assets").find((a) => a.id === id && a.status === "active") ?? null;
  }

  async markAssetDeleted(principalId: string, id: string): Promise<AssetRow | null> {
    const rows = this.read<AssetRow>(principalId, "assets");
    const target = rows.find((a) => a.id === id && a.status === "active");
    if (!target) return null;
    target.status = "deleted";
    target.deletedAt = new Date().toISOString();
    this.write(principalId, "assets", rows);
    return target;
  }

  async getConsent(principalId: string, scope: string): Promise<ConsentRow> {
    const rows = this.read<ConsentRow>(principalId, "consents");
    return rows.find((c) => c.scope === scope) ?? { scope, granted: false, grantedAt: null, revokedAt: null, consentVersion: "v1" };
  }

  async setConsent(principalId: string, scope: string, granted: boolean): Promise<ConsentRow> {
    const rows = this.read<ConsentRow>(principalId, "consents");
    const idx = rows.findIndex((c) => c.scope === scope);
    const now = new Date().toISOString();
    const row: ConsentRow = {
      scope,
      granted,
      grantedAt: granted ? now : null,
      revokedAt: granted ? null : now,
      consentVersion: "v1",
    };
    if (idx >= 0) rows[idx] = row;
    else rows.push(row);
    this.write(principalId, "consents", rows);
    return row;
  }

  async wipe(principalId: string): Promise<void> {
    for (const name of ["garments", "findings", "signals", "notifications", "audit", "wear_events", "idempotency", "assets", "consents"]) {
      this.write(principalId, name, []);
    }
  }
}

// ---------------------------------------------------------------------------
// Facade
// ---------------------------------------------------------------------------

let cached: { mode: StoreMode; store: PgStore | LocalFileStore } | null = null;

export function getStore(): { mode: StoreMode; store: PgStore | LocalFileStore } {
  if (cached) return cached;
  if (process.env.DATABASE_URL?.trim()) {
    cached = { mode: "postgres", store: new PgStore() };
  } else {
    cached = { mode: "local_file", store: new LocalFileStore() };
  }
  return cached;
}

export function storeMode(): StoreMode {
  return getStore().mode;
}
