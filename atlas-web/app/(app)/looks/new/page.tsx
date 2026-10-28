"use client";

import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { EMPTY_SLOTS, OutfitBuilder } from "@/components/OutfitBuilder";
import { PageHead, PageLoading } from "@/components/ui";
import { api } from "@/convex/_generated/api";

const SLOT_OF: Record<string, "top" | "bottom" | "outerwear" | "dress" | "shoes" | undefined> = {
  top: "top",
  bottom: "bottom",
  outerwear: "outerwear",
  dress: "dress",
  shoes: "shoes",
};

function NewLook() {
  const withId = useSearchParams().get("with");
  const start = useQuery(api.items.get, withId ? { itemId: withId } : "skip");
  if (withId && start === undefined) return <PageLoading />;
  const item = start?.item;
  const slot = item ? SLOT_OF[item.category] : undefined;
  const slots = item ? (slot ? { ...EMPTY_SLOTS, [slot]: item._id } : { accessories: [item._id] }) : EMPTY_SLOTS;
  return <OutfitBuilder initial={{ name: item ? `With ${item.name}` : "", slots }} />;
}

export default function NewLookPage() {
  return (
    <div className="page">
      <PageHead title="New look" crumb={{ href: "/looks", label: "Looks" }} />
      <Suspense fallback={<PageLoading />}>
        <NewLook />
      </Suspense>
    </div>
  );
}
