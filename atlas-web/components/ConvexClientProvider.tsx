"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url) : null;

/** Local development: tokens come from the dev issuer route (404 in production). */
function useDevAuth() {
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  const fetchAccessToken = useCallback(async () => {
    try {
      const res = await fetch("/api/dev-auth/token", { cache: "no-store" });
      if (!res.ok) return null;
      return ((await res.json()) as { token?: string }).token ?? null;
    } catch {
      return null;
    }
  }, []);
  useEffect(() => {
    void fetchAccessToken().then((token) => setState(token ? "ok" : "none"));
  }, [fetchAccessToken]);
  return useMemo(
    () => ({ isLoading: state === "loading", isAuthenticated: state === "ok", fetchAccessToken }),
    [state, fetchAccessToken],
  );
}

/** Makes sure the signed-in user's row exists before any other call. */
function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensure = useMutation(api.users.ensure);
  const done = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || done.current) return;
    done.current = true;
    void ensure({}).catch(() => {
      done.current = false;
    });
  }, [isAuthenticated, ensure]);
  return null;
}

export function ConvexClientProvider({ clerk, children }: { clerk: boolean; children: ReactNode }) {
  if (!client) {
    return (
      <div className="page page-narrow">
        <div className="notice notice-warn">
          Atlas needs <code>NEXT_PUBLIC_CONVEX_URL</code>. Run <code>npx convex dev</code> in <code>atlas-web</code>.
        </div>
      </div>
    );
  }
  return clerk ? (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      <EnsureUser />
      {children}
    </ConvexProviderWithClerk>
  ) : (
    <ConvexProviderWithAuth client={client} useAuth={useDevAuth}>
      <EnsureUser />
      {children}
    </ConvexProviderWithAuth>
  );
}
