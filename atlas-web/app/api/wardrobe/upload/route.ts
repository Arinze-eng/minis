import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/server/identity";
import { getStore } from "@/lib/server/store";
import { cloudinaryConfigured, uploadGarmentImage, ownerHash } from "@/lib/server/cloudinary";
import { validateImageBytes } from "@/lib/server/imageValidation";
import { syncSignalsAndNotifications } from "@/lib/server/seed";
import { randomUUID } from "node:crypto";

/**
 * Real image upload (brief §10 flow, production path):
 *   consent gate → server-side validation (magic bytes, size, dimensions)
 *   → strict signed Cloudinary upload (private delivery) → asset record
 *   → durable garment row pending confirmation → audit event.
 *
 * No placeholder path: when Cloudinary is not configured this returns an
 * explicit 503 `provider_unavailable` — it never fakes success.
 *
 * Consent (brief §10): the request body carries `imageUseConsent:true`
 * confirming the user saw the purpose/provider disclosure in the UI; the
 * server-side consent_grants record (set via /api/consent) is authoritative.
 */
export async function POST(request: Request) {
  const principal = await requirePrincipal();
  const { store, mode } = getStore();

  // --- Consent gate (server record is authoritative) -----------------------
  const consent = await store.getConsent(principal.userId, "garment_image_analysis");
  if (!consent.granted) {
    return NextResponse.json({ error: "consent_missing" }, { status: 403 });
  }

  // --- Provider availability: explicit, never silently downgraded ----------
  if (!cloudinaryConfigured()) {
    return NextResponse.json(
      { error: "provider_unavailable", provider: "cloudinary" },
      { status: 503 },
    );
  }

  // --- Multipart form (bytes never pass through JSON) ----------------------
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image_required" }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());

  // --- Server-side validation: magic bytes, size, dimensions ---------------
  const check = validateImageBytes(bytes, file.type || "application/octet-stream");
  if (!check.ok) {
    return NextResponse.json(
      { error: "invalid_image", reason: check.reason },
      { status: 400 },
    );
  }

  // --- Signed upload to Cloudinary (private) -------------------------------
  let upload;
  try {
    upload = await uploadGarmentImage({
      bytes,
      mime: check.mime!,
      ownerHash: ownerHash(principal.userId),
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "upload_failed";
    // Real provider failure surfaced as a real 502 with a retryable signal.
    return NextResponse.json({ error: "provider_error", reason }, { status: 502 });
  }

  // --- Asset record (opaque id; public_id stays server-side) ---------------
  const asset = await store.createAsset(principal.userId, {
    id: randomUUID(),
    provider: "cloudinary",
    publicId: upload.publicId,
    bytes: upload.bytes,
    width: upload.width || null,
    height: upload.height || null,
    mime: check.mime!,
    purpose: "garment",
  });

  // --- Garment row pending confirmation (image analysis is a later phase) --
  const garment = await store.createGarment(principal.userId, {
    id: randomUUID(),
    name: form.get("name")?.toString().trim().slice(0, 200) || "New wardrobe piece",
    category: "other",
    colors: [],
    material: null,
    pattern: null,
    warmth: 1,
    formality: 1,
    seasons: [],
    occasions: [],
    price: null,
    currency: "USD",
    wearCount: 0,
    status: "needs_confirmation",
    analysisProvider: "pending_model_analysis",
    imageRef: asset.id,
  });

  await store.audit(principal.userId, "asset_uploaded", asset.id, {
    mode,
    garmentId: garment.id,
    bytes: asset.bytes,
    mime: asset.mime,
    width: asset.width,
    height: asset.height,
  });

  return NextResponse.json(
    {
      garment,
      asset: {
        id: asset.id,
        bytes: asset.bytes,
        width: asset.width,
        height: asset.height,
        mime: asset.mime,
      },
    },
    { status: 201 },
  );
}
