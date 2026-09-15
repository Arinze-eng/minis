import "server-only";

/**
 * Server-side image validation (threat model §6): MIME by magic bytes —
 * never by client-declared Content-Type — plus dimension decoding and
 * decompression-bomb bounds. Runs before any provider sees the bytes.
 */

export const IMAGE_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  minDimension: 64,
  maxDimension: 6000,
  maxMegapixels: 24,
} as const;

/** Safe byte read (noUncheckedIndexedAccess): out-of-range reads as 0. */
function at(bytes: Uint8Array, i: number): number {
  return bytes[i] ?? 0;
}

/** Bytes → sniffed mime; null when the signature matches nothing we accept. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (at(bytes, 0) === 0xff && at(bytes, 1) === 0xd8 && at(bytes, 2) === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    at(bytes, 0) === 0x89 && at(bytes, 1) === 0x50 && at(bytes, 2) === 0x4e &&
    at(bytes, 3) === 0x47 && at(bytes, 4) === 0x0d && at(bytes, 5) === 0x0a &&
    at(bytes, 6) === 0x1a && at(bytes, 7) === 0x0a
  ) {
    return "image/png";
  }
  // WebP: RIFF....WEBP
  if (
    at(bytes, 0) === 0x52 && at(bytes, 1) === 0x49 && at(bytes, 2) === 0x46 &&
    at(bytes, 3) === 0x46 && at(bytes, 8) === 0x57 && at(bytes, 9) === 0x45 &&
    at(bytes, 10) === 0x42 && at(bytes, 11) === 0x50
  ) {
    return "image/webp";
  }
  // HEIC: ftyp box with a heic/heix/mif1/hevc brand at offset 8.
  const brand = String.fromCharCode(at(bytes, 8), at(bytes, 9), at(bytes, 10), at(bytes, 11));
  if (
    at(bytes, 4) === 0x66 && at(bytes, 5) === 0x74 && at(bytes, 6) === 0x79 &&
    at(bytes, 7) === 0x70 && ["heic", "heix", "mif1", "hevc"].includes(brand)
  ) {
    return "image/heic";
  }
  return null;
}

export interface ImageCheck {
  ok: boolean;
  reason?: string;
  mime?: string;
  width?: number;
  height?: number;
}

/** Full server-side gate: magic bytes, dimensions, megapixel budget. */
export function validateImageBytes(bytes: Uint8Array, declaredMime: string): ImageCheck {
  if (bytes.length === 0) return { ok: false, reason: "empty_file" };
  if (bytes.length > IMAGE_LIMITS.maxBytes) return { ok: false, reason: "too_large" };
  const mime = sniffImageMime(bytes);
  if (!mime) return { ok: false, reason: "unsupported_or_corrupt" };
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
  if (!allowed.includes(mime)) return { ok: false, reason: "unsupported_type" };

  const dims = decodeDimensions(bytes, mime);
  if (!dims) return { ok: false, reason: "undecodable_dimensions", mime };
  const { width, height } = dims;
  if (
    width < IMAGE_LIMITS.minDimension || height < IMAGE_LIMITS.minDimension ||
    width > IMAGE_LIMITS.maxDimension || height > IMAGE_LIMITS.maxDimension ||
    (width * height) / 1_000_000 > IMAGE_LIMITS.maxMegapixels
  ) {
    return { ok: false, reason: "dimensions_out_of_bounds", mime, width, height };
  }
  // A lying Content-Type is a rejection, not a correction.
  const decl = declaredMime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (decl && decl !== mime && decl !== "application/octet-stream") {
    return { ok: false, reason: "mime_mismatch", mime, width, height };
  }
  return { ok: true, mime, width, height };
}

function decodeDimensions(
  bytes: Uint8Array,
  mime: string,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (mime === "image/png" && bytes.length >= 24) {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (mime === "image/webp" && bytes.length >= 30) {
      const format = String.fromCharCode(at(bytes, 12), at(bytes, 13), at(bytes, 14), at(bytes, 15));
      if (format === "VP8 ") {
        // Lossy VP8: 14-bit dims at offset 26.
        return {
          width: view.getUint16(26, true) & 0x3fff,
          height: view.getUint16(28, true) & 0x3fff,
        };
      }
      if (format === "VP8L") {
        const b = view.getUint32(21, true);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      if (format === "VP8X") {
        const w = 1 + (at(bytes, 24) | (at(bytes, 25) << 8) | (at(bytes, 26) << 16));
        const h = 1 + (at(bytes, 27) | (at(bytes, 28) << 8) | (at(bytes, 29) << 16));
        return { width: w, height: h };
      }
      return null;
    }
    if (mime === "image/jpeg") {
      // Walk JPEG segments for a SOF0–SOF3 marker.
      let off = 2;
      while (off + 9 < bytes.length) {
        if (at(bytes, off) !== 0xff) return null;
        const marker = at(bytes, off + 1);
        const len = view.getUint16(off + 2);
        if (marker >= 0xc0 && marker <= 0xc3) {
          return { height: view.getUint16(off + 5), width: view.getUint16(off + 7) };
        }
        off += 2 + len;
      }
      return null;
    }
    // HEIC: full dimension decode needs a HEIF parser; Cloudinary returns
    // real dimensions after upload. Accept the bytes; size is bounded by the
    // byte limit and the provider's eager transformation.
    if (mime === "image/heic") return { width: 0, height: 0 };
    return null;
  } catch {
    return null;
  }
}
