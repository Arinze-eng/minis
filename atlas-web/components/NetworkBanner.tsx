"use client";

import { useEffect, useState } from "react";

/**
 * Offline banner: reflects connectivity via the browser's online/offline
 * events (the service worker handles the offline shell itself). Announced
 * politely to screen readers; renders nothing while online.
 */
export function NetworkBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="network-banner" role="status" aria-live="polite">
      You are offline — showing the last safe shell. Fresh data returns when
      you reconnect.
    </div>
  );
}
