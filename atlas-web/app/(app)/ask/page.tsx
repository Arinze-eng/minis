"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import { StylistChat, type ChatContext } from "@/components/StylistChat";
import { PageHead, PageLoading } from "@/components/ui";

function Chat() {
  const params = useSearchParams();
  const router = useRouter();
  const threadId = params.get("t");
  // ?about=item:<id> or outfit:<id> from shared links; the server checks ownership.
  const about = params.get("about")?.match(/^(item|outfit):([\w-]{1,64})$/);
  const context: ChatContext | undefined = about ? { kind: about[1] as "item" | "outfit", id: about[2]! } : undefined;
  const go = useCallback((id: string | null) => router.replace(id ? `/ask?t=${id}` : "/ask", { scroll: false }), [router]);
  return <StylistChat showThreads threadId={threadId} onThread={go} context={context} onClearContext={() => go(threadId)} />;
}

export default function AskPage() {
  return (
    <div className="page">
      <PageHead eyebrow="Stylist" title="Dress from what you own." sub="Weather-aware looks from your wardrobe. Try-ons only with your approval." />
      <Suspense fallback={<PageLoading />}>
        <Chat />
      </Suspense>
    </div>
  );
}
