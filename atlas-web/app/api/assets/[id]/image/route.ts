import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { cloudinaryConfigured, signedDeliveryUrl } from "@/lib/server/cloudinary";

/**
 * Owner-scoped image streaming for <img> tags: verifies the principal, then
 * 302s to a short-lived signed provider URL. Non-owners (or deleted assets)
 * get a 404 — the opaque provider id is never exposed outside a signed URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await requirePrincipal();
  const { id } = await params;
  const { store } = getStore();
  const asset = await store.getAsset(principal.userId, id);
  if (!asset || !cloudinaryConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.redirect(signedDeliveryUrl(asset.publicId), 302);
}
