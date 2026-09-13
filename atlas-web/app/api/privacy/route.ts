import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";

/**
 * Privacy operations. Export returns a machine-readable snapshot of every
 * record class for the principal. Wipe is irreversible and requires the
 * client to send { action: "wipe", confirm: true } — a missing confirm is a
 * 400, not a deletion.
 */
export async function POST(request: Request) {
  const principal = await requirePrincipal();
  let body: { action?: unknown; confirm?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { store, mode } = getStore();

  if (body.action === "export") {
    const [garments, findings, signals, notifications] = await Promise.all([
      store.listGarments(principal.userId),
      store.listFindings(principal.userId),
      store.listSignals(principal.userId),
      store.listNotifications(principal.userId),
    ]);
    await store.audit(principal.userId, "data_export", null, { mode });
    return NextResponse.json(
      {
        exportedAt: new Date().toISOString(),
        storeMode: mode,
        garments,
        moneyFindings: findings,
        signals,
        notifications,
      },
      {
        headers: {
          "Content-Disposition": 'attachment; filename="atlas-export.json"',
        },
      },
    );
  }

  if (body.action === "wipe") {
    if (body.confirm !== true) {
      return NextResponse.json({ error: "confirm_required" }, { status: 400 });
    }
    await store.audit(principal.userId, "data_wipe", null, { mode });
    await store.wipe(principal.userId);
    return NextResponse.json({ ok: true, wiped: true, storeMode: mode });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
