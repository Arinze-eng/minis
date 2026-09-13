"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Trash2 } from "lucide-react";
import { costPerWear, type Garment } from "@/lib/wardrobe";
import { formatCPW } from "@/lib/format";
import { atlasSpring, useMotionPrefs } from "@/lib/motion";

/**
 * Garment card with CPW pills and a confirmed delete (two-step, owner-scoped
 * DELETE server-side). Uses router.refresh() so the server component re-reads
 * the store after mutation.
 */
export function GarmentCard({ garment }: { garment: Garment }) {
  const cpw = costPerWear(garment);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const reduced = useMotionPrefs();

  const cpwClass =
    cpw.basis === "confirmed_wears" &&
    garment.price !== undefined &&
    cpw.value <= garment.price / 10
      ? "cpw-pill cpw-good"
      : cpw.basis === "confirmed_wears"
        ? "cpw-pill"
        : "cpw-pill cpw-unknown";

  const remove = async () => {
    const res = await fetch(`/api/wardrobe?id=${encodeURIComponent(garment.id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      startTransition(() => router.refresh());
    } else {
      setConfirming(false);
    }
  };

  return (
    <motion.article
      className="garment-card"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: pending ? 0.6 : 1, y: 0 }}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={atlasSpring(reduced)}
    >
      <div className="garment-media" aria-hidden="true">
        <span className="garment-media-letter">{garment.name.charAt(0)}</span>
      </div>
      <div className="garment-body">
        <div className="garment-title-row">
          <h3>{garment.name}</h3>
          <button
            type="button"
            className="garment-delete"
            onClick={() => (confirming ? void remove() : setConfirming(true))}
            aria-label={confirming ? `Confirm deleting ${garment.name}` : `Delete ${garment.name}`}
            disabled={pending}
          >
            <Trash2 size={14} aria-hidden="true" />
            {confirming ? "Confirm?" : ""}
          </button>
        </div>
        <p className="garment-tags">
          {garment.category.replace("_", " ")} · {garment.colors.join(", ")}
          {garment.material ? ` · ${garment.material}` : ""}
        </p>
        <p className="garment-occasions">{garment.occasions.join(" · ")}</p>
        <div className="garment-pills">
          <span className={cpwClass} title="Cost per wear (price / confirmed wears)">
            {formatCPW(cpw)}
          </span>
          <span className="wear-pill" title="Confirmed wear events">
            {garment.wearCount} {garment.wearCount === 1 ? "wear" : "wears"}
          </span>
        </div>
      </div>
    </motion.article>
  );
}
