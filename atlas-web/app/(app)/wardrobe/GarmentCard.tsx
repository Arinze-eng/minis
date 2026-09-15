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

  const cpwGood =
    cpw.basis === "confirmed_wears" &&
    garment.price !== undefined &&
    cpw.value <= garment.price / 10;

  const cpwKnown = cpw.basis === "confirmed_wears";

  const remove = async () => {
    // Deleting a garment with a photo also deletes the private asset —
    // provider cleanup included, per the §10 flow.
    if (garment.imageRef) {
      await fetch(`/api/assets/${encodeURIComponent(garment.imageRef)}/delete`, {
        method: "DELETE",
      }).catch(() => null);
    }
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
      className="group bg-[var(--color-surface)] border border-[var(--color-line)] rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-pop)] transition-shadow duration-150"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: pending ? 0.6 : 1, y: 0 }}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={atlasSpring(reduced)}
    >
      {/* Image / letter area */}
      <div className="aspect-square bg-[var(--color-surface-raised)] relative overflow-hidden">
        {garment.imageRef ? (
          // Owner-scoped proxy: the server verifies the session before 302 to
          // a short-lived signed URL. Never caches in the service worker.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="w-full h-full object-cover"
            src={`/api/assets/${encodeURIComponent(garment.imageRef)}/image`}
            alt={garment.imageAlt}
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-4xl font-bold text-[var(--color-ink-muted)] select-none"
            aria-hidden="true"
          >
            {garment.name.charAt(0)}
          </div>
        )}

        {/* Delete button — visible on hover */}
        <button
          type="button"
          className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${
            confirming
              ? "opacity-100 bg-red-500 text-white"
              : "opacity-0 group-hover:opacity-100 bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-red-50 hover:border-red-300 hover:text-red-600"
          }`}
          onClick={() => (confirming ? void remove() : setConfirming(true))}
          aria-label={confirming ? `Confirm deleting ${garment.name}` : `Delete ${garment.name}`}
          disabled={pending}
        >
          <Trash2 size={12} aria-hidden="true" />
          {confirming ? "Confirm?" : null}
        </button>
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col gap-2">
        {/* Name */}
        <h3 className="font-semibold text-[0.92rem] text-[var(--color-ink)] leading-snug">
          {garment.name}
        </h3>

        {/* Tags row */}
        <p className="text-[0.78rem] text-[var(--color-ink-muted)] leading-snug">
          {garment.category.replace("_", " ")} · {garment.colors.join(", ")}
          {garment.material ? ` · ${garment.material}` : ""}
        </p>

        {/* Occasions */}
        {garment.occasions.length > 0 ? (
          <p className="text-[0.78rem] text-[var(--color-ink-muted)]">
            {garment.occasions.join(" · ")}
          </p>
        ) : null}

        {/* Pills row */}
        <div className="flex flex-wrap gap-1.5 mt-1">
          {/* CPW pill */}
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.72rem] font-medium ${
              cpwGood
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : cpwKnown
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] border border-[var(--color-line)]"
                  : "bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] border border-[var(--color-line)] opacity-70"
            }`}
            title="Cost per wear (price / confirmed wears)"
          >
            {formatCPW(cpw)}
          </span>

          {/* Wear count pill */}
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.72rem] font-medium bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] border border-[var(--color-line)]"
            title="Confirmed wear events"
          >
            {garment.wearCount} {garment.wearCount === 1 ? "wear" : "wears"}
          </span>
        </div>
      </div>
    </motion.article>
  );
}
