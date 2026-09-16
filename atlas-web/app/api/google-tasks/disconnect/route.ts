import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { revokeToken } from "@/lib/server/gmail";
import { decryptRefreshToken } from "@/lib/server/secretBox";

export async function POST() {
  const principal = await requirePrincipal();
  const { store } = getStore();
  const connection = await store.getSourceConnection(principal.userId, "google_tasks");
  if (connection?.encryptedRefreshToken) {
    const token = decryptRefreshToken(connection.encryptedRefreshToken);
    if (token) await revokeToken(token);
  }
  await store.upsertSourceConnection(principal.userId, "google_tasks", {
    status: "disconnected",
    encryptedRefreshToken: null,
    accountEmail: null,
    disconnectedAt: new Date().toISOString(),
    lastError: null,
  });
  await store.audit(principal.userId, "google_tasks_disconnected", null, {});
  return NextResponse.json({ ok: true });
}
