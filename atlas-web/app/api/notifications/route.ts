import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";

export async function GET() {
  const principal = await requirePrincipal();
  const { store, mode } = getStore();
  const notifications = await store.listNotifications(principal.userId);
  return NextResponse.json({ mode, notifications });
}

export async function PATCH(request: Request) {
  const principal = await requirePrincipal();
  let body: { id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const { store } = getStore();
  const ok = await store.markNotificationRead(principal.userId, id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
