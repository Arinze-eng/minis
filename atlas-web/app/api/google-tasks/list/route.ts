import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { listGoogleTasks } from "@/lib/server/googleTasks";

export async function GET() {
  const principal = await requirePrincipal();
  const { store } = getStore();
  const connection = await store.getSourceConnection(principal.userId, "google_tasks");
  if (connection?.status !== "connected" || !connection.encryptedRefreshToken) {
    return NextResponse.json({ error: "google_tasks_not_connected", tasks: [] }, { status: 409 });
  }
  try {
    const tasks = await listGoogleTasks(connection.encryptedRefreshToken);
    return NextResponse.json({ tasks, fetchedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_tasks_unavailable";
    const status = message.includes("unauthorized") ? 401 : 502;
    return NextResponse.json({ error: message, tasks: [] }, { status });
  }
}
