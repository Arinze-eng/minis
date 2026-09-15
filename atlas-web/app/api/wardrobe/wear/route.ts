import { NextResponse } from "next/server";
import { requirePrincipal, scopedKey } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { syncSignalsAndNotifications } from "@/lib/server/seed";

export async function POST(request: Request) {
  const principal = await requirePrincipal();
  let body: { garmentIds?: unknown; clientKey?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const ids = Array.isArray(body.garmentIds)
    ? body.garmentIds.filter((x): x is string => typeof x === "string").slice(0, 10)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "missing_garment_ids" }, { status: 400 });
  }
  const clientKey = typeof body.clientKey === "string" ? body.clientKey.slice(0, 64) : "";
  const dayStamp = new Date().toISOString().slice(0, 10);

  const { store, mode } = getStore();
  const results = [];
  for (const garmentId of ids) {
    // One idempotent wear per garment per client key (or per day when absent).
    const key = scopedKey(principal, "wear", clientKey ? `${clientKey}:${garmentId}` : `${dayStamp}:${garmentId}`);
    const result = await store.logWear(principal.userId, garmentId, key);
    if (result.ok && !result.duplicate) {
      await store.audit(principal.userId, "wear_logged", garmentId, { mode, day: dayStamp });
    }
    results.push({ garmentId, ...result });
  }
  await syncSignalsAndNotifications(principal.userId);
  return NextResponse.json({ results });
}
