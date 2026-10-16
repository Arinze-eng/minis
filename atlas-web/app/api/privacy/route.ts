import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { cloudinaryConfigured, destroyImage } from "@/lib/server/cloudinary";
import { revokeToken } from "@/lib/server/gmail";
import { decryptRefreshToken, tokenEncryptionConfigured } from "@/lib/server/secretBox";

const CONSENT_SCOPES = ["garment_image_analysis", "person_image_use"] as const;

/**
 * Privacy operations. Export returns a machine-readable snapshot of every
 * record class for the principal. Wipe is irreversible and requires the
 * client to send { action: "wipe", confirm: true } — a missing confirm is a
 * 400, not a deletion. Wipe also deletes stored images at the provider and
 * revokes Gmail access at Google (both best-effort, reported in the reply).
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
    const [garments, findings, signals, notifications, emailFindings, assets, consents, preferences, gmail] =
      await Promise.all([
        store.listGarments(principal.userId),
        store.listFindings(principal.userId),
        store.listSignals(principal.userId),
        store.listNotifications(principal.userId),
        store.listEmailFindings(principal.userId),
        store.listAssets(principal.userId),
        Promise.all(CONSENT_SCOPES.map((scope) => store.getConsent(principal.userId, scope))),
        store.getPreferences(principal.userId),
        store.getSourceConnection(principal.userId, "gmail"),
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
        emailFindings,
        // Provider object ids stay server-side.
        assets: assets.map(({ publicId: _publicId, ...rest }) => rest),
        consents,
        preferences,
        sources: gmail
          ? [{ provider: gmail.provider, status: gmail.status, scopes: gmail.scopes, connectedAt: gmail.connectedAt }]
          : [],
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
    let imagesFailed = 0;
    for (const asset of await store.listAssets(principal.userId)) {
      try {
        if (!cloudinaryConfigured()) throw new Error("cloudinary_not_configured");
        await destroyImage(asset.publicId);
      } catch {
        imagesFailed += 1;
      }
    }
    // Revoke every Google grant at Google before forgetting the tokens.
    const revoked: Record<string, boolean> = {};
    for (const provider of ["gmail", "google_tasks"]) {
      const conn = await store.getSourceConnection(principal.userId, provider);
      if (!conn?.encryptedRefreshToken || !tokenEncryptionConfigured()) continue;
      const token = decryptRefreshToken(conn.encryptedRefreshToken);
      revoked[provider] = token ? await revokeToken(token) : false;
    }
    await store.audit(principal.userId, "data_wipe", null, { mode, imagesFailed, revoked });
    await store.wipe(principal.userId);
    return NextResponse.json({ ok: true, wiped: true, storeMode: mode, imagesFailed, revoked });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
