"use node";

import { Jimp } from "jimp";

/**
 * Image helpers for the AI pipeline, in pure JavaScript (jimp) so they run identically on Windows,
 * Linux and Convex Cloud with no native modules. The browser already normalises uploads (EXIF
 * orientation applied, metadata stripped, ≤ 2048 px JPEG); this layer re-decodes every image before
 * any provider sees it, so forged types or oversized images never get through.
 */

const MAX_PIXELS = 40_000_000;
type Img = Awaited<ReturnType<typeof Jimp.read>>;

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

async function decode(bytes: ArrayBuffer | Buffer): Promise<Img> {
  let image: Img;
  try {
    image = await Jimp.read(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  } catch {
    throw new InvalidImageError("That photo couldn't be read. Use a JPEG or PNG.");
  }
  if (image.mime !== "image/jpeg" && image.mime !== "image/png") throw new InvalidImageError("Use a JPEG or PNG photo.");
  if (image.bitmap.width * image.bitmap.height > MAX_PIXELS) throw new InvalidImageError("That photo is too large.");
  return image;
}

function onWhite(image: Img) {
  const background = new Jimp({ width: image.bitmap.width, height: image.bitmap.height, color: 0xffffffff });
  background.composite(image, 0, 0);
  return background;
}

/** Decode, cap the longest edge, re-encode (JPEG flattened on white, or PNG keeping alpha). */
export async function normalize(bytes: ArrayBuffer, maxEdge: number, format: "jpeg" | "png" = "jpeg"): Promise<Buffer> {
  const image = await decode(bytes);
  if (Math.max(image.bitmap.width, image.bitmap.height) > maxEdge) image.scaleToFit({ w: maxEdge, h: maxEdge });
  return format === "png" ? image.getBuffer("image/png") : onWhite(image).getBuffer("image/jpeg", { quality: 85 });
}

/** Crop a normalised [x0,y0,x1,y1] box (0..1) with padding; returns a PNG. */
export async function cropBox(png: Buffer, bbox: number[], pad = 0.06): Promise<Buffer> {
  const image = await decode(png);
  const { width: w, height: h } = image.bitmap;
  const [x0 = 0, y0 = 0, x1 = 1, y1 = 1] = bbox;
  const left = Math.max(0, Math.floor((Math.min(x0, x1) - pad) * w));
  const top = Math.max(0, Math.floor((Math.min(y0, y1) - pad) * h));
  const right = Math.min(w, Math.ceil((Math.max(x0, x1) + pad) * w));
  const bottom = Math.min(h, Math.ceil((Math.max(y0, y1) + pad) * h));
  // right ≤ w and bottom ≤ h, so the crop never reads past the image; tiny boxes keep the whole photo.
  if (right - left >= 16 && bottom - top >= 16) image.crop({ x: left, y: top, w: right - left, h: bottom - top });
  return image.getBuffer("image/png");
}

/** Nova Canvas input rules: each side 320–4096 and divisible by 16, < 4.19 MP, no transparency. */
export async function fitForCanvas(png: Buffer, maxEdge = 1024): Promise<Buffer> {
  const image = await decode(png);
  image.scaleToFit({ w: maxEdge, h: maxEdge });
  const round = (n: number) => Math.max(320, Math.ceil(n / 16) * 16);
  const canvas = new Jimp({ width: round(image.bitmap.width), height: round(image.bitmap.height), color: 0xffffffff });
  canvas.composite(image, Math.floor((canvas.bitmap.width - image.bitmap.width) / 2), Math.floor((canvas.bitmap.height - image.bitmap.height) / 2));
  return canvas.getBuffer("image/png");
}

/** Up to three dominant colours of the opaque, non-white pixels, as #rrggbb. */
export async function dominantHex(png: Buffer, count = 3): Promise<string[]> {
  const image = await decode(png);
  image.scaleToFit({ w: 96, h: 96 });
  const data = image.bitmap.data;
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let o = 0; o + 3 < data.length; o += 4) {
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    if ((data[o + 3] ?? 0) < 200 || (r > 245 && g > 245 && b > 245)) continue;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bin.n += 1;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
  }
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return [...bins.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((bin) => `#${hex(bin.r / bin.n)}${hex(bin.g / bin.n)}${hex(bin.b / bin.n)}`);
}

/** 64-bit difference hash (dHash) as 16 hex chars, for near-duplicate detection. */
export async function dHash(png: Buffer): Promise<string> {
  const image = onWhite(await decode(png));
  image.greyscale().resize({ w: 9, h: 8 });
  const data = image.bitmap.data;
  const lum = (x: number, y: number) => data[(y * 9 + x) * 4] ?? 0;
  let bits = "";
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bits += lum(x, y) > lum(x + 1, y) ? "1" : "0";
  let out = "";
  for (let i = 0; i < 64; i += 4) out += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return out;
}
