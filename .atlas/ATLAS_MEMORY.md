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
