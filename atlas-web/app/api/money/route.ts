import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";

const ALLOWED_STATES = new Set(["active", "kept", "ignored", "cancel_prepared"]);

export async function GET() {
  const principal = await requirePrincipal();
  const { store, mode } = getStore();
  const findings = await store.listFindings(principal.userId);
  const annualizedTotal = findings.reduce(
    (sum, f) => sum + (f.state !== "ignored" && f.annualized !== null ? Number(f.annualized) : 0),
    0,
  );
  return NextResponse.json({
    mode,
    findings,
    annualizedTotal,
    cadenceAssumption:
      "Annualized = amount × periods/year; unknown cadence is never annualized",
  });
}

export async function PATCH(request: Request) {
  const principal = await requirePrincipal();
  let body: { id?: unknown; state?: unknown };
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
  const { store, mode } = getStore();
  const updated = await store.setFindingState(principal.userId, id, state);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await store.audit(principal.userId, "finding_state", id, { mode, state });
  return NextResponse.json({ ok: true, state });
}
