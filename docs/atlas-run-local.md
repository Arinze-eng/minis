# Atlas local runbook

How to run, verify, and develop Atlas locally. No secret values appear here —
only variable names and their purpose.

## Prerequisites

- Node 20+ and [Bun](https://bun.sh)
- Postgres for real persistence (Neon works out of the box)

## Run

```bash
cd atlas-web
bun install
bun run dev            # dev server with hot reload
bun run build          # production build
bun run start          # serve the production build
bun run test           # Vitest suite (41 tests)
bunx tsc --noEmit      # strict typecheck
```

Tests never touch a database: they force the local file store regardless of
the ambient environment.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | for persistence | Postgres/Neon connection string. Postgres store activates when set; without it the app runs on a labelled local file store (development only). |
| `ATLAS_SESSION_SECRET` | for stable sessions | HMAC key for signing session cookies. Rotating it invalidates existing sessions. |
| `CLOUDINARY_URL` (or the three discrete vars) | for image upload | Signed garment image storage. Uploads return an explicit unavailable state when unset — never a simulated success. |
| `ENCRYPTION_KEY` | for Gmail connection | Application-layer AES-256-GCM encryption of stored Gmail refresh tokens. Key-version aware; server-only. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | for real accounts | Clerk identity. When both are set, Clerk is the sole identity authority (middleware verifies the session and binds the userId server-side; protected routes enforce sign-in; header shows the account control). When unset, Atlas runs in the labelled local single-principal mode and every surface says so. |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | for Gmail read-only scan | Google OAuth client for the `gmail.readonly` authorization-code flow with PKCE and encrypted server-side token storage. Connect surfaces an explicit setup-guidance state when unset. |

Never commit real values; fixtures and examples stay synthetic.

## Database migrations

`atlas-web/lib/server/migrations/` contains committed, numbered SQL files.
The store applies them idempotently through a race-guarded journal on first
connection. There is no separate migration step to run manually.

- `001_atlas_core.sql` — users, garments, wear events, signals, findings,
  notifications, audit events, idempotency journal; user-scoped indexes.
- `002_assets_consent.sql` — private assets (opaque keys, provider refs,
  cleanup state) and per-purpose consent grants.

Use a scratch Neon branch for development; do not point dev at production.

## Route map (Next.js App Router)

| Route | Kind | Notes |
|---|---|---|
| `/` | static | Landing: hero, engine preview, Daily Loop, privacy matrix |
| `/inbox` | RSC | Signal Cards + morning briefing |
| `/wardrobe` | RSC | Inventory grid, URL-stateful filters |
| `/wardrobe/add` | RSC | Capture flow with consent gate + tag review |
| `/looks` | RSC | Outfit board from confirmed garments |
| `/money` | RSC | Recurring-charge review with evidence drawers |
| `/signals/[id]` | RSC | Signal detail, Why panel, state controls |
| `/sources` | RSC | Consent center + source health |
| `/settings/privacy` | RSC | Export / disconnect / wipe |
| `/api/*` | handlers | Session-scoped JSON API (see below) |

## API surface

All routes authenticate via the session cookie minted in `middleware.ts`
(HMAC-signed; pages never write cookies — the RSC restriction that caused the
historical 500s is structurally avoided).

| Endpoint | Behavior |
|---|---|
| `GET/POST/PATCH /api/wardrobe` | list / create / confirm garments (principal-scoped) |
| `POST /api/wardrobe/wear` | idempotent wear log (key-based dedup) |
| `POST /api/wardrobe/upload` | consent-gated signed Cloudinary upload with magic-byte/dimension validation |
| `GET /api/signals` · `POST /api/signals` | derived signals; snooze/dismiss state changes (audited) |
| `GET /api/money` | money findings with evidence references |
| `GET /api/notifications` | agent notifications (tab-filterable) |
| `GET /api/consent` · `POST /api/consent` | read / grant / revoke per-purpose consent |
| `GET /api/assets/[id]` | signed view (`?image=1` → owner-scoped redirect for `<img>`) |
| `DELETE /api/assets/[id]/delete` | delete + provider cleanup, ownership-checked |
| `POST /api/privacy` | actions: `export`, `wipe` (requires `confirm:true`), `disconnect` |

## Cloudinary integration

- **Upload**: server-side signed upload, folder-scoped per principal hash;
  public id is opaque; images validated (magic bytes, MIME, ≤ 8 MB,
  ≤ 4096×4096) before any storage call.
- **Delivery**: assets are private; browsers render them via the signed view
  route which 302s to a short-lived signed URL. Direct CDN URLs are not
  exposed to other users (verified: non-owner gets 404).
- **Retention/deletion**: garment deletion removes the provider asset and
  records cleanup state (`providerCleanup:true`). Privacy wipe removes all
  principal assets and evidence. The service worker never caches `/api/*`.

## Gmail connector status

Contracts, `gmail.readonly` scope enforcement, and the consent UI exist. Live
OAuth requires Google Cloud credentials configured outside this document.
While unset, the surface shows an explicit unavailable state — no simulated
scan results.

## Verification checklist

1. `bun run test` — 41/41.
2. `bunx tsc --noEmit` — clean.
3. `bun run build && bun run start` then smoke all routes above (expect 200).
4. API workflow: create garment → upload (with/without consent) → confirm →
   wear (repeat for idempotency) → signals → snooze → export → wipe.
5. Cross-principal isolation: fresh session (different cookie jar) sees 0
   records and 404 on another principal's asset.

## Architecture boundary

```
Next.js App Router (atlas-web/)
  ├── Server Components: shell, metadata, store reads
  ├── Client Components: capture, filters, drawer, state controls
  ├── middleware.ts: Clerk session verify + Atlas session bind (edge)
  └── Route Handlers: JSON API over the store
        ↓
lib/server/clerkIdentity.ts → Clerk auth() (sole authority when configured)
lib/server/store.ts → Postgres (Neon) | labelled local file store
lib/server/cloudinary.ts → signed private image storage
lib/server/secretBox.ts → AES-256-GCM token encryption + OAuth PKCE
lib/server/gmail.ts → gmail.readonly authorization-code flow
lib/server/emailExtraction.ts → bounded metadata-only finding rules
lib/server/signals.ts → deterministic signal + cross-domain derivation
```

The Python nanobot runtime (`nanobot/`, gateway, channels, Telegram) remains
the agent backend; the web frontend integrates through its contracts. The
remaining integration work (live LLM scenarios, Gmail OAuth, Telegram
delivery) is tracked in `docs/atlas-compliance-review.md` §5.
