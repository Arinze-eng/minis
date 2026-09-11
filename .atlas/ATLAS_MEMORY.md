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
- [ ] §2.3 Wardrobe Help — user-provided garment records + outfit/care/packing
      drafts (local fixtures allowed; no paid fashion API).
- [ ] §2.5 Communication (remainder) — explicit send-flag gating; Gmail
      read-only evidence summary.
- [ ] §2.6 Drip Advice — one-suggestion-at-a-time loop with cooldown, quiet
      hours, snooze/dismiss/correction, dedup (DripAdviceItem contract exists).
- [ ] §2.7 Cross-Domain Resolution — ≤2 domains per case.
- [ ] §2.8 Outcome Verification — verify recommendation vs approval vs
      execution vs verified result using refreshed evidence (VerifiedOutcome
      contract exists; flow not wired).
- [ ] Capability bundles (§5) — expose as explicit per-bundle tool sets.

### Policy tests (§7)

- [x] Client-supplied user IDs ignored; identity from verified context.
- [x] Capability declared before registration; consent re-checked per call.
- [x] Write/execute blocked in MVP (Money Guard: no transfer/pay/dispute/
      cancel; Google Tasks writes rejected until approval-gate stage).
- [ ] Explicit rule-by-rule table tests for every §7 rule in one place.

### Integration & delivery

- [ ] Edge adapter: channel/trigger → AuthenticatedAtlasContext → chain
      (WebUI + Telegram entry), preserving nanobot AgentLoop/AgentRunner.
- [ ] Live demo path: real connector (Google Tasks) + Groq, provider-
      unavailable fallback shown explicitly.
- [ ] WebUI Atlas surface (cards: evidence, recommendation, approval).

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
- (this commit) — Money Guard: Plaid Sandbox read-only connector +
  deterministic recurring/price-change detection + `money_guard` chain path.
  Verification: 59 passed / 8 skipped (tests/atlas), ruff clean, basedpyright
  strict clean on nanobot/atlas.
