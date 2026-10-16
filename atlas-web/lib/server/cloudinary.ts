import "server-only";
import { createHash } from "node:crypto";

/**
 * Server-only Cloudinary boundary. Credentials are read from env at call
 * time and never returned, logged, or shipped to the browser. The browser
 * only ever sees opaque asset ids and owner-scoped URLs served by Atlas.
 */

const CLOUD_NAME = () => process.env.CLOUDINARY_CLOUD_NAME?.trim() ?? "";
const API_KEY = () => process.env.CLOUDINARY_API_KEY?.trim() ?? "";
const API_SECRET = () => process.env.CLOUDINARY_API_SECRET?.trim() ?? "";

/** True when upload credentials are present (real mode); else unavailable. */
export function cloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME() && API_KEY() && API_SECRET());
}

/** Signature timestamp: Unix seconds, as Cloudinary's signing spec requires. */
function timestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function sign(params: Record<string, string>): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(`${toSign}${API_SECRET()}`).digest("hex");
}

async function call<T>(form: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(form);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME()}/image/upload`, {
    method: "POST",
    body,
    // Provider errors must surface as real failures, not silent degradation.
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || data.error) {
    const msg =
      typeof data.error === "object" && data.error !== null && "message" in data.error
        ? String((data.error as { message: unknown }).message)
        : `cloudinary_http_${res.status}`;
    throw new Error(`cloudinary_error: ${msg}`);
  }
  return data as unknown as T;
}

interface UploadResult {
  publicId: string;
  bytes: number;
  width: number;
  height: number;
  format: string;
}

/**
 * Strict signed upload: private delivery, limited transformations, explicit
 * return of only the fields Atlas keeps. Throws on any provider error.
 */
export async function uploadGarmentImage(opts: {
  bytes: Uint8Array;
  mime: string;
  ownerHash: string;
}): Promise<UploadResult> {
  if (!cloudinaryConfigured()) {
    // Never silently downgrade to a placeholder path.
    throw new Error("cloudinary_not_configured");
  }
  const folder = `atlas/garments/${opts.ownerHash}`;
  const timestampStr = String(timestamp());
  const params: Record<string, string> = {
    folder,
    timestamp: timestampStr,
    type: "private",
    eager: "c_limit,w_1600,h_1600,q_auto:good",
    eager_async: "false",
  };
  const signature = sign(params);

  const data = await call<Record<string, unknown>>({
    file: `data:${opts.mime};base64,${Buffer.from(opts.bytes).toString("base64")}`,
    api_key: API_KEY(),
    ...params,
    signature,
  });

  if (typeof data.public_id !== "string" || typeof data.bytes !== "number") {
    throw new Error("cloudinary_error: malformed_response");
  }
  return {
    publicId: data.public_id,
    bytes: data.bytes,
    width: typeof data.width === "number" ? data.width : 0,
    height: typeof data.height === "number" ? data.height : 0,
    format: String(data.format ?? ""),
  };
}

/** Permanent delete from the provider. Throws on failure (audit shows it). */
export async function destroyImage(publicId: string): Promise<void> {
  if (!cloudinaryConfigured()) throw new Error("cloudinary_not_configured");
  const timestampStr = String(timestamp());
  const params = { public_id: publicId, timestamp: timestampStr, type: "private" };
  const signature = sign(params);
  const body = new URLSearchParams({
    public_id: publicId,
    type: "private",
    api_key: API_KEY(),
    timestamp: timestampStr,
    signature,
  });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME()}/image/destroy`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || data.result !== "ok") {
    throw new Error(`cloudinary_destroy_failed: ${String(data.result ?? res.status)}`);
  }
}

const FORMAT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/**
 * Expiring private download URL (Cloudinary's private_download_url shape:
 * the /image/download endpoint, signed, with expires_at). Never cached by SW.
 */
export function signedDeliveryUrl(publicId: string, mime: string, ttlSeconds = 3600): string {
  const now = timestamp();
  const params: Record<string, string> = {
    expires_at: String(now + ttlSeconds),
    format: FORMAT_BY_MIME[mime] ?? "jpg",
    public_id: publicId,
    timestamp: String(now),
    type: "private",
  };
  const query = new URLSearchParams({ ...params, signature: sign(params), api_key: API_KEY() });
  return `https://api.cloudinary.com/v1_1/${CLOUD_NAME()}/image/download?${query.toString()}`;
}

/** HMAC of the principal id for folder namespacing (no raw ids at provider). */
export function ownerHash(principalId: string): string {
  return createHash("sha256").update(principalId).digest("hex").slice(0, 24);
}
