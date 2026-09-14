import crypto from "node:crypto";
import { storagePut } from "./storage";

export type StoredAsset = { url: string; key: string; provider: "cloudinary" | "manus" };

function cloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

function cloudinarySignature(params: Record<string, string>) {
  const canonical = Object.entries(params).filter(([, value]) => value !== "").sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&");
  return crypto.createHash("sha1").update(`${canonical}${process.env.CLOUDINARY_API_SECRET}`).digest("hex");
}

export async function storeImage(key: string, buffer: Buffer, mimeType: string): Promise<StoredAsset> {
  if (cloudinaryConfigured()) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const folder = process.env.CLOUDINARY_FOLDER ?? "dripadvisor";
    const params = { folder, timestamp };
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), key);
    form.append("api_key", process.env.CLOUDINARY_API_KEY!);
    form.append("timestamp", timestamp);
    form.append("folder", folder);
    form.append("signature", cloudinarySignature(params));
    const response = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: "POST", body: form });
    if (!response.ok) throw new Error(`Cloudinary upload failed (${response.status})`);
    const payload = await response.json() as { secure_url: string; public_id: string };
    return { url: payload.secure_url, key: payload.public_id, provider: "cloudinary" };
  }
  const stored = await storagePut(key, buffer, mimeType);
  return { url: stored.url, key: stored.key, provider: "manus" };
}

export function assetProvider() {
  return cloudinaryConfigured() ? "cloudinary" : "manus" as const;
}
