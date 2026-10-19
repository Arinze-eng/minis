"use client";

import { useMutation, useQuery } from "convex/react";
import { CheckCheck, Copy, EyeOff, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Empty, PageHead, PageLoading, relativeTime, useRun } from "@/components/ui";
import { CATEGORY_OPTIONS, ItemImage, LAUNDRY_LABEL } from "@/components/wardrobe";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatMoney } from "@/lib/format";

const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
const FORMALITY = ["casual", "smart-casual", "formal"] as const;

function EditForm({ item, onDone }: { item: Doc<"items">; onDone: () => void }) {
  const update = useMutation(api.items.update);
  const { run, busy } = useRun();
  const [seasons, setSeasons] = useState<Set<string>>(new Set(item.seasons));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const price = text("price") ? Number(text("price")) : undefined;
    const ok = await run(
      () =>
        update({
          itemId: item._id,
          patch: {
            name: text("name"),
            category: text("category") as Doc<"items">["category"],
            colours: { ...item.colours, primary: text("colour") || item.colours.primary },
            material: text("material"),
            pattern: text("pattern"),
            formality: text("formality") as Doc<"items">["formality"],
            seasons: [...seasons] as Doc<"items">["seasons"],
            brand: text("brand") || undefined,
            notes: text("notes") || undefined,
            price: price !== undefined && Number.isFinite(price) && price >= 0 ? price : undefined,
            currency: price !== undefined ? text("currency") || "USD" : undefined,
          },
        }),
      "Saved",
    );
    if (ok !== undefined) onDone();
  };

  return (
    <form className="card card-pad form-stack" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Name</span>
        <input className="input" name="name" defaultValue={item.name} required maxLength={80} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span className="field-label">Category</span>
          <select className="input" name="category" defaultValue={item.category}>
            {CATEGORY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Formality</span>
          <select className="input" name="formality" defaultValue={item.formality}>
            {FORMALITY.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Colour</span>
          <input className="input" name="colour" defaultValue={item.colours.primary} maxLength={30} />
        </label>
        <label className="field">
          <span className="field-label">Material</span>
          <input className="input" name="material" defaultValue={item.material} maxLength={40} />
        </label>
        <label className="field">
          <span className="field-label">Pattern</span>
          <input className="input" name="pattern" defaultValue={item.pattern} maxLength={40} />
        </label>
        <label className="field">
          <span className="field-label">Brand</span>
          <input className="input" name="brand" defaultValue={item.brand} maxLength={60} />
        </label>
        <label className="field">
          <span className="field-label">Price</span>
          <input className="input" name="price" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={item.price} />
        </label>
        <label className="field">
          <span className="field-label">Currency</span>
          <input className="input uppercase" name="currency" defaultValue={item.currency ?? "USD"} maxLength={3} pattern="[A-Za-z]{3}" />
        </label>
      </div>
      <fieldset className="field border-0 p-0 m-0">
        <legend className="field-label mb-1.5">Seasons</legend>
        <div className="chip-row">
          {SEASONS.map((s) => (
            <button
              key={s}
              type="button"
              className="chip capitalize"
              aria-pressed={seasons.has(s)}
              onClick={() =>
                setSeasons((prev) => {
                  const next = new Set(prev);
                  if (next.has(s)) next.delete(s);
                  else next.add(s);
                  return next;
                })
              }
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span className="field-label">Notes</span>
        <textarea className="textarea" name="notes" rows={2} defaultValue={item.notes} maxLength={500} />
      </label>
      <div className="form-submit">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          Save
        </button>
      </div>
    </form>
  );
}

export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const data = useQuery(api.items.get, { itemId: id });
  const setLaundry = useMutation(api.items.setLaundry);
  const markWorn = useMutation(api.items.markWorn);
  const setStatus = useMutation(api.items.setStatus);
  const remove = useMutation(api.items.remove);
  const dismissDuplicate = useMutation(api.items.dismissDuplicate);
  const { run, busy } = useRun();
  const [editing, setEditing] = useState(false);

  if (data === undefined) return <PageLoading />;
  if (data === null) {
    return (
      <div className="page page-narrow">
        <Empty title="Piece not found" body="It may have been deleted." action={{ href: "/wardrobe", label: "Back to wardrobe" }} />
      </div>
    );
  }
  const { item, duplicateOf, outfits } = data;
  const cpw = item.price ? (item.wearCount ? item.price / item.wearCount : item.price) : null;

  return (
    <div className="page">
      <PageHead
        title={item.name}
        crumb={{ href: "/wardrobe", label: "Wardrobe" }}
        sub={<span className="capitalize">{[item.colours.primary, item.material, item.subcategory || item.category].filter(Boolean).join(" · ")}</span>}
        actions={
          !editing && (
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              <Pencil size={16} aria-hidden="true" /> Edit
            </button>
          )
        }
      />

      {duplicateOf && (
        <div className="notice notice-warn mb-5 flex items-center gap-3 flex-wrap">
          <Copy size={16} aria-hidden="true" />
          <span className="flex-1">
            This looks like <Link href={`/wardrobe/${duplicateOf._id}`} className="inline-link">{duplicateOf.name}</Link>, which you already have.
          </span>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(() => dismissDuplicate({ itemId: item._id }), "Kept both")}>
            Keep both
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => run(() => remove({ itemIds: [item._id] }), "Duplicate removed").then((r) => r !== undefined && router.replace(`/wardrobe/${duplicateOf._id}`))}
          >
            Remove this one
          </button>
        </div>
      )}

      <div className="detail-grid">
        <div className="hero-media">
          <ItemImage url={item.url} name={item.name} />
        </div>

        <div className="stack-md">
          {editing ? (
            <EditForm item={item} onDone={() => setEditing(false)} />
          ) : (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <span className="stat-label">Worn</span>
                  <span className="stat-value">{item.wearCount}×</span>
                  <span className="stat-note">{item.lastWornAt ? `Last ${relativeTime(item.lastWornAt)}` : "Not yet"}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Cost per wear</span>
                  <span className="stat-value">{cpw !== null ? formatMoney(cpw, item.currency ?? "USD") : "—"}</span>
                  <span className="stat-note">{item.price ? `Paid ${formatMoney(item.price, item.currency ?? "USD")}` : "Add a price to track"}</span>
                </div>
              </div>

              <div className="card card-pad stack-sm">
                <span className="field-label">Laundry</span>
                <div className="segmented" role="radiogroup" aria-label="Laundry">
                  {(Object.keys(LAUNDRY_LABEL) as (keyof typeof LAUNDRY_LABEL)[]).map((l) => (
                    <button key={l} type="button" role="radio" aria-checked={item.laundry === l} disabled={busy} onClick={() => run(() => setLaundry({ itemIds: [item._id], laundry: l }))}>
                      {LAUNDRY_LABEL[l]}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-primary mt-2"
                  disabled={busy}
                  onClick={() => run(() => markWorn({ itemIds: [item._id], idempotencyKey: crypto.randomUUID() }), "Logged as worn today")}
                >
                  <CheckCheck size={16} aria-hidden="true" /> I wore this today
                </button>
              </div>

              <dl className="card card-pad kv">
                <dt>Category</dt>
                <dd>{item.category}</dd>
                <dt>Formality</dt>
                <dd>{item.formality}</dd>
                <dt>Seasons</dt>
                <dd>{item.seasons.join(", ") || "—"}</dd>
                <dt>Pattern</dt>
                <dd>{item.pattern || "—"}</dd>
                {item.brand && (
                  <>
                    <dt>Brand</dt>
                    <dd className="!normal-case">{item.brand}</dd>
                  </>
                )}
                {item.colours.hex.length > 0 && (
                  <>
                    <dt>Palette</dt>
                    <dd className="flex gap-1.5">
                      {item.colours.hex.map((h) => (
                        <span key={h} className="swatch !w-5 !h-5" style={{ background: h }} title={h} />
                      ))}
                    </dd>
                  </>
                )}
                {item.notes && (
                  <>
                    <dt>Notes</dt>
                    <dd className="!normal-case">{item.notes}</dd>
                  </>
                )}
              </dl>

              {outfits.length > 0 && (
                <div className="card card-pad">
                  <span className="field-label">In {outfits.length} look{outfits.length === 1 ? "" : "s"}</span>
                  <div className="pill-row mt-2">
                    {outfits.map((o) => (
                      <Link key={o._id} href={`/looks/${o._id}`} className="chip no-underline">
                        {o.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Link href={`/looks/new?with=${item._id}`} className="btn-secondary">
                  Style this piece
                </Link>
                <button type="button" className="btn" disabled={busy} onClick={() => run(() => setStatus({ itemIds: [item._id], status: "hidden" }), "Hidden from your wardrobe").then((r) => r !== undefined && router.push("/wardrobe"))}>
                  <EyeOff size={16} aria-hidden="true" /> Hide
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Delete “${item.name}”? It's removed from every look too.`)) void run(() => remove({ itemIds: [item._id] }), "Deleted").then((r) => r !== undefined && router.push("/wardrobe"));
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
