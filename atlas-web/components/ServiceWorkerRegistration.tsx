"use client";

import { useEffect } from "react";

/**
 * Registers the Atlas service worker in the browser only (never during SSR).
 * Update lifecycle: when a new worker activates, controllers change on the
 * next navigation — no auto-reload loops, no interrupting the user mid-flow.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
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

  return null;
}
