import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";

/**
 * Consent center API. GET returns every scope the UI needs to render state;
 * POST grants or revokes a single scope (server-authoritative record used by
 * every gated route). Revocation is a real state change, not a UI toggle.
 */

const SCOPES = ["garment_image_analysis", "person_image_use"] as const;
export type ConsentScope = (typeof SCOPES)[number];

export async function GET() {
  const principal = await requirePrincipal();
  const { store, mode } = getStore();
  const grants = await Promise.all(SCOPES.map((s) => store.getConsent(principal.userId, s)));
  return NextResponse.json({ mode, grants });
}

export async function POST(request: Request) {
  const principal = await requirePrincipal();
  let body: { scope?: unknown; granted?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const scope = body.scope;
  if (typeof scope !== "string" || !SCOPES.includes(scope as ConsentScope)) {
    return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
  }
  if (typeof body.granted !== "boolean") {
    return NextResponse.json({ error: "granted_boolean_required" }, { status: 400 });
  }
  const { store, mode } = getStore();
  const grant = await store.setConsent(principal.userId, scope, body.granted);
  await store.audit(principal.userId, body.granted ? "consent_granted" : "consent_revoked", null, {
    mode,
    scope,
  });
  return NextResponse.json({ grant });
}
