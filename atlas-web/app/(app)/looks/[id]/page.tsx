"use client";

import { useMutation, useQuery } from "convex/react";
import { Bookmark, CheckCheck, Link2, Link2Off, Pencil, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { OutfitBuilder } from "@/components/OutfitBuilder";
import { Empty, JobProgress, PageHead, PageLoading, relativeTime, toast, useRun } from "@/components/ui";
import { ItemTile } from "@/components/wardrobe";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function TryOns({ outfitId }: { outfitId: Id<"outfits"> }) {
  const renders = useQuery(api.renders.byOutfit, { outfitId });
  const readiness = useQuery(api.renders.readiness);
  const start = useMutation(api.renders.start);
  const share = useMutation(api.renders.share);
  const unshare = useMutation(api.renders.unshare);
  const remove = useMutation(api.renders.remove);
  const { run, busy } = useRun();
  const pending = renders?.some((r) => r.status === "pending");

  const copyLink = async (renderId: Id<"renders">) => {
    const token = await run(() => share({ renderId }));
    if (!token) return;
    const url = `${location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied — it expires in 7 days");
    } catch {
      prompt("Copy this link (expires in 7 days):", url);
    }
  };

  return (
    <section className="section">
      <h2 className="section-title">Try-on</h2>
      <div className="card card-pad stack-sm mb-4">
        {readiness?.ready ? (
          <p className="muted">See this look on your own photo. Each piece is layered on in turn, so it takes a minute.</p>
        ) : (
          <p className="muted">{readiness?.reason ?? "Checking…"}</p>
        )}
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn-primary" disabled={busy || !readiness?.ready || pending} onClick={() => run(() => start({ outfitId }), "Try-on started")}>
            <Wand2 size={16} aria-hidden="true" /> {pending ? "Trying on…" : "Try on"}
          </button>
          {!readiness?.ready && (
            <Link href="/settings/photos" className="btn">
              Set up your photo
            </Link>
          )}
        </div>
      </div>
      {renders && renders.length > 0 && (
        <div className="tile-grid">
          {renders.map((r) => (
            <div key={r._id} className="tile cursor-default">
              <div className="tile-media cover">
                {r.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL
                  <img src={r.url} alt="This look on your photo" />
                ) : r.status === "failed" ? (
                  <p className="muted p-4 text-center">{r.error ?? "Try-on failed."}</p>
                ) : (
                  <div className="p-4 w-full">
                    <JobProgress job={r.job} />
                  </div>
                )}
              </div>
              <div className="tile-body flex items-center gap-1">
                <span className="tile-meta flex-1">{relativeTime(r.createdAt)}</span>
                {r.status === "done" &&
                  (r.shareToken && (r.shareExpiresAt ?? 0) > Date.now() ? (
                    <button type="button" className="btn-ghost !px-2" aria-label="Stop sharing" title="Stop sharing" disabled={busy} onClick={() => run(() => unshare({ renderId: r._id }), "Link turned off")}>
                      <Link2Off size={16} aria-hidden="true" />
                    </button>
                  ) : (
                    <button type="button" className="btn-ghost !px-2" aria-label="Copy share link" title="Share" disabled={busy} onClick={() => copyLink(r._id)}>
                      <Link2 size={16} aria-hidden="true" />
                    </button>
                  ))}
                {r.status !== "pending" && (
                  <button type="button" className="btn-ghost !px-2" aria-label="Delete try-on" disabled={busy} onClick={() => run(() => remove({ renderId: r._id }), "Deleted")}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function LookPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const outfit = useQuery(api.outfits.get, { outfitId: id });
  const save = useMutation(api.outfits.save);
  const remove = useMutation(api.outfits.remove);
  const markWorn = useMutation(api.items.markWorn);
  const { run, busy } = useRun();
  const [editing, setEditing] = useState(false);

  if (outfit === undefined) return <PageLoading />;
  if (outfit === null) {
    return (
      <div className="page page-narrow">
        <Empty title="Look not found" body="It may have been deleted." action={{ href: "/looks", label: "Back to looks" }} />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="page">
        <PageHead title="Edit look" crumb={{ href: `/looks/${outfit._id}`, label: outfit.name }} />
        <OutfitBuilder outfitId={outfit._id} initial={{ name: outfit.name, occasion: outfit.occasion, slots: outfit.slots }} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead
        title={outfit.name}
        crumb={{ href: "/looks", label: "Looks" }}
        sub={[outfit.occasion, outfit.source === "agent" ? "Suggested by the stylist" : null, outfit.wearCount ? `Worn ${outfit.wearCount}×` : null].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            {!outfit.savedAt && (
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => save({ outfitId: outfit._id }), "Saved to Looks")}>
                <Bookmark size={16} aria-hidden="true" /> Save
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => run(() => markWorn({ itemIds: outfit.pieces.map((p) => p._id), outfitId: outfit._id, idempotencyKey: `${outfit._id}:${new Date().toDateString()}` }), "Logged as worn today")}
            >
              <CheckCheck size={16} aria-hidden="true" /> Wore it today
            </button>
          </>
        }
      />

      {outfit.reasoning && <p className="notice notice-accent mb-6">{outfit.reasoning}</p>}

      <section className="section">
        <h2 className="section-title">Pieces</h2>
        <div className="tile-grid">
          {outfit.pieces.map((p) => (
            <ItemTile key={p._id} item={p} />
          ))}
        </div>
      </section>

      <TryOns outfitId={outfit._id} />

      <div className="flex gap-2 flex-wrap">
        <Link href={`/ask?about=outfit:${outfit._id}`} className="btn">
          Ask the stylist
        </Link>
        <button type="button" className="btn" onClick={() => setEditing(true)}>
          <Pencil size={16} aria-hidden="true" /> Edit
        </button>
        <button
          type="button"
          className="btn-danger"
          disabled={busy}
          onClick={() => {
            if (confirm(`Delete “${outfit.name}” and its try-ons?`)) void run(() => remove({ outfitId: outfit._id }), "Look deleted").then((r) => r !== undefined && router.push("/looks"));
          }}
        >
          <Trash2 size={16} aria-hidden="true" /> Delete
        </button>
      </div>
    </div>
  );
}
