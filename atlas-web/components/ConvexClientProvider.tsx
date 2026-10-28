"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithAuth, ConvexReactClient, useAction, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

const ClerkEnabled = createContext(false);

/** Whether Clerk is configured for this deployment (decided on the server, passed down once). */
export function useClerkEnabled(): boolean {
  return useContext(ClerkEnabled);
}

/**
 * Makes sure the signed-in user's row exists before any other call, then links Gmail / Google Tasks
 * if the user signed in with Google and granted those read-only scopes.
 */
function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensure = useMutation(api.users.ensure);
  const syncGoogle = useAction(api.sources.syncGoogleSignIn);
  const done = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || done.current) return;
    done.current = true;
    void ensure({})
      .then(() => syncGoogle({}).catch(() => undefined))
      .catch(() => {
        done.current = false;
      });
  }, [isAuthenticated, ensure, syncGoogle]);
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
  return (
    <ClerkEnabled.Provider value={clerk}>
      {clerk ? (
        <ConvexProviderWithClerk client={client} useAuth={useAuth}>
          <EnsureUser />
          {children}
        </ConvexProviderWithClerk>
      ) : (
        <ConvexProviderWithAuth client={client} useAuth={useDevAuth}>
          <EnsureUser />
          {children}
        </ConvexProviderWithAuth>
      )}
    </ClerkEnabled.Provider>
  );
}
