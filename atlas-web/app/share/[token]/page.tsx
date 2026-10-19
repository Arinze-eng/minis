"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { RouteMark } from "@/components/RouteMark";
import { Empty, PageLoading } from "@/components/ui";
import { api } from "@/convex/_generated/api";

/** Public, expiring view of one try-on. Nothing else about the owner is exposed. */
export default function SharedLook() {
  const { token } = useParams<{ token: string }>();
  const look = useQuery(api.renders.shared, { token });
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="flex items-center gap-2.5 px-5 py-4">
        <RouteMark size={26} />
        <strong className="text-[17px] font-semibold">Atlas</strong>
      </header>
      <main className="page page-narrow">
        {look === undefined ? (
          <PageLoading />
        ) : look === null ? (
          <Empty title="This link has expired" body="Shared looks are available for 7 days, and the owner can turn them off at any time." action={{ href: "/", label: "What is Atlas?" }} />
        ) : (
          <div className="stack-md">
            <div className="hero-media cover">
              {look.url && (
                // eslint-disable-next-line @next/next/no-img-element -- Convex storage URL
                <img src={look.url} alt={look.outfitName} />
              )}
            </div>
            <div>
              <h1 className="large-title">{look.outfitName}</h1>
              {look.expiresAt && <p className="muted mt-1">Link expires {new Date(look.expiresAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}.</p>}
            </div>
            <Link href="/" className="btn-secondary justify-self-start">
              Make your own with Atlas
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
