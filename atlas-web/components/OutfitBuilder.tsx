"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus, Shirt, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Empty, SkeletonGrid, useRun } from "@/components/ui";
import { ItemImage, ItemTile } from "@/components/wardrobe";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type Slots = Doc<"outfits">["slots"];
type Slot = "outerwear" | "top" | "bottom" | "dress" | "shoes" | "accessories";

const SLOTS: { slot: Slot; label: string; categories: string[] }[] = [
  { slot: "outerwear", label: "Outerwear", categories: ["outerwear"] },
  { slot: "top", label: "Top", categories: ["top"] },
  { slot: "bottom", label: "Bottom", categories: ["bottom"] },
  { slot: "dress", label: "Dress", categories: ["dress"] },
  { slot: "shoes", label: "Shoes", categories: ["shoes"] },
  { slot: "accessories", label: "Accessories", categories: ["accessory", "bag", "headwear"] },
];

export const EMPTY_SLOTS: Slots = { accessories: [] };

/** Pick one piece per slot from the wardrobe; the server re-validates everything on save. */
export function OutfitBuilder({ outfitId, initial }: { outfitId?: Id<"outfits">; initial?: { name: string; occasion?: string; slots: Slots } }) {
  const router = useRouter();
  const items = useQuery(api.items.list, {});
  const create = useMutation(api.outfits.create);
  const update = useMutation(api.outfits.update);
  const { run, busy } = useRun();
  const [name, setName] = useState(initial?.name ?? "");
  const [occasion, setOccasion] = useState(initial?.occasion ?? "");
  const [slots, setSlots] = useState<Slots>(initial?.slots ?? EMPTY_SLOTS);
  const [picking, setPicking] = useState<Slot>("top");

  const byId = new Map((items ?? []).map((i) => [i._id, i]));
  const choices = (items ?? []).filter((i) => SLOTS.find((s) => s.slot === picking)!.categories.includes(i.category));
  const chosen = (slot: Slot): Id<"items">[] => (slot === "accessories" ? slots.accessories : slots[slot] ? [slots[slot]!] : []);

  const choose = (id: Id<"items">) =>
    setSlots((prev) => {
      if (picking === "accessories") {
        const has = prev.accessories.includes(id);
        return { ...prev, accessories: has ? prev.accessories.filter((a) => a !== id) : [...prev.accessories, id].slice(0, 4) };
      }
      const next = { ...prev, [picking]: prev[picking] === id ? undefined : id };
      // A dress replaces top and bottom, and the reverse.
      if (picking === "dress" && next.dress) Object.assign(next, { top: undefined, bottom: undefined });
      if ((picking === "top" || picking === "bottom") && next[picking]) next.dress = undefined;
      return next;
    });
  const clear = (slot: Slot, id: Id<"items">) =>
    setSlots((prev) => (slot === "accessories" ? { ...prev, accessories: prev.accessories.filter((a) => a !== id) } : { ...prev, [slot]: undefined }));

  const count = SLOTS.reduce((n, s) => n + chosen(s.slot).length, 0);
  const save = async () => {
    const payload = { name: name.trim() || "Untitled look", slots, occasion: occasion.trim() || undefined };
    const id = await run(async () => {
      if (outfitId) {
        await update({ outfitId, ...payload });
        return outfitId;
      }
      return create(payload);
    }, "Look saved");
    if (id) router.push(`/looks/${id}`);
  };

  if (items === undefined) return <SkeletonGrid />;
  if (items.length === 0) {
    return <Empty icon={Shirt} title="Add clothes first" body="Looks are built from pieces in your wardrobe." action={{ href: "/wardrobe/add", label: "Add clothes" }} />;
  }

  return (
    <div className="detail-grid">
      <div className="stack-md lg:sticky lg:top-20">
        <div className="card card-pad form-stack">
          <label className="field">
            <span className="field-label">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday dinner" maxLength={60} />
          </label>
          <label className="field">
            <span className="field-label">Occasion (optional)</span>
            <input className="input" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Work, date, wedding…" maxLength={60} />
          </label>
        </div>
        <ul className="grouped-list">
          {SLOTS.map(({ slot, label }) => (
            <li key={slot}>
              <div className={`grouped-row ${picking === slot ? "bg-[var(--color-accent-soft)]" : ""}`}>
                <button type="button" className="flex-1 flex items-center gap-3 bg-transparent border-0 p-0 text-left cursor-pointer min-h-[var(--tap)]" onClick={() => setPicking(slot)}>
                  <span className="grouped-label font-medium">{label}</span>
                  {chosen(slot).length === 0 && (
                    <span className="grouped-detail flex items-center gap-1">
                      <Plus size={14} aria-hidden="true" /> Choose
                    </span>
                  )}
                </button>
                {chosen(slot).map((id) => {
                  const item = byId.get(id);
                  return (
                    <span key={id} className="relative w-12 h-12 rounded-[10px] bg-[var(--color-surface-raised)] grid place-items-center overflow-hidden [&>img]:w-full [&>img]:h-full [&>img]:object-contain">
                      <ItemImage url={item?.url ?? null} name={item?.name ?? "Piece"} />
                      <button type="button" className="absolute -top-0 -right-0 w-5 h-5 rounded-full bg-[var(--color-ink)] text-[var(--color-bg)] grid place-items-center border-0" aria-label={`Remove ${item?.name ?? "piece"}`} onClick={() => clear(slot, id)}>
                        <X size={12} aria-hidden="true" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-primary" disabled={busy || count === 0} onClick={save}>
          {outfitId ? "Save changes" : `Save look${count ? ` (${count} piece${count === 1 ? "" : "s"})` : ""}`}
        </button>
      </div>

      <section aria-label={`Choose ${picking}`}>
        <h2 className="section-title">Choose {SLOTS.find((s) => s.slot === picking)!.label.toLowerCase()}</h2>
        {choices.length === 0 ? (
          <Empty title="Nothing in this category" body="Add pieces like this to your wardrobe, or pick another slot." />
        ) : (
          <div className="tile-grid">
            {choices.map((item) => (
              <ItemTile key={item._id} item={item} selected={chosen(picking).includes(item._id)} onToggle={() => choose(item._id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
