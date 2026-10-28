"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCheck, EyeOff, Plus, RotateCcw, Search, Shirt, Trash2, WashingMachine, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Empty, PageHead, SkeletonGrid, Spinner, useRun } from "@/components/ui";
import { CATEGORY_OPTIONS, ItemTile, LAUNDRY_LABEL } from "@/components/wardrobe";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Laundry = keyof typeof LAUNDRY_LABEL;

function Wardrobe() {
  const params = useSearchParams();
  const router = useRouter();
  const category = params.get("category") ?? "";
  const laundry = (params.get("laundry") ?? "") as Laundry | "";
  const unworn = params.get("unworn") ?? "";
  const [text, setText] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<Id<"items">>>(new Set());

  const all = useQuery(api.items.list, {});
  const found = useQuery(api.items.search, text.trim() ? { text } : "skip");
  const processing = useQuery(api.items.list, { status: "extracting" });
  const failed = useQuery(api.items.list, { status: "failed" });
  const setLaundry = useMutation(api.items.setLaundry);
  const setStatus = useMutation(api.items.setStatus);
  const remove = useMutation(api.items.remove);
  const markWorn = useMutation(api.items.markWorn);
  const retry = useMutation(api.items.retryExtract);
  const addSamples = useAction(api.samples.add);
  const sampleIds = (all ?? []).filter((i) => i.sample).map((i) => i._id);
  const { run, busy } = useRun();

  const items = useMemo(() => {
    const source = text.trim() ? found : all;
    const cutoff = Date.now() - 90 * 86_400_000;
    return source?.filter(
      (i) =>
        (!category || i.category === category) &&
        (!laundry || i.laundry === laundry) &&
        (unworn !== "never" || i.wearCount === 0) &&
        (unworn !== "90" || (i.lastWornAt ?? 0) < cutoff),
    );
  }, [all, found, text, category, laundry, unworn]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/wardrobe${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const toggle = (id: Id<"items">) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const finish = () => {
    setSelected(new Set());
    setSelecting(false);
  };
  const ids = [...selected];

  return (
    <div className="page">
      <PageHead
        eyebrow="Wardrobe"
        title="Everything you own."
        sub={all ? `${all.length} piece${all.length === 1 ? "" : "s"}` : undefined}
        actions={
          <>
            {(all?.length ?? 0) > 0 && (
              <button type="button" className="btn" onClick={() => (selecting ? finish() : setSelecting(true))}>
                {selecting ? "Done" : "Select"}
              </button>
            )}
            <Link href="/wardrobe/add" className="btn-primary">
              <Plus size={16} aria-hidden="true" /> Add clothes
            </Link>
          </>
        }
      />

      {sampleIds.length > 0 && (
        <div className="notice notice-accent mb-4 flex items-center gap-3 flex-wrap">
          <span className="flex-1">
            {sampleIds.length} sample piece{sampleIds.length === 1 ? "" : "s"} are illustrations to explore with. Add your own photos to try looks on.
          </span>
          <button type="button" className="btn !min-h-8" disabled={busy} onClick={() => run(() => remove({ itemIds: sampleIds }), "Sample pieces removed")}>
            Remove samples
          </button>
        </div>
      )}
      {(processing?.length ?? 0) > 0 && (
        <div className="notice notice-accent mb-4 flex items-center gap-2">
          <Spinner /> Cutting out {processing!.length} piece{processing!.length === 1 ? "" : "s"}… they appear here when ready.
        </div>
      )}
      {(failed?.length ?? 0) > 0 && (
        <div className="notice notice-warn mb-4 flex items-center gap-2 flex-wrap">
          <AlertTriangle size={16} aria-hidden="true" /> {failed!.length} piece{failed!.length === 1 ? "" : "s"} couldn't be processed.
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => run(async () => { for (const f of failed!) await retry({ itemId: f._id }); }, "Retrying")}
          >
            <RotateCcw size={14} aria-hidden="true" /> Retry
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(() => remove({ itemIds: failed!.map((f) => f._id) }), "Removed")}>
            Remove
          </button>
        </div>
      )}

      <div className="toolbar">
        <label className="search">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Search wardrobe</span>
          <input className="input" type="search" placeholder="Search — “navy linen”, “boots”…" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="segmented" role="radiogroup" aria-label="Laundry">
          {([["", "All"], ["clean", "Clean"], ["worn", "Worn"], ["in_wash", "Washing"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={laundry === value} onClick={() => setFilter("laundry", value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="chip-row mb-5" role="group" aria-label="Category">
        <button type="button" className="chip" aria-pressed={!category} onClick={() => setFilter("category", "")}>
          All
        </button>
        {CATEGORY_OPTIONS.map(([value, label]) => (
          <button key={value} type="button" className="chip" aria-pressed={category === value} onClick={() => setFilter("category", category === value ? "" : value)}>
            {label}
          </button>
        ))}
        <span className="w-px bg-[var(--color-line-strong)] flex-none my-1" aria-hidden="true" />
        <button type="button" className="chip" aria-pressed={unworn === "never"} onClick={() => setFilter("unworn", unworn === "never" ? "" : "never")}>
          Never worn
        </button>
        <button type="button" className="chip" aria-pressed={unworn === "90"} onClick={() => setFilter("unworn", unworn === "90" ? "" : "90")}>
          Not worn in 90 days
        </button>
      </div>

      {items === undefined ? (
        <SkeletonGrid />
      ) : all?.length === 0 ? (
        <Empty
          icon={Shirt}
          title="Your wardrobe is empty"
          body="Add a few photos of your clothes. Atlas finds every piece, removes the background and tags colour, fabric and season."
          action={{ href: "/wardrobe/add", label: "Add clothes" }}
        >
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => addSamples({}), "Sample wardrobe added")}>
            Try a sample wardrobe
          </button>
        </Empty>
      ) : items.length === 0 ? (
        <Empty icon={Search} title="Nothing matches" body="Try another word or clear the filters." />
      ) : (
        <div className="tile-grid">
          {items.map((item) => (
            <ItemTile key={item._id} item={item} selected={selected.has(item._id)} onToggle={selecting ? () => toggle(item._id) : undefined} />
          ))}
        </div>
      )}

      {selecting && ids.length > 0 && (
        <div className="action-bar" role="toolbar" aria-label="Selected pieces">
          <span className="action-bar-count">{ids.length} selected</span>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => run(() => markWorn({ itemIds: ids, idempotencyKey: crypto.randomUUID() }), "Logged as worn today").then(finish)}
          >
            <CheckCheck size={16} aria-hidden="true" /> Wore today
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => setLaundry({ itemIds: ids, laundry: "in_wash" }), "In the wash").then(finish)}>
            <WashingMachine size={16} aria-hidden="true" /> Wash
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => setLaundry({ itemIds: ids, laundry: "clean" }), "Marked clean").then(finish)}>
            Clean
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => setStatus({ itemIds: ids, status: "hidden" }), "Hidden").then(finish)}>
            <EyeOff size={16} aria-hidden="true" /> Hide
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            onClick={() => {
              if (confirm(`Delete ${ids.length} piece${ids.length === 1 ? "" : "s"}? Photos are removed too.`)) void run(() => remove({ itemIds: ids }), "Deleted").then(finish);
            }}
          >
            <Trash2 size={16} aria-hidden="true" /> Delete
          </button>
          <button type="button" className="btn-ghost" aria-label="Clear selection" onClick={finish}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function WardrobePage() {
  return (
    <Suspense fallback={<div className="page"><SkeletonGrid /></div>}>
      <Wardrobe />
    </Suspense>
  );
}
