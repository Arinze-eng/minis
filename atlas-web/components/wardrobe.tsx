"use client";

import { Check, Shirt, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";

export const CATEGORY_OPTIONS = [
  ["top", "Tops"],
  ["bottom", "Bottoms"],
  ["outerwear", "Outerwear"],
  ["dress", "Dresses"],
  ["shoes", "Shoes"],
  ["accessory", "Accessories"],
  ["bag", "Bags"],
  ["headwear", "Headwear"],
] as const;

export const LAUNDRY_LABEL = { clean: "Clean", worn: "Worn", in_wash: "In the wash" } as const;

export type TileItem = {
  _id: Id<"items">;
  name: string;
  category: string;
  url: string | null;
  laundry?: string;
  wearCount?: number;
  colours?: { primary: string; hex: string[] };
  status?: string;
};

export function ItemImage({ url, name }: { url: string | null; name: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- Convex storage URLs, already sized
  return url ? <img src={url} alt={name} loading="lazy" decoding="async" /> : <Shirt size={32} aria-hidden="true" />;
}

/** A wardrobe tile. With `onToggle` it is a selectable button; otherwise a link to the item. */
export function ItemTile({ item, selected, onToggle, href }: { item: TileItem; selected?: boolean; onToggle?: () => void; href?: string }) {
  const body = (
    <>
      <div className="tile-media">
        <ItemImage url={item.url} name={item.name} />
        {item.laundry && item.laundry !== "clean" && (
          <span className={`tile-badge badge ${item.laundry === "in_wash" ? "badge-accent" : "badge-alert"}`}>{LAUNDRY_LABEL[item.laundry as keyof typeof LAUNDRY_LABEL]}</span>
        )}
        {onToggle && <span className="tile-check" aria-hidden="true">{selected && <Check size={15} strokeWidth={3} />}</span>}
      </div>
      <div className="tile-body">
        <div className="tile-title">{item.name}</div>
        <div className="tile-meta">
          {item.colours?.hex[0] && <span className="swatch inline-block align-[-2px] mr-1.5" style={{ background: item.colours.hex[0] }} aria-hidden="true" />}
          {item.colours?.primary ? `${item.colours.primary} · ` : ""}
          {item.wearCount !== undefined ? `${item.wearCount} wear${item.wearCount === 1 ? "" : "s"}` : item.category}
        </div>
      </div>
    </>
  );
  if (onToggle) {
    return (
      <button type="button" className="tile" aria-pressed={Boolean(selected)} onClick={onToggle}>
        {body}
      </button>
    );
  }
  return (
    <Link href={href ?? `/wardrobe/${item._id}`} className="tile">
      {body}
    </Link>
  );
}

export type TileOutfit = {
  _id: Id<"outfits">;
  name: string;
  occasion?: string;
  source: string;
  coverUrl: string | null;
  pieces: { _id: Id<"items">; name: string; url: string | null }[];
};

/** The try-on render when there is one, else a collage of the first four pieces. */
export function OutfitTile({ outfit }: { outfit: TileOutfit }) {
  return (
    <Link href={`/looks/${outfit._id}`} className="tile">
      <div className={`tile-media cover`}>
        {outfit.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL
          <img src={outfit.coverUrl} alt={`${outfit.name}, tried on`} loading="lazy" />
        ) : (
          <div className="collage w-full h-full">
            {outfit.pieces.slice(0, 4).map((p) => (
              <ItemImage key={p._id} url={p.url} name={p.name} />
            ))}
          </div>
        )}
        {outfit.source === "agent" && (
          <span className="tile-badge badge badge-accent">
            <Sparkles size={11} aria-hidden="true" /> Stylist
          </span>
        )}
      </div>
      <div className="tile-body">
        <div className="tile-title">{outfit.name}</div>
        <div className="tile-meta">{outfit.occasion || `${outfit.pieces.length} piece${outfit.pieces.length === 1 ? "" : "s"}`}</div>
      </div>
    </Link>
  );
}

/** Small row of piece thumbnails (chat proposals, notifications). */
export function OutfitStrip({ pieces }: { pieces: { _id: string; name: string; url: string | null }[] }) {
  return (
    <div className="outfit-strip">
      {pieces.map((p) =>
        p.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL
          <img key={p._id} src={p.url} alt={p.name} title={p.name} />
        ) : (
          <span key={p._id} className="ph grid place-items-center" title={p.name}>
            <Shirt size={20} aria-hidden="true" />
          </span>
        ),
      )}
    </div>
  );
}

/**
 * Re-encode a photo in the browser before upload: fixes EXIF rotation, strips metadata (GPS), caps the long
 * edge at 2048 px and outputs JPEG — so the server only ever sees small, clean images.
 */
export async function normalizePhoto(file: File, maxEdge = 2048): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read that photo"))), "image/jpeg", 0.88));
}

/** POST a blob to a Convex upload URL; returns the storage id. */
export async function uploadBlob(uploadUrl: string, blob: Blob): Promise<Id<"_storage">> {
  const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
  if (!res.ok) throw new Error("Upload failed");
  return ((await res.json()) as { storageId: Id<"_storage"> }).storageId;
}
