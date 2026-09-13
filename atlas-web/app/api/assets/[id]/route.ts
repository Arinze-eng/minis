import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { cloudinaryConfigured, signedDeliveryUrl } from "@/lib/server/cloudinary";

/**
 * Owner-scoped asset access. GET returns a short-lived signed URL for the
 * principal's own asset only; the opaque Cloudinary public_id never reaches
 * the client except inside that signed URL.
 */
export async function GET(
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
  if (!cloudinaryConfigured()) {
    return NextResponse.json(
      { error: "provider_unavailable", provider: "cloudinary" },
      { status: 503 },
    );
  }
  await store.audit(principal.userId, "asset_viewed", asset.id, { mode });
  return NextResponse.json({
    asset: {
      id: asset.id,
      bytes: asset.bytes,
      width: asset.width,
      height: asset.height,
      mime: asset.mime,
      purpose: asset.purpose,
      createdAt: asset.createdAt,
    },
    url: signedDeliveryUrl(asset.publicId),
    expiresInSeconds: 3600,
  });
}
