# Atlas Web (Next.js App Router)

This directory is the sole production WebUI destination. The former Vite/Express runtime is quarantined under `legacy/atlas-runtime/` and is not included in the deployment image.

The Atlas presentation layer. The existing nanobot runtime + `nanobot/atlas/*`
remain the source of truth for identity, consent, capability policy,
connectors, deterministic domain logic, and the bounded Strands chain. This
app never duplicates policy in the browser.

## Commands (npm)

```bash
cd atlas-web
npm ci
npm run dev
npm run build
npm run start
npm run typecheck
npm run test
```

Production requires `DATABASE_URL`, `ATLAS_SESSION_SECRET`, and both Clerk credentials. Without Clerk, the app fails closed rather than minting a local principal; local single-principal mode is development/test only.

The header identity control shows signed-in / signed-out state on every page, and the app shell is protected as a whole while each page and route handler re-checks identity where it reads data.

## Routes

- `/` — landing: statement card, how the loop behaves, security boundaries.
- `/inbox` — command center: dated head, stat strip, morning briefing, ranked
  priority queue, system pulse rail.
- `/ask` — bounded Ask Atlas request surface.
- `/wardrobe`, `/wardrobe/add` — garment records, cost per wear, capture flow.
- `/looks` — deterministic outfit planning from confirmed garments.
- `/money` — subscription findings with evidence drawers and the manual
  cancellation guide.
- `/travel`, `/tasks` — operations surfaces; they state scope honestly while no
  connector is configured.
- `/sources` — consent, scan terminal, source health.
- `/settings/privacy`, `/settings/preferences` — data controls and quiet hours.
- `/signals/[id]` — signal detail + Why panel + "What Atlas did not do".
- `/sign-in`, `/sign-up` — Clerk Core 3 auth routes.
- `/manifest.webmanifest` — installable PWA manifest.
- `public/sw.js` — service worker: network-first pages, cache-first static
  shell only, never caches `/api/*` or private responses.

## Authentication

Clerk (`@clerk/nextjs` v7 / Clerk Core 3) is the only identity authority when
configured. `middleware.ts` verifies the session; identity is then resolved
where data is read (`lib/server/identity.ts`), not asserted by the browser. The
header always states whether you are signed in, signed out, or running in the
labelled local dev mode. Without Clerk keys the app runs one labelled
single-principal session in development and fails closed (`503`) in production.
See `PRODUCTION_SETUP.md` for the environment matrix.

## Design system
Tailwind CSS v4 is the default styling layer. `app/globals.css` owns the
design tokens, light/dark color scheme, Clerk variables, focus treatment, and
small global resets; route and component UI should use Tailwind utility classes
and shared token variables rather than page-specific CSS selectors. The
authenticated shell is implemented in `components/AppNav.tsx`,
`components/AppHeader.tsx`, and `(app)/layout.tsx`, with padded responsive
navigation, glass surfaces, and mobile-safe touch targets.

## Demo mode
The production Inbox does not fabricate dashboard metrics, source status,
weather, or wardrobe recommendations. It reads the authenticated principal's
signals, findings, garments, notifications, and Gmail scan state through the
server store and Route Handlers. `lib/demo/*` remains only for explicitly
labelled development/test fixtures and must never be used as a production
fallback.

## Backend integration contract (to implement in later phases)

Browser → authenticated Atlas API request → server identity binding → consent
lookup → deterministic capability policy → bounded connector/tool bundle →
normalized evidence → deterministic domain logic → optional Strands
explanation → typed recommendation/signal → persisted state → card.
Next.js Route Handlers / Server Actions may only forward requests that
preserve these contracts; no provider calls from the browser.

## Hosting boundary
`atlas-web` is the production web application and must be deployed as the
Next.js service (`npm run build && npm run start`). The frontend and backend are
not separate browser services: the browser renders this app, while the same
Next.js deployment serves the authenticated Route Handlers under `/api/*`.
Those handlers call `lib/server/store.ts`, which uses Postgres when
`DATABASE_URL` is configured and the labelled local store only in development.
Configure Clerk, `DATABASE_URL`, `ATLAS_SESSION_SECRET`, and connector
credentials in the hosting provider's environment; do not point the browser at
the repository's legacy Vite/Express WebUI.

## Brand

Icons are generated from the route/waypoint mark via
`scripts/generate_icons.py` (Pillow, deterministic): 192/512 normal +
maskable, favicon, apple touch icon. `brand-spec.md` documents the identity;
the mark is an internal placeholder pending a final team-approved asset.
