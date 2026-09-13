import { NextResponse } from "next/server";
import { requirePrincipal, scopedKey } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { syncSignalsAndNotifications } from "@/lib/server/seed";
import { randomUUID } from "node:crypto";

const CATEGORIES = new Set([
  "top", "bottom", "dress", "outerwear", "shoes", "accessory", "one_piece", "underlayer", "other",
]);

export async function GET() {
  const principal = await requirePrincipal();
  const { store, mode } = getStore();
  const garments = await store.listGarments(principal.userId);
  return NextResponse.json({ mode, garments });
}

export async function POST(request: Request) {
  const principal = await requirePrincipal();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const category = typeof body.category === "string" ? body.category : "";
  if (!name || !CATEGORIES.has(category)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const warmth = clampInt(body.warmth, 0, 3, 1);
  const formality = clampInt(body.formality, 0, 3, 1);
  const price = typeof body.price === "number" && body.price > 0 ? Math.min(body.price, 1_000_000) : null;

  const { store, mode } = getStore();
  const garment = await store.createGarment(principal.userId, {
    id: randomUUID(),
    name,
    category,
    colors: strArray(body.colors, 8),
    material: strOrNull(body.material, 80),
    pattern: strOrNull(body.pattern, 80),
    warmth,
    formality,
    seasons: strArray(body.seasons, 6),
    occasions: strArray(body.occasions, 8),
    price,
    currency: typeof body.currency === "string" ? body.currency.slice(0, 3).toUpperCase() : "USD",
    wearCount: 0,
    // Items created through this endpoint are user-entered, not model output.
    status: "confirmed",
    analysisProvider: "user",
  });
  await store.audit(principal.userId, "garment_added", garment.id, { mode, name });
  await syncSignalsAndNotifications(principal.userId);
  return NextResponse.json({ garment }, { status: 201 });
}

export async function DELETE(request: Request) {
  const principal = await requirePrincipal();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const { store, mode } = getStore();
  const removed = await store.deleteGarment(principal.userId, id);
  if (!removed) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await store.audit(principal.userId, "garment_deleted", id, { mode });
  await syncSignalsAndNotifications(principal.userId);
  return NextResponse.json({ ok: true });
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? Math.round(v) : Number.NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function strArray(v: unknown, maxItems: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, maxItems);
}

function strOrNull(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, maxLen);
  return t || null;
}

// scopedKey is used by wear/feedback routes that import this module's helpers;
// keep the reference so tree-shaking doesn't complain in strict builds.
void scopedKey;

export async function PATCH(request: Request) {
  const principal = await requirePrincipal();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const category = typeof body.category === "string" ? body.category : "";
  if (!id || !name || !CATEGORIES.has(category)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // Idempotent confirm: the same confirmation key never double-writes.
  const confirmKey = typeof body.clientConfirmKey === "string" ? body.clientConfirmKey : null;
  const { store, mode } = getStore();
  if (confirmKey) {
    const consumed = await store.consumeIdempotencyKey(
      principal.userId,
      scopedKey(principal, "garment_confirm", confirmKey),
    );
    if (!consumed) {
      return NextResponse.json({ error: "duplicate_confirmation" }, { status: 409 });
    }
  }

  const warmth = clampInt(body.warmth, 0, 3, 1);
  const formality = clampInt(body.formality, 0, 3, 1);
  const price = typeof body.price === "number" && body.price > 0 ? Math.min(body.price, 1_000_000) : null;

  const garment = await store.updateGarment(principal.userId, id, {
    name,
    category,
    colors: strArray(body.colors, 8),
    material: strOrNull(body.material, 80),
    pattern: strOrNull(body.pattern, 80),
    warmth,
    formality,
    seasons: strArray(body.seasons, 6),
    occasions: strArray(body.occasions, 8),
    price,
    currency: typeof body.currency === "string" ? body.currency.slice(0, 3).toUpperCase() : "USD",
  });
  if (!garment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await store.audit(principal.userId, "garment_confirmed", garment.id, { mode });
  await syncSignalsAndNotifications(principal.userId);
  return NextResponse.json({ garment });
}
