# Atlas runtime migration report

## Decision

`atlas-web/` is the sole production WebUI destination. The `manus/atlas-runtime` Vite/Express client, Drizzle/MySQL schema, tRPC surface, and Forge storage path were not merged into the product surface because they form a competing frontend and backend contract. The runtime source is retained under `legacy/atlas-runtime/` for audit and selective future porting only; it is not referenced by the Dockerfile, Render blueprint, or production scripts.

The main branch implementation remains authoritative for identity, consent, policy boundaries, evidence, PostgreSQL persistence, private asset handling, and the Atlas product contract. Runtime UI ideas are represented through the existing Atlas shell, Inbox/Today briefing, Ask flow, evidence surfaces, wardrobe, money, travel, settings, and responsive navigation rather than by copying the runtime architecture.

## Migration map

| Runtime area | Destination | Decision |
|---|---|---|
| Drip Advisor shell and command-center framing | `atlas-web/app/(app)/layout.tsx`, Inbox, shared shell CSS | Adapted into Atlas naming and existing design system |
| Ask / research concepts | `atlas-web/app/(app)/ask/page.tsx`, server route handlers | Retained only where deterministic, evidence-backed, and bounded |
| Wardrobe, looks, money, travel, settings | Existing Atlas routes and APIs | Preserved; writes remain consent- and principal-scoped |
| Root Vite/Express/tRPC API | None | Rejected as a duplicate domain API |
| Runtime Drizzle/MySQL migrations | None | Not executed; incompatible with the authoritative PostgreSQL path |
| Runtime base64/Forge upload path | `atlas-web/app/api/wardrobe/upload/route.ts` | Rejected; multipart, server validation, signed private Cloudinary upload is authoritative |

## Data and schema impact

No production migration was executed. The existing Atlas PostgreSQL migration files remain the system of record. The runtime MySQL/Drizzle migrations are quarantined and must not be applied to the Atlas database. Any future import requires a separate dry-run mapping with ownership reconciliation, checksums, conflict policy, backup, and rollback instructions.

## Security and authorization

The destination uses middleware-verified session identity, rejects missing authenticated principals when Clerk is configured, scopes store reads and writes by principal, gates image workflows on persisted consent, validates image bytes and dimensions server-side, stores opaque asset identifiers, and avoids returning provider secrets or raw private object identifiers. The deployment removes the runtime's anonymous preview fallback and competing API from the production build path. Failed providers return explicit degraded errors rather than connected/live success.

## Verification

Run from `atlas-web/`:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

The Docker build repeats typecheck, tests, and production build. Render now builds and starts `atlas-web` on the injected `PORT`; no root Vite/Express entrypoint remains in the deployment configuration.

## Remaining risks

**High:** Clerk and PostgreSQL credentials must be provisioned in Render before enabling real multi-user production traffic. `ATLAS_SESSION_SECRET` and `ENCRYPTION_KEY` are also required for production; the app fails closed if they are absent. Cloudinary is required for wardrobe image uploads. Google credentials are required only when Gmail is enabled.

**Medium:** The repository contains quarantined runtime source for audit. It must not be restored as a production entrypoint without a new contract review.

**Low:** Existing product surfaces marked demo or local must remain visibly labelled until their corresponding connector is enabled and verified.

## Local runbook

1. Install Node.js 22 or newer.
2. Run `cd atlas-web && npm ci`.
3. For local development, run `npm run dev`; local mode uses an explicitly labelled single-principal file store when `DATABASE_URL` is absent.
4. Run `npm run typecheck`, `npm test`, and `npm run build` before a release.
5. For a production-like local run, provide `NODE_ENV=production`, `DATABASE_URL`, `ATLAS_SESSION_SECRET`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY`; add `ENCRYPTION_KEY` and Cloudinary/Google variables for those features.
6. Run `npm run start` and verify `/`, `/inbox`, `/ask`, `/wardrobe`, `/settings/privacy`, and the API degraded states.

## Safe versus restricted changes

Safe changes include copy, styles, route presentation, deterministic evidence wording, and additional tests. Changes that require contract review include identity or authorization, store queries, consent scopes, uploads, provider tokens, migrations, external writes, model capabilities, and deployment secrets. Never accept owner IDs, tenant IDs, provider tokens, file types, or redirect URLs from the browser as authoritative input.

## Rollback

To roll back the deployment configuration, restore `Dockerfile`, `render.yaml`, and `atlas-web/package.json` from the preceding branch commit, then redeploy the prior image. Do not apply or roll back database migrations as part of this frontend rollback. The quarantined runtime source remains available under `legacy/atlas-runtime/` and is unchanged by this migration.
