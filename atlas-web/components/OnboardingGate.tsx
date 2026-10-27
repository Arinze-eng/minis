"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PageLoading } from "@/components/ui";
import { api } from "@/convex/_generated/api";

/** New accounts finish the two-step welcome before anything else (Fitcheck's onboarding gate). */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  const pathname = usePathname();
  const router = useRouter();
  const needsWelcome = me !== undefined && me !== null && !me.onboardedAt && pathname !== "/welcome";
  useEffect(() => {
    if (needsWelcome) router.replace("/welcome");
  }, [needsWelcome, router]);
  if (needsWelcome) return <PageLoading label="Setting things up…" />;
  return <>{children}</>;
}
