"use client";

import { useQuery } from "convex/react";
import { Images, Layers, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Empty, JobProgress, PageHead, relativeTime, SkeletonGrid } from "@/components/ui";
import { OutfitTile } from "@/components/wardrobe";
import { api } from "@/convex/_generated/api";

export default function LooksPage() {
  const [tab, setTab] = useState<"outfits" | "lookbook">("outfits");
  const outfits = useQuery(api.outfits.list);
  const renders = useQuery(api.renders.lookbook, tab === "lookbook" ? {} : "skip");

  return (
    <div className="page">
      <PageHead
        title="Looks"
        actions={
          <>
            <Link href="/ask" className="btn">
              <Sparkles size={16} aria-hidden="true" /> Ask the stylist
            </Link>
            <Link href="/looks/new" className="btn-primary">
              <Plus size={16} aria-hidden="true" /> New look
            </Link>
          </>
        }
      />
      <div className="segmented mb-5 max-w-xs" role="radiogroup" aria-label="View">
        <button type="button" role="radio" aria-checked={tab === "outfits"} onClick={() => setTab("outfits")}>
          Outfits
        </button>
        <button type="button" role="radio" aria-checked={tab === "lookbook"} onClick={() => setTab("lookbook")}>
          Lookbook
        </button>
      </div>

      {tab === "outfits" ? (
        outfits === undefined ? (
          <SkeletonGrid tall />
        ) : outfits.length === 0 ? (
          <Empty icon={Layers} title="No saved looks yet" body="Put a look together yourself, or ask the stylist for ideas from your own wardrobe.">
            <Link href="/looks/new" className="btn-primary">
              Build a look
            </Link>
            <Link href="/ask" className="btn">
              Ask the stylist
            </Link>
          </Empty>
        ) : (
          <div className="tile-grid">
            {outfits.map((o) => (
              <OutfitTile key={o._id} outfit={o} />
            ))}
          </div>
        )
      ) : renders === undefined ? (
        <SkeletonGrid tall />
      ) : renders.length === 0 ? (
        <Empty icon={Images} title="Your lookbook is empty" body="Open a look and tap Try on to see it on your own photo." />
      ) : (
        <div className="tile-grid">
          {renders.map((r) => (
            <Link key={r._id} href={`/looks/${r.outfitId}`} className="tile">
              <div className="tile-media cover">
                {r.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL
                  <img src={r.url} alt={`${r.outfitName}, tried on`} loading="lazy" />
                ) : (
                  <div className="p-4 w-full">
                    {r.status === "failed" ? <p className="muted text-center">Try-on failed</p> : <JobProgress job={r.job} />}
                  </div>
                )}
              </div>
              <div className="tile-body">
                <div className="tile-title">{r.outfitName}</div>
                <div className="tile-meta">{relativeTime(r.createdAt)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
