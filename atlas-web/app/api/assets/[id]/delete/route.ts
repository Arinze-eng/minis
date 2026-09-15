import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { cloudinaryConfigured, destroyImage } from "@/lib/server/cloudinary";

/**
 * Owner-scoped asset deletion with real provider cleanup: Cloudinary destroy
 * first, then the asset record is marked deleted, then the audit event notes
 * whether provider cleanup actually succeeded (brief: verify deletion state,
 * never claim cleanup that did not happen).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await requirePrincipal();
  const { id } = await params;
  const { store, mode } = getStore();
  const asset = await store.getAsset(principal.userId, id);
  if (!asset) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let providerCleanup = false;
  let providerError: string | null = null;
  if (cloudinaryConfigured()) {
    try {
      await destroyImage(asset.publicId);
      providerCleanup = true;
    } catch (e) {
      providerError = e instanceof Error ? e.message : "destroy_failed";
    }
  } else {
    providerError = "cloudinary_not_configured";
  }

  const marked = await store.markAssetDeleted(principal.userId, id);
  if (!marked) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await store.audit(principal.userId, "asset_deleted", id, {
    mode,
    providerCleanup,
    providerError,
  });

  if (!providerCleanup) {
    // Record removed and access revoked (signed URLs die with the object and
    // the deleted flag), but provider-side object cleanup did not complete.
    return NextResponse.json(
      { ok: true, assetDeleted: true, providerCleanup, providerError },
      { status: 200 },
    );
  }
  return NextResponse.json({ ok: true, assetDeleted: true, providerCleanup });
}
