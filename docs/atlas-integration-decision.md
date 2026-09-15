# Atlas Integration Decision Record (Phase 0)

Status: **approved direction, implementation pending** (Phase 1 starts after
this record plus the product contract and threat model are acknowledged).
Date: 2026-09-13.

## 1. What was inspected

### Existing `Arinze-eng/minis` Atlas foundations (all read in full)

- `nanobot/atlas/contracts.py` — complete §6 model set: `AuthenticatedAtlasContext`,
  `ConsentScope`, `ConnectorCapability`, `ActionRisk`, `NormalizedProblem`,
  `EvidenceItem`, `DraftAction` (payload-hash bound), `Recommendation`,
  `ApprovalRequest` (user+type+hash+nonce+expiry+idempotency binding),
  `ExecutionResult`, `VerifiedOutcome`, `DripAdviceItem`, `ConnectorResult`
  taxonomy (`OK/NOT_CONFIGURED/UNAUTHORIZED/OAUTH_EXPIRED/RATE_LIMITED/
  UNAVAILABLE/STALE/MALFORMED/PROVIDER_ERROR`), `EmailItem`,
  `TransactionItem`, `TaskItem`, `ProductOffering`, `ProviderRef`,
  `ApprovalDelivery`.
- `nanobot/atlas/policy.py` — 15 deterministic deny-by-default rules
  (identity, ownership, consent, capability, approval binding, idempotency,
  staleness, read-operation gate). The LLM is never an authorization input.
- `nanobot/atlas/service.py` — edge adapter: scenario→connector map
  (`task_start`, `money_guard`, `shopping_research`, `email_summary`,
  `wardrobe_research`), server-stored consent lookup, verified-context scope
  derivation, explicit send-flag Telegram delivery.
- `nanobot/atlas/chain.py`, `stage1.py`, `store.py` (atomic JSONL/JSON local
  store), `bundles.py` (capability bundles with import-time invariants),
  `cross_domain.py` (two-domain allowlist), `drip.py` (cooldown/quiet-hours/
  snooze/dismiss/correction engine), `money.py` (deterministic recurring and
  price-change detection), `wardrobe.py`, `outcome.py` (15-state verification
  machine), `model_factory.py` (Groq `openai/gpt-oss-120b`).
- Connectors: `google_tasks.py`, `gmail.py` (read-only, metadata-only),
  `plaid.py` (sandbox), `serpapi.py`, `telegram_delivery.py`,
  `registry.py`, `credentials.py` (placeholder-safe `read_secret`/`secret_state`).
- Tests: `tests/atlas/` (17 files, 164 cases). Memory: `.atlas/ATLAS_MEMORY.md`.
- Diagnostics/demo: `scripts/atlas_diagnose.py`, `scripts/atlas_demo.py`,
  `scripts/atlas_stage1_smoke.py`.

### Supplied `drip.zip` (`dripadvisor`) implementation

- `server/dripadvisor.contracts.ts` — Zod contracts: garment category enum,
  wardrobe item input, outfit request (occasion/location/weather/preview),
  preview request (`noticeAccepted: true` literal), feedback decisions
  (`saved|rejected|tried_again|reported`).
- `server/routers.ts` — tRPC procedures; **all `publicProcedure`**; fallback
  owner id `0`; base64 data URLs up to 12 MB accepted from the client;
  try-on endpoint takes person + clothing data URLs with no consent record.
- `server/dripadvisor.store.ts` — demo garments, in-memory fallback, Neon
  (raw `pg`) and MySQL/Drizzle paths; delete falls back to unconditional
  `DELETE ... WHERE id = $1` on the Drizzle path (owner not in predicate).
- `server/neon.ts` — raw SQL Neon path; **delete correctly includes owner**;
  `CREATE TABLE IF NOT EXISTS` runtime schema bootstrap (no migration files).
- `server/muse.ts` — server-side model calls (Muse Spark, Manus fallback),
  JSON-schema-bounded outputs for garment analysis and outfit suggestions.
- `server/museImage.ts` — try-on image generation to a remote provider.
- `server/weather.ts` — Open-Meteo current snapshot (clean typed shape).
- `drizzle/schema.ts` — MySQL-oriented tables (`wardrobe_items`,
  `outfit_plans`, `outfit_feedback`) with `ownerUserId` default `0`.
- Client: React/Vite screens (Overview, wardrobe, saved looks, upload modal)
  with the graphite/paper/lime/lilac visual system and Space Grotesk/DM Sans.

## 2. Baseline verification (Phase 0 gate)

- Backend tests: **158 passed / 6 skipped** after repairs (was 152 passed /
  6 failed). Skips are env-gated live paths.
- Ruff: clean (`nanobot/atlas`, `tests/atlas`, demo/diagnose scripts).
- basedpyright strict on `nanobot/atlas`: **0 errors** (repairs included).
- Repairs made during baseline (no behavior change):
  1. Test hermeticity: five "placeholder env" tests assumed no canonical
     `ATLAS_GOOGLE_*` variables in the ambient environment; real credentials
     present locally won alias priority in `read_secret`, so tests either
     failed or (in one case) attempted a real OAuth token POST. Canonical
     names are now cleared per test. Root cause was test isolation, not
     connector logic.
  2. Live demo test (`test_live_demo_real_connector_and_model`) now uses an
     isolated store and explicitly grants consent before running, instead of
     failing on the (correct) `consent_missing` denial.
  3. `gmail.py` strict-typing repairs (casts over untyped `response.json()`
     shapes). No logic change; all normalization tests pass unchanged.

## 3. Decision matrix

| Team (dripadvisor) element | Decision | Rationale / adaptation |
|---|---|---|
| Visual system (graphite rail, warm paper, lime/lilac, Space Grotesk + DM Sans) | **Preserve (adapt)** | Matches the Atlas design direction; refined into Atlas tokens + route/waypoint motif (see `atlas-design-system.md`). |
| Wardrobe overview / inventory / saved-look concepts | **Preserve (adapt)** | Maps cleanly onto the wardrobe engine and outfit flow; rebuilt on Atlas contracts. |
| One-piece-at-a-time upload + editable analysis + confirmation queue | **Preserve (adapt)** | Becomes the garment analysis state machine (`needs_confirmation` → user-confirmed) with provenance. |
| Deterministic candidate selection + model-assisted explanation | **Preserve (adapt)** | Already the Atlas chain shape: deterministic selection, Strands explains. |
| Explicit save/reject/tried-again feedback | **Preserve (adapt)** | Feeds the private style profile (explicit actions only). |
| Typed Zod request contracts | **Preserve (adapt)** | Re-expressed as Atlas API schemas aligned to `contracts.py`; Zod at the browser boundary, Pydantic at the service boundary. |
| Weather snapshot (Open-Meteo) | **Preserve (adapt)** | Typed snapshot with `observedAt` becomes weather evidence with freshness. |
| Neon direction (raw `pg` pool) | **Adapt** | Kept as the production system of record; runtime `CREATE TABLE IF NOT EXISTS` replaced by committed, reviewed migrations; every private query user-scoped. |
| Server-side model calls + provider status/fallback | **Adapt** | Model calls stay server-side and bounded; status maps to the Atlas `ConnectorStatus` taxonomy; no silent provider switch (matches rule 13). |
| tRPC routers | **Replace** | The frontend calls one Atlas request contract through the Next.js server adapter; policy is never bypassed by direct provider calls. |
| `publicProcedure` everywhere / owner id `0` fallback | **Reject (security)** | Must not be treated as authenticated private APIs; demo mode becomes explicit and labelled (see threat model §5). |
| Client base64 image payloads to server procedures | **Replace** | Signed server-issued uploads with server-side MIME/size/dimension/content validation before any storage or model submission. |
| Unconditional Drizzle delete (`WHERE id` only) | **Replace** | Every delete predicate includes authenticated owner id (Neon path already does; made the single behavior everywhere). |
| In-memory fallback for real accounts | **Replace** | Explicit `unavailable`/demo-labelled state; never a silent downgrade of a real account to volatile storage. |
| Try-on generation without consent records | **Defer (consent-gated)** | Requires separate explicit image-use consent, retention policy, labelled approximation; not in the first integrated release. |
| Muse/Meta branding, "DripAdvisor" name | **Reject** | Replaced by Atlas naming; provider names appear only in source-health/diagnostics views. |
| Demo state presented as private data | **Reject** | Synthetic fixtures are always labelled. |

Existing Atlas backend: **preserve as-is** for this phase (contracts, policy,
service, connectors, bundles, cross-domain, drip, money, outcome, store).
Gmail read-only summary is implemented and tested; delivery remains
flag-gated with explicit send consent.

## 4. Architecture direction (approved for Phase 1+)

- **Runtime backend**: existing nanobot runtime + `nanobot/atlas/*` remain the
  source of truth for identity, consent, capability policy, connectors,
  evidence normalization, deterministic domain logic, and the bounded
  Strands chain. Nothing in this phase changes their contracts.
- **Presentation layer**: a Next.js App Router frontend (Server Components by
  default, `"use client"` only where interactive) becomes the Atlas WebUI,
  calling the Atlas backend through one typed server adapter; no Atlas policy
  is duplicated in the browser. Existing nanobot surfaces keep working through
  the existing WebSocket/API conventions.
- **System of record**: Neon Postgres for user-scoped private state
  (consents, connections, wardrobe metadata, asset references, plans,
  feedback, signals, evidence metadata, audit, preferences, job state), via
  committed migrations; local atomic store remains the demo/offline mode.
- **Assets**: signed server-issued uploads with validated
  MIME/size/dimensions/content; opaque references in Postgres; transformations
  for delivery; authenticated deletion; consent purpose recorded per asset.
- **PWA**: installable, network-first for fresh data, cache-first only for the
  static shell; no private API responses cached; offline is draft-and-read
  with labelled staleness and idempotent reconnect.
- **Boundaries that do not move**: the model never grants consent, owns
  anything, authorizes anything, or executes a side effect; writes require the
  approval gate; `send_flag`-plus-consent remains the only delivery path.

## 5. First-release scope anchors

- Must ship: onboarding, consent center, Inbox (Signal Cards), Ask composer,
  wardrobe inventory + analysis confirmation, outfit flow (confirmed items
  only), saved looks + feedback, weather context, Money Guard review, Gmail
  read-only summary, one cross-domain signal, Why panel, snooze/dismiss/
  correct/pause/undo, labelled synthetic demo mode, responsive + accessible
  web, PWA shell, tests + smoke path.
- Must not ship: purchases, cancellations, transfers, email mutations, body/
  identity inferences, unbounded autonomy, public feed of private data,
  unlabelled "AI stylist", production multi-tenant claims while demo owner
  fallback exists.
