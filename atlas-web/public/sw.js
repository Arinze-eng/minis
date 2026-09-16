/*
 * Atlas service worker — deliberate, limited offline behavior.
 *
 * Strategy (threat model §5, product contract §7):
 *  - navigations are never cached: authenticated HTML must not survive a
 *    sign-out or become visible to a different account on the same browser;
 *  - cache-first ONLY for the versioned static shell (icons, manifest);
 *  - never cache /api/* or anything authenticated/private;
 *  - explicit versioned cache names with old-cache cleanup on activate;
 *  - no background sync of destructive or financial operations (none exist).
 */

const VERSION = "atlas-v6";
const SHELL_CACHE = `${VERSION}-shell`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll([
          "/manifest.webmanifest",
          "/icons/icon-192.png",
          "/icons/icon-512.png",
          "/icons/icon-192-maskable.png",
          "/icons/icon-512-maskable.png",
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.startsWith("/_next/static/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return; // never interfere with non-GET (mutations stay online-only)
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    return; // private/freshness-sensitive: browser handles it, no SW cache
  }

  if (isStaticAsset(url)) {
    // Cache-first for safe static shell assets only.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Let the browser handle navigations directly. Caching HTML here would
  // preserve signed-in UI after sign-out and can cross account boundaries on
  // shared devices, even when the page's API calls are correctly protected.
  if (request.mode === "navigate") {
    return;
  }
});
