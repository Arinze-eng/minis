import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { syncSignalsAndNotifications } from "@/lib/server/seed";

export async function GET() {
  const principal = await requirePrincipal();
  const { store, mode } = getStore();
  const signals = await store.listSignals(principal.userId);
  return NextResponse.json({ mode, signals });
}

const ALLOWED_STATES = new Set(["active", "snoozed", "dismissed", "paused"]);

export async function PATCH(request: Request) {
  const principal = await requirePrincipal();
  let body: { id?: unknown; state?: unknown; until?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const state = typeof body.state === "string" ? body.state : "";
  if (!id || !ALLOWED_STATES.has(state)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const until = typeof body.until === "string" && !Number.isNaN(Date.parse(body.until))
    ? body.until
    : null;

  const { store, mode } = getStore();
  const updated = await store.setSignalState(principal.userId, id, state, until);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await store.audit(principal.userId, "signal_state", id, { mode, state });
  return NextResponse.json({ ok: true, state, until });
}

// Keep the sync import referenced for the POST re-sync path used by clients
// after bulk changes.
export async function POST() {
  const principal = await requirePrincipal();
  const { mode } = getStore();
  await syncSignalsAndNotifications(principal.userId);
  return NextResponse.json({ ok: true, mode });
}

const _sync = syncSignalsAndNotifications;
void _sync;
