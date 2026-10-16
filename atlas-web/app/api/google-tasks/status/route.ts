import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { googleTasksConfigured } from "@/lib/server/googleTasks";

export async function GET() {
  const principal = await requirePrincipal();
  const { store } = getStore();
  const connection = await store.getSourceConnection(principal.userId, "google_tasks");
  return NextResponse.json({
    configured: googleTasksConfigured(),
    connected: connection?.status === "connected",
    status: connection?.status ?? "not_connected",
    scopes: connection?.scopes ?? [],
    connectedAt: connection?.connectedAt ?? null,
  });
}
