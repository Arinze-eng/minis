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

## Routes (Phase 1)

- `/` — landing: value pitch, the four questions, security boundaries.
- `/inbox` — Atlas Inbox with Signal Cards (demo mode).
- `/signals/[id]` — signal detail + Why panel + "What Atlas did not do".
- `/manifest.webmanifest` — installable PWA manifest.
- `public/sw.js` — service worker: network-first pages, cache-first static
  shell only, never caches `/api/*` or private responses.

## Demo mode

Everything is currently synthetic and labelled ("Demo mode — synthetic data,
nothing here is private or live"). Demo data lives in `app/inbox/demoData.ts`
and is pinned by `tests/demoLabelling.test.ts`: mode must be declared, every
source must identify as demo, capability never exceeds "prepare", and ids stay
deterministic.

## Backend integration contract (to implement in later phases)

Browser → authenticated Atlas API request → server identity binding → consent
lookup → deterministic capability policy → bounded connector/tool bundle →
normalized evidence → deterministic domain logic → optional Strands
explanation → typed recommendation/signal → persisted state → card.
Next.js Route Handlers / Server Actions may only forward requests that
preserve these contracts; no provider calls from the browser.

## Brand

Icons are generated from the route/waypoint mark via
`scripts/generate_icons.py` (Pillow, deterministic): 192/512 normal +
maskable, favicon, apple touch icon. `brand-spec.md` documents the identity;
the mark is an internal placeholder pending a final team-approved asset.
