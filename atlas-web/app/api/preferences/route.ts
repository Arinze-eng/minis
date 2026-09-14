import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";

/**
 * Delivery preferences (DeliveryPreference in the §8 data model). Persisted
 * per verified principal server-side — never from client-declared identity.
 * Quiet hours are enforced by deterministic code before any delivery fires;
 * Telegram delivery stays dormant until that channel is actually configured.
 */

const BOUNDED_KEYS = new Set([
  "quietHoursEnabled",
  "quietStart",
  "quietEnd",
  "webuiNotifications",
  "telegramDelivery",
]);

function coerce(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    // Times come as HH:MM from <input type="time">.
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) return trimmed;
    return trimmed.slice(0, 64);
  }
  return null; // unknown types are dropped, not stored
}

export async function GET() {
  const principal = await requirePrincipal();
  const { store, mode } = getStore();
  const data = await store.getPreferences(principal.userId);
  return NextResponse.json({ mode, preferences: data });
}

export async function PUT(request: Request) {
  const principal = await requirePrincipal();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const incoming = body as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (!BOUNDED_KEYS.has(key)) continue; // unknown fields rejected
    const v = coerce(value);
    if (v === null) continue;
    clean[key] = v;
  }

  // Cross-field check: a zero-length window is invalid. Overnight windows
  // (start > end, e.g. 22:00 → 07:30) are the normal case — they wrap midnight.
  const qs = clean.quietStart;
  const qe = clean.quietEnd;
  if (typeof qs === "string" && typeof qe === "string" && qs === qe) {
    return NextResponse.json(
      { error: "invalid_window", message: "Quiet hours start and end must differ." },
      { status: 400 },
    );
  }

  const { store } = getStore();
  await store.setPreferences(principal.userId, clean);
  return NextResponse.json({ ok: true, preferences: clean });
}
