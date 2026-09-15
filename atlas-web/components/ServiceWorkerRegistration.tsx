"use client";

import { useEffect, useState } from "react";

/**
 * Registers the Atlas service worker in the browser only (never during SSR).
 * Update lifecycle: when a new worker activates, controllers change on the
 * next navigation — no auto-reload loops, no interrupting the user mid-flow.
 *
 * Also captures the `beforeinstallprompt` event and surfaces a subtle install
 * banner ("Add Atlas to your home screen"). Dismissal is stored in
 * localStorage so the banner only appears once.
 */

const DISMISS_KEY = "atlas-pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export function ServiceWorkerRegistration() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);

  // Register service worker
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    if (
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost"
    ) {
      return; // SW requires a secure context
    }
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure must never break the app shell.
      });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  // Capture the beforeinstallprompt event
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Don't show if already dismissed
    if (localStorage.getItem(DISMISS_KEY) === "true") return;

    const handler = (e: Event) => {
      e.preventDefault(); // prevent the mini-infobar on mobile Chrome
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setBannerVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setBannerVisible(false);
      setInstallPrompt(null);
    }
  };

  const handleDismiss = () => {
    setBannerVisible(false);
    setInstallPrompt(null);
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {
      // localStorage may be unavailable in some contexts
    }
  };

  return (
    <>
      {bannerVisible && (
        <div
          role="banner"
          aria-label="Install Atlas"
          style={{
            position: "fixed",
            bottom: "env(safe-area-inset-bottom, 0px)",
            left: 0,
            right: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "14px 20px",
            background: "var(--color-surface)",
            borderTop: "1px solid var(--color-line)",
            boxShadow: "var(--shadow-pop)",
            fontSize: "0.9rem",
          }}
        >
          <span style={{ color: "var(--color-ink)" }}>
            Add Atlas to your home screen for quick access.
          </span>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleInstall}
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                border: "none",
                background: "var(--color-accent)",
                color: "var(--color-on-accent)",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.87rem",
              }}
            >
              Install
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss install banner"
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--color-line-strong)",
                background: "transparent",
                color: "var(--color-ink-muted)",
                cursor: "pointer",
                fontSize: "0.87rem",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}
