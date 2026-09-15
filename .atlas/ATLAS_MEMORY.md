# ATLAS MEMORY — Master Build Checklist

Product: Atlas (Everyday Agents). Core promise: notices the work I am avoiding
or the money I am losing, prepares the next move, asks before it acts.

This file is the authoritative cross-session checklist. Update it after every
completed step; create a checkpoint commit when a step is stable.

## Environment facts (verified)

- Repo: Arinze-eng/minis, branch `main`.
- Strands Agents SDK 1.55.1 installed; verified model path Groq
  `openai/gpt-oss-120b` (free tier only).
- Credentials come only from env / ignored `.env.local`. Diagnostics CLI:
  `uv run --no-sync python scripts/atlas_diagnose.py` (secret-safe; reports
  `set|missing|placeholder`).
- Credential presence at last run: GROQ/GOOGLE_ID/SECRET/SERPAPI/TELEGRAM set;
  GOOGLE_REFRESH_TOKEN=placeholder (Plaid creds not yet provisioned).
- Typecheck: basedpyright strict, `include = ["nanobot"]` (tests excluded).
- Known Windows/mcp-1.30.0 note: server idle-expiry does not fire for
  POST-only clients; tests must not race wall-clock session timers.

## Step checklist

### Foundation (complete)

- [x] Repository/architecture discovery; nanobot surfaces inventoried.
- [x] Atlas contracts (`nanobot/atlas/contracts.py`): all §6 models present
      (AuthenticatedAtlasContext, ConsentScope, ConnectorCapability,
      NormalizedProblem, EvidenceItem, Recommendation, DraftAction,
      ApprovalRequest, ExecutionResult, VerifiedOutcome, DripAdviceItem,
      TransactionItem/ProductOffering/TaskItem, ConnectorResult taxonomy).
- [x] Deterministic policy (`nanobot/atlas/policy.py`): identity, ownership,
      consent, capability, approval, idempotency, staleness, read-op gate.
- [x] Strands orchestration (`nanobot/atlas/chain.py`): one agent, single
      bounded tool, budgeted, policy-first; CI-stubbed at class boundary.
- [x] Stage-1 run records + validation (`nanobot/atlas/stage1.py`).
- [x] Local atomic store (`nanobot/atlas/store.py`).
- [x] Model factory: Groq `openai/gpt-oss-120b` + budgets
      (`nanobot/atlas/model_factory.py`).
- [x] Secret-safe diagnostics CLI (tri-state credential report, health probes).
- [x] Placeholder-safe credential helper (`connectors/credentials.py`,
      security rule 6 enforced at the source) — commit 4e1e665.
- [x] Deterministic MCP reconnect/shutdown test (no wall-clock race) — 4e1e665.

### Capabilities

- [x] §2.2 Task Start — Google Tasks real connector (read-only), TaskItem
      normalization, task_start chain path, ProviderRef preservation.
- [x] §2.4 Research/Shopping — SerpApi real connector, ProductOffering
      normalization, shopping chain path (read-only).
- [x] §2.5 Communication (partial) — Telegram delivery connector (consent +
      server-derived chat id), demo card formatting. Gmail not implemented.
- [x] §2.1 Money Guard — Plaid Sandbox read-only connector
      (`connectors/plaid.py`), deterministic recurring/price-change rules
      (`money.py`), `money_guard` chain path, sandbox labeling everywhere.
- [x] §2.3 Wardrobe Help — deterministic outfit/care/packing rules over
      user-entered `GarmentRecord`s (`wardrobe.py`), store persistence via a
      new `garments` record kind, `wardrobe_research` chain path, and a
      `WardrobeStoreConnector` adapter. No paid fashion API; keyword-based
      constraint parsing is deterministic; no purchases (rule 10).
- [ ] §2.5 Communication (remainder) — explicit send-flag gating; Gmail
      read-only evidence summary.
- [x] §2.6 Drip Advice — deterministic engine (`drip.py`): one-at-a-time
      selection, quiet hours (incl. overnight windows), per-domain cooldown,
      snooze/dismiss/correction suppression, content-bound delivery
      idempotency keys. `DripAdviceItem` extended with cooldown + delivery
      idempotency fields; feedback lives in user-scoped `DripFeedback`
      records.
- [x] §2.7 Cross-Domain Resolution — deterministic pair allowlist
      (`cross_domain.py`): exactly two distinct domains, three allowed pairs
      (tasks+shopping, money+tasks, wardrobe+research), no-execution drafts,
      bounded delivery card. Cap enforced at both the contract (field bound)
      and resolver layer.
- [x] §2.8 Outcome Verification — deterministic state machine (`outcome.py`)
      with all 15 directive states and a legal-transition table;
      verification requires refreshed post-attempt provider evidence
      (pre-attempt evidence ⇒ `outcome_unverified`, none ⇒
      `provider_unavailable`); attempted actions can never self-report as
      verified.
- [x] Capability bundles (§5) — explicit `bundles.py` declarations with
      per-op capability levels; deterministic invariants (blocked ops can
      never be approval-gated; execute ops must be blocked or gated),
      validated at import time; deny-by-default scenario lookup.

### Policy tests (§7)

- [x] Client-supplied user IDs ignored; identity from verified context.
- [x] Capability declared before registration; consent re-checked per call.
- [x] Write/execute blocked in MVP (Money Guard: no transfer/pay/dispute/
      cancel; Google Tasks writes rejected until approval-gate stage).
- [x] Explicit rule-by-rule table tests for §7 in one place
      (`test_policy_rules.py`: rules 1-8, 10-13 pinned against the real
      policy layer; rule 9 structural — approvals only via server-side
      `ApprovalRequest.from_draft`).

### Integration & delivery

- [x] Edge adapter: `service.py` — AtlasRequest (server-verified id, explicit
      send flag) → server-stored consent lookup → chain selector → delivery.
      Preserves nanobot AgentLoop/AgentRunner; delivery requires explicit
      send flag AND telegram consent AND flag-gated connector.
- [x] Live demo path: real connector (Google Tasks) + Groq, provider-
      unavailable fallback shown explicitly.
  - [x] Credential gating prerequisites — registry accepts plain-name
        aliases and rejects placeholders; google_tasks/serpapi return
        `NOT_CONFIGURED` before any provider access when credentials are
        absent or placeholders (rule 6 enforced end-to-end).
  - [x] Demo entry point — `scripts/atlas_demo.py` drives AtlasService
        end-to-end (read-only, send_flag always False): consent grant helper,
        explicit FALLBACK hints for connector_disabled/consent_missing/
        model_unconfigured, `--json` mode, env-gated live test. Also fixed
        the service policy gate: verified context scopes now derive
        server-side from the scenario→connector map (READ_PUBLIC for
        serpapi, READ_PROFILE otherwise) instead of being empty.
- [ ] WebUI Atlas surface (cards: evidence, recommendation, approval).

## Protocol step record — demo-path gating (complete)

- Registry alias gating + NOT_CONFIGURED demo-path step: **complete**
  (code in commit `1d217e7`; this record plus the README Atlas run guide
  land in the follow-up commit).
- Verification at step completion: **135 passed / 8 skipped** (tests/atlas),
  **Ruff clean**, **basedpyright strict: 0 errors**.
- Commits in this protocol window: `4e1e665`, `5e1afca`, `257c360`,
  `c87df8e`, `3e3bd46`, `e9f117c`, `7558243`, `a013e74`, `83071e0`
  (demo-path code fixes: `1d217e7`; live demo entry point: `9f8f040`).
- Changed files at record time: `README.md` (Atlas run guide added),
  `.atlas/ATLAS_MEMORY.md` (this record). No source changes pending.
- **Next unchecked checklist item:** §2.5 Communication (remainder) —
  Gmail read-only evidence summary (send-flag gating for Telegram
  delivery is already implemented in `service.py`).

## Protocol step record — UI polish pass: theme engine + landing + agent hub (complete)

- Dual-theme engine: semantic tokens in `globals.css` (light "Atelier
  Editorial" porcelain/white, dark "Atlas Night" graphite basalt/slate;
  indigo/amber/emerald functional accents), `data-theme` + media-query
  fallback, FOUC pre-hydration script (`ThemeScript`, key `atlas-theme`),
  `ThemeToggle` (light→dark→system cycle, localStorage-persisted), icons +
  manifest recolored to the new accent. All component CSS remapped to
  semantic tokens; dark-chrome surfaces get dedicated on-chrome text tokens;
  accent fills carry on-accent/on-good/on-alert text tokens for AA contrast.
- Landing rebuilt (`app/page.tsx`): editorial hero, CSS-only dual-engine
  preview (radio-tab + `:has()` swap; CPW bars animate once, leak row pulses),
  Daily Loop timeline (07:30 curate / 14:00 renewals / 20:00 CPW rebalance),
  zero-mutation privacy matrix, header with theme toggle, no cramped grids.
- Autonomous agent hub: `lib/notifications.ts` (categories, pure tab filter,
  unread count, Intl relative time) + `lib/demo/agent.ts` (briefing,
  notifications matching the brief's examples, pure `withWearLogged`);
  `AppHeader` on all app routes with Sentinel status pill (breathing dot:
  "Sentinel active · renewals & weather") + bell with unread badge;
  `NotificationDrawer` slide-over (All/Renewals/Closet/System tabs, ESC +
  overlay close, dismiss = mark-read, aria-live); MorningBriefing on `/inbox`
  (weather chip labelled as demo snapshot, outfit suggestion from confirmed
  garments, Mark Worn Today recomputes CPW live via pure function).
- Animations: all CSS only (150ms color ease, 240–280ms ease-out/drawer
  curves), sentinel breathe + leak pulse ambient, card/bar entrance
  animations, `prefers-reduced-motion` collapses everything. No new deps
  beyond lucide-react (already present).
- Verification: 30 vitest tests green (was 22; +8 for tabs/sort/unread/
  relative-time/wear-purity), tsc clean, build clean (14 routes), start
  smoke 200 across all routes with content assertions for loop/engines/
  privacy matrix/Sentinel/briefing.
- Next: server adapter + Postgres migration (backend half of Phase 2).

## Protocol step record — Phases 2–4 integration: real store + night redesign + motion (complete)

- Backend integration (real, not demo): committed Postgres migration applied
  at boot via a journal (`schema_migrations`, single-flight, race-guarded
  insert); PgStore (Neon-compatible) when DATABASE_URL is set, labelled
  local-file store otherwise. Identity: middleware-minted HMAC-signed session
  cookie (WebCrypto, edge-safe in `sessionCrypto.ts`); RSC pages are
  read-only consumers; route handlers mint via `requirePrincipal`. Fixes the
  "Cookies can only be modified in a Server Action" RSC 500.
- API (principal-scoped + audited): wardrobe CRUD, idempotent wear log,
  signals derive/list/state (snooze/dismiss/pause with until), money state,
  notifications read, privacy export + confirm-gated wipe.
- Signal engine (Phase 3) + first cross-domain signal (Phase 4): renewal,
  price-change, unworn, CPW-milestone, wardrobe×money per-wear cost — all
  dedup-key idempotent.
- E2E verified against the live Neon database: create → wear (repeat key
  returns duplicate:true) → cross-domain signal → snooze → notifications →
  export → cross-principal isolation (fresh session sees zero) → wipe
  confirm-gate 400 → wipe → empty. Fixed a PK-collision bug in notification
  seeding (ids are now fresh; dedupKey owns idempotency).
- Night mode redesigned: single-point `light-dark()` token palette (zero
  duplicated blocks, static fallback for older browsers), warm-basalt night
  family harmonized with the paper brand (never gray/flat black), parchment
  ink, AA-checked muted/on-* pairs; themeColor + manifest updated.
- Motion: motion/react springs (stiffness 300 / damping 30) — drawer slide
  + stagger + focus management, garment/finding card entrances + hover,
  briefing status, button press scale, landing `Reveal` client leaf (RSC
  preserved). Everything collapses under prefers-reduced-motion.
- Privacy hub no longer demo: export downloads the real principal-scoped
  snapshot; wipe really deletes after two-step confirm; disconnect is
  honestly disabled until a source connection exists.
- Verification: 41 vitest green, tsc clean, build clean (0 errors),
  production smoke 200 across all 8 routes + API workflow above.
- Next: Telegram delivery gates (Phase 5), Cloudinary signed uploads, real
  auth provider swap-in point documented in sessionCrypto/identity.

## Protocol step record — Phase 2 wardrobe + audit surfaces (complete)

- Direction decision (user-approved): keep Atlas identity + warm-paper system
  and Neon/Cloudinary direction; ADOPT the second prompt's screen concepts
  (command center, closet studio, scan terminal, cancel guide, privacy hub)
  as Atlas surfaces. Try-on/person-image simulation explicitly skipped (no
  consent infra in this release; `/looks` states this). No Clerk/Convex.
- Routes reorganized into `app/(app)/` group with adaptive shell: desktop
  dock + mobile bottom tab bar (safe-area padded), skip link, offline banner
  (`NetworkBanner`), aria-labelled icon-only nav (`AppNav`).
- Domain libs (pure + Vitest-pinned): `lib/wardrobe.ts` (provenance types,
  CPW that never fabricates, filters, upload state machine + validation
  bounds), `lib/audit.ts` (findings, annualization with unknown-cadence guard,
  scan state machine + percent), `lib/format.ts` (Intl money). Demo fixtures:
  `lib/demo/{inbox,wardrobe,audit}.ts`.
- New surfaces: `/wardrobe` (URL-stateful filter rail, garment cards with
  CPW pills, needs-confirmation queue), `/wardrobe/add` (capture flow: file
  picker w/ camera hint, local preview + retake, upload state machine,
  tag-review with model-confidence pills; user edits recorded as
  user-confirmed provenance), `/looks` (vibe composer, deterministic planner
  over CONFIRMED garments only, no-try-on note), `/money` (annualized summary
  w/ cadence assumption, evidence drawers w/ sanitized snippets, manual
  cancel guide), `/sources` (gmail.readonly permissions banner, demo scan
  terminal w/ radial gauge + counters + aria-live log), `/settings/privacy`
  (disconnect/export/wipe with two-step confirms + aria-live status), inbox
  command strip (annualized cost, avg CPW, owned value, urgent ribbon — all
  carry assumptions, no vanity metrics).
- Verification: 27 vitest tests green, tsc clean, next build clean
  (14 routes), start smoke: all routes 200 incl. filters/query/review
  params, 404 for unknown signal, content assertions passed. One corrupted
  `.next` (rebuild-while-serving) caused transient 500s; resolved by clean
  rebuild — no code issue.
- Next: Postgres migration + server adapter (Phase 2 backend half), then
  signals layer.

## Protocol step record — Phase 1 brand + shell (complete)

- New `atlas-web/` Next.js 15 App Router app (bun; port 4300): landing page
  (value pitch, four questions, security boundaries), `/inbox` with Signal
  Cards + waypoint motif + source rail, `/signals/[id]` detail with Why panel
  and "What Atlas did not do", `not-found`, `error` boundary.
- Real brand assets generated (`scripts/generate_icons.py`, Pillow): 192/512
  normal + maskable icons, favicon.ico, apple icon — route/waypoint mark with
  soft-gap uncertainty, per `brand-spec.md`.
- PWA: `manifest.ts` (standalone, maskable icons), `public/sw.js`
  (network-first navigations, cache-first static shell only, never caches
  `/api/*` or private responses, versioned caches + cleanup), browser-only SW
  registration component.
- Demo mode: labelled synthetic inbox (`demoData.ts`) pinned by Vitest
  (`tests/demoLabelling.test.ts`: mode declared, sources labelled, capability
  ≤ prepare, deterministic ids).
- Verification: vitest 5/5, `tsc --noEmit` clean, `next build` clean (route
  table: /, /inbox, /signals/[id], manifest), `next start` smoke: all routes
  200 + demo banner text rendered.
- Backend untouched in this phase; policy/consent remain in `nanobot/atlas`.
- Next unchecked checklist item: §2.5 Communication remainder stays paused;
  Phase 2 wardrobe integration (uploads + confirmation flow on Atlas
  contracts) is the next planned phase.

## Protocol step record — Phase 0 baseline + decision records (complete)

- Team `dripadvisor` application (from `drip.zip`) inspected in full:
  contracts, routers (all `publicProcedure`, owner-0 fallback), store with
  in-memory fallback + unconditional-id delete on the Drizzle path, Neon raw
  SQL (owner-scoped delete correct there), Muse/MuseImage server model calls,
  weather snapshot, MySQL Drizzle schema. Findings + dispositions recorded in
  `docs/atlas-threat-model.md`; full matrix in `docs/atlas-feature-matrix.md`;
  decisions in `docs/atlas-integration-decision.md`; product rules in
  `docs/atlas-product-contract.md`; visual direction in
  `docs/atlas-design-system.md` + `brand-spec.md`.
- Baseline repairs (no behavior change):
  1. Test hermeticity: five placeholder-env tests cleared canonical
     `ATLAS_GOOGLE_*`/`ATLAS_SERPAPI_API_KEY` names first — real ambient
     credentials previously won alias priority (one test could attempt a real
     OAuth POST; none did in CI where creds are absent).
  2. Live demo test now grants consent in an isolated store instead of
     failing on the correct `consent_missing` denial.
  3. `gmail.py` strict-typing casts over untyped provider JSON (0 basedpyright
     errors on `nanobot/atlas`).
- Verification at step completion: **158 passed / 6 skipped** (tests/atlas),
  ruff clean, basedpyright strict: 0 errors.
- Phase 1 entry criteria: product contract + threat model + feature matrix
  acknowledged; Next.js shell build begins with the route tree and demo mode.

## Verification commands

```bash
uv run --no-sync pytest tests/atlas tests/agent/test_model_runtime_resolver.py -q
uv run --no-sync ruff check nanobot/atlas scripts/atlas_diagnose.py tests/atlas
uv run --no-sync basedpyright nanobot/atlas
uv run --no-sync python scripts/atlas_diagnose.py
```

## Checkpoint log

- `3b0db71` — Atlas runtime diagnostics + connector hardening (baseline).
- `4e1e665` — placeholder-safe credential reads (rule 6), tri-state
  diagnostics, deterministic MCP reconnect test.
- `5e1afca` — Money Guard: Plaid Sandbox read-only connector +
  deterministic recurring/price-change detection + `money_guard` chain path.
  Verification: 59 passed / 8 skipped (tests/atlas), ruff clean, basedpyright
  strict clean on nanobot/atlas.
- `257c360` — Wardrobe Help: deterministic outfit/care/packing rules,
  `garments` store kind, `wardrobe_research` chain path. Verification:
  70 passed / 8 skipped (tests/atlas), ruff clean, basedpyright strict clean
  on nanobot/atlas.
- `c87df8e` — Drip Advice: deterministic delivery engine (one-at-a-time,
  quiet hours, cooldown, snooze/dismiss/correction, dedup keys). Verification:
  81 passed / 8 skipped (tests/atlas), ruff clean, basedpyright strict clean
  on nanobot/atlas.
- `3e3bd46` — Outcome Verification state machine (15 states, legal-
  transition table, refreshed-evidence-only verification). Also: whole
  `nanobot/atlas` package now basedpyright-strict clean (fixed pre-existing
  errors in model_factory.py/stage1.py). Verification: 108 passed /
  8 skipped (tests/atlas + resolver), ruff clean.
- `e9f117c` — Cross-Domain Resolution: deterministic pair allowlist
  with two-domain cap. Verification: 100 passed / 8 skipped (tests/atlas),
  ruff clean, basedpyright strict clean on nanobot/atlas.
- `7558243` — Edge service adapter (`service.py`) + store consent
  records + `ConnectorContext.chat_id` field. Verification: 105 passed /
  8 skipped (tests/atlas), ruff clean, basedpyright strict clean.
- `a013e74` — Capability bundles (`bundles.py`) with deterministic
  blocked/gated invariants. Verification: 113 passed / 8 skipped
  (tests/atlas), ruff clean, basedpyright strict clean.
- `83071e0` — Consolidated §7 policy rule tests. Verification:
  141 passed / 8 skipped (tests/atlas + resolver), ruff clean, basedpyright
  strict clean.
- `1d217e7` — Demo-path credential gating: registry plain-alias
  fallback + placeholder rejection; NOT_CONFIGURED short-circuits before
  provider access in google_tasks/serpapi. Verification: 135 passed /
  8 skipped (tests/atlas), ruff clean, basedpyright strict clean.
- (this commit) — Live demo path: `scripts/atlas_demo.py` + service
  scope fix (server-derived verified-context scopes). Verification:
  141 passed / 9 skipped (tests/atlas), ruff clean, basedpyright strict
  clean on nanobot/atlas + scripts/atlas_demo.py.

### atlas-web (Next.js frontend, under active development)

- `5e97644` — Phase 0 baseline records + backend test-hermeticity repairs.
- `1c8a34b` — Next.js 15 App Router shell: landing, inbox, signal detail,
  PWA manifest + service worker, labelled demo mode.
- `75e435f` — Wardrobe/money/sources/privacy surfaces, adaptive shell
  (desktop dock, mobile tab bar), 22 tests.
- `629b574` — Dual-theme engine (`light-dark()` tokens, FOUC guard),
  editorial landing with Daily Loop, Sentinel header, notification drawer,
  morning briefing, motion polish. 30 tests.
- `5887bc8` — Real backend integration: middleware-minted HMAC sessions
  (RSC-safe), Postgres store with committed migrations + race-guarded
  journal, deterministic signal engine incl. cross-domain wardrobe×money
  rule, API routes (wardrobe/wear/signals/money/notifications/privacy),
  idempotent wear logging, night-mode redesign (warm basalt), motion/react
  animation layer. 41 tests. Full workflow smoke-verified against live
  Postgres incl. cross-principal isolation and wipe.
- `313f764` — Stop tracking legacy dev session secret file.
- (this commit) — Real image pipeline: signed Cloudinary uploads
  (`lib/server/cloudinary.ts`, server-only), magic-byte/dimension image
  validation, consent gate enforced server-side before upload (revoked
  consent → 403, verified), owner-scoped signed asset view route,
  delete with real provider cleanup, PATCH garment confirm, idempotency-key
  consumption. Migration `002_assets_consent.sql`. Capture flow rebuilt:
  consent disclosure panel, honest provider-unavailable state, user-entered
  tags until an analysis provider is configured. Compliance review +
  local runbook added (`docs/atlas-compliance-review.md`,
  `docs/atlas-run-local.md`). Verification: 41 tests, tsc clean, build
  clean, live smoke incl. non-owner 404 and provider cleanup.
- (this commit) — First-release pass (Clerk + Gmail): `@clerk/nextjs`
  integrated per the official quickstart (provider inside `<body>`,
  sign-in/sign-up routes, env-flagged so unconfigured deployments stay in
  the labelled local mode). Clerk is the sole identity authority when
  configured: middleware composes `clerkMiddleware` + session bootstrap,
  verified userId binds server-side into the Atlas session cookie, RSC
  reads identity read-only. Migration `003_sources_email.sql`
  (source_connections, oauth_states, email_findings, scan_jobs) with
  store methods on both backends. Real Gmail `gmail.readonly`
  authorization-code flow with PKCE + state binding
  (`lib/server/gmail.ts`, connect/callback/disconnect/status/scan
  routes), AES-256-GCM encrypted refresh tokens
  (`lib/server/secretBox.ts`), bounded metadata-only extraction
  (`lib/server/emailExtraction.ts`, extraction-versioned, pinned by
  tests), idempotent finding upserts, deterministic promotion into Money
  Guard findings, disconnect = revoke + token destroy + evidence delete.
  `/sources` rebuilt with the real Gmail connection panel + explicit
  Clerk-vs-Gmail consent separation; demo ScanTerminal retired;
  `/inbox` rewired to real store data. Unconfigured providers show
  honest setup-guidance states (verified 503s), never simulated
  success. 49 tests, tsc clean, build clean, production smoke: all
  routes 200, wear idempotency, cross-domain signal derivation,
  snooze, export, wipe with confirm gate.

## Product documentation and deployment handoff (2026-09-12)

- Repository synchronized to `15a4af0` from `origin/main`.
- Preserved the previous nanobot README at `docs/nanobot-original-README.md`.
- Replaced the root README with an Atlas-focused project README covering product scope, architecture, local setup, real-agent proof, safety, wardrobe-image boundaries, MCP, deployment, and hackathon disclosure.
- Added `docs/atlas-workflow.md` covering the user workflow across WebUI, Telegram, background Drip Advice, MCP/skills, picture-based Wardrobe Help, and the five-minute demo.
- Added `docs/atlas-local-quickstart.md` with beginner-friendly local commands for diagnostics, Strands proof, Atlas demo, connector smoke tests, WebUI startup, and memory updates.
- Added `docs/atlas-vercel.md` documenting the recommended split: keep the Python nanobot/Atlas/Strands/Telegram backend on the existing container path; use Vercel only for a separate frontend or thin proxy if there is a concrete reason.
- Added `.github/workflows/atlas-ci.yml` for credential-free Atlas tests, Ruff, BasedPyright, compilation, and tracked-secret checks.
- Picture-based wardrobe advice is documented as a privacy-preserving next extension: private object storage, opaque user-scoped reference, explicit consent, deletion/revocation, and no sensitive attribute inference. Binary image upload is not yet wired into the WebUI.

### Next product implementation priority

1. Wire the existing WebUI chat/API to `AtlasService` through one shared request contract.
2. Add Atlas Inbox/evidence/recommendation/approval cards using existing WebUI components.
3. Add Telegram inbound/callback projection using the same Atlas response contract.
4. Add a user-scoped private image upload path only after the core WebUI/Telegram flow is working.
5. Re-run Atlas regression and WebUI checks, then create a checkpoint commit.

## Local run and demo handoff (2026-09-12)

- Added `docs/atlas-run-local-demo.md` with the exact bundled WebUI/gateway mode,
  separate Vite frontend mode, Atlas CLI proof commands, Telegram setup/pairing,
  local testing sequence, demo-video flow, and troubleshooting.
- Canonical first demo command: `uv run nanobot webui`, then configure the model
  in Settings → Models and open `http://127.0.0.1:8765`.
- Vite development mode: keep `uv run nanobot gateway` running in one terminal;
  run `NANOBOT_API_URL=http://127.0.0.1:8765 bun run dev` from `webui/` in a
  second terminal and open `http://127.0.0.1:5173`.
- Telegram currently runs through the existing nanobot gateway/channel with
  long polling and pairing-only access. The Atlas-specific service/cards are
  not yet fully mounted into the Telegram inbound handler; do not claim that
  direct Atlas Telegram callbacks are complete until that integration lands.

## Next-person rebrand and domain task (2026-09-12)

- Added `docs/atlas-rebrand-handoff.md` as the authoritative next-stage task
  for making the visible product feel original to Atlas: name, tagline, visual
  system, browser copy, Atlas Inbox cards, public domain, deployment boundary,
  Telegram Atlas callbacks, privacy, and demo polish.
- The next teammate should not block on paid fashion APIs, production banking,
  Gmail writes, mobile apps, public webhooks, or replacing nanobot. The priority
  is an original Atlas surface over the verified read-only Strands vertical
  slice.
- Pairing approval is an administrative access action, not an LLM turn. A
  successful `/pairing approve CODE` normally produces no “thinking” response;
  the user must send a new ordinary message after approval. The code expires
  after 10 minutes and must be approved from an already trusted local/WebUI
  surface, not from the still-unapproved Telegram account itself.
