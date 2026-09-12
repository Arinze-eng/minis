# Atlas

## A consent-based life-admin agent that prepares the next move and asks before it acts

Atlas is an Everyday Agent built on top of the existing nanobot runtime and the AWS Strands Agents SDK. It watches only sources a user explicitly authorizes, performs safe internal work automatically, and interrupts the user only when a meaningful decision or approval is needed.

> **Atlas notices the work I am avoiding or the money I am losing, prepares the next move, and asks before it acts.**

Atlas is designed for ordinary users, not developers. A user can ask what to do next, research a product, request a reminder, ask why a recommendation was made, correct the agent, snooze an item, or pause access. The same Atlas case model is intended to power the WebUI, Telegram, CLI, and future integrations.

## What Atlas does

| Capability | What the user receives | Current boundary |
|---|---|---|
| **Task Start** | One small next action from pending or overdue tasks | Google Tasks is read-only in the MVP |
| **Money Guard** | Evidence-backed recurring-charge and price-change review | Plaid Sandbox/read-only; no payments or transfers |
| **Research** | A bounded source-backed comparison or recommendation | SerpApi/read-only; no purchasing |
| **Wardrobe Help** | Outfit, care, repair, or packing guidance | Uses user-provided garment records; no identity or body judgments |
| **Drip Advice** | One contextual suggestion at a time | Quiet hours, cooldown, snooze, dismiss, correction, and deduplication |
| **Communication** | Recommendation and approval cards | Telegram delivery requires explicit flag and consent |
| **Cross-domain resolution** | One practical action from at most two domains | Deterministic pair allowlist |
| **Outcome verification** | Verified, stale, unavailable, or unresolved result | Verification requires refreshed post-attempt evidence |

## How a user interacts with Atlas

Atlas is not a blank chatbot that expects technical commands. The intended experience is a calm inbox of evidence-backed cases.

A user can type:

```text
What should I do next?
Find a cheaper reliable alternative to this product.
Remind me about this on Friday.
Why are you recommending this?
I already completed this.
Pause reminders for this type of advice.
What can Atlas access?
```

The system routes the request internally, checks consent, selects a bounded Strands tool bundle, gathers evidence, and returns one clear next action. External side effects remain behind an exact approval boundary.

## Architecture

```text
WebUI / Telegram / CLI / scheduled trigger
                    |
                    v
        verified request and user context
                    |
                    v
          consent and capability policy
                    |
                    v
             AtlasService / chain router
                    |
                    v
       one AWS Strands Agent + bounded tools
                    |
                    v
 Google Tasks | SerpApi | Plaid Sandbox | Gmail read-only
                    |
                    v
          normalized evidence and trace
                    |
                    v
 recommendation | draft | approval request | drip advice
                    |
                    v
       WebUI card / Telegram card / outcome state
```

The nanobot runtime continues to own the existing channels, sessions, memory, provider routing, MCP support, and gateway. Atlas is an edge product layer; it does not replace the existing `AgentLoop` or `AgentRunner`.

## Real agent proof

The strongest local proof is the read-only Task Start path:

```text
user request
→ verified identity
→ stored Google Tasks consent
→ real Google Tasks read
→ normalized evidence
→ real Strands Agent
→ typed recommendation
→ console/WebUI card
```

The basic Strands proof is also available:

```bash
uv run --no-sync python scripts/atlas_stage1_smoke.py
```

A successful run must report that the real Strands Agent executed and called a tool. The full Atlas demo is:

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario task_start \
  --query "What should I do next?" \
  --grant-consent
```

For machine-readable output:

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario task_start \
  --query "What should I do next?" \
  --grant-consent \
  --json
```

The demo is read-only and never sends Telegram messages. Delivery requires a separate explicit send path.

## Local setup

Requirements:

- Python 3.11 or newer;
- `uv`;
- Git;
- a Groq or Gemini free-tier model key;
- Google OAuth credentials and a refresh token for Google Tasks, if using that connector;
- SerpApi key for product research, if using that connector;
- Telegram bot token for Telegram health and delivery tests.

Install dependencies:

```bash
uv sync --extra atlas --extra dev
```

Create `.env.local` locally. Never commit it:

```dotenv
GROQ_API_KEY=...
ATLAS_MODEL_PROVIDER=groq
ATLAS_MODEL_ID=openai/gpt-oss-120b

ATLAS_GOOGLE_CLIENT_ID=...
ATLAS_GOOGLE_CLIENT_SECRET=...
ATLAS_GOOGLE_REFRESH_TOKEN=...
ATLAS_ENABLE_GOOGLE_TASKS=true
ATLAS_ENABLE_GOOGLE_OAUTH_PROBE=true

ATLAS_SERPAPI_API_KEY=...
ATLAS_ENABLE_SERPAPI=true

TELEGRAM_BOT_TOKEN=...
ATLAS_ENABLE_TELEGRAM_DELIVERY=false
```

Load the file without printing secrets:

```bash
set -a
source .env.local
set +a
```

On Windows Git Bash, use the same commands. In PowerShell, use the equivalent `$env:NAME = "value"` assignments or the repository's local environment loader.

Run secret-safe diagnostics:

```bash
uv run --no-sync python scripts/atlas_diagnose.py
uv run --no-sync python scripts/atlas_diagnose.py --health
```

The diagnostics report only `set`, `missing`, or `placeholder` states.

## Tests

Offline Atlas tests:

```bash
uv run --no-sync pytest tests/atlas -q
```

Runtime and MCP regression checks:

```bash
uv run --no-sync pytest tests/agent/test_model_runtime_resolver.py -q
uv run --no-sync pytest tests/agent/test_mcp_reconnect_crash.py -q
```

Static checks:

```bash
uv run --no-sync ruff check nanobot/atlas scripts tests/atlas
uv run --no-sync basedpyright nanobot/atlas
uv run --no-sync python -m compileall -q nanobot scripts tests
```

Credential-gated read-only smoke checks:

```bash
uv run --no-sync pytest tests/atlas/test_connector_smoke.py -m atlas_smoke -v
```

A smoke test may skip when its explicit feature flag or credential is absent. It must never silently use a fixture for the real-provider demo.

## Safety model

Atlas enforces policy in deterministic code rather than relying on prompts. Identity comes from verified request/session context. Every connector call re-checks consent immediately before access. Tools declare capabilities. Approval requests bind an exact payload hash, nonce, expiry, identity, and action type. External side effects carry idempotency keys and redacted audit metadata. The model cannot authorize itself.

The MVP does not make purchases, payments, transfers, disputes, subscription cancellations, destructive Gmail operations, arbitrary browser mutations, or arbitrary MCP mutations. Wardrobe guidance uses only user-provided attributes and does not infer sensitive characteristics.

## Wardrobe and picture-based drip advice

The initial Wardrobe Help path uses explicit garment records because it is deterministic, cheap, and safe for the hackathon. A future image intake path may let a user photograph a garment or outfit and store an opaque object reference plus user-provided description. The image should be stored in private object storage, scoped to the authenticated user, encrypted or access-controlled, and represented in Atlas state by a non-sensitive reference rather than raw image bytes.

The agent must not infer identity, attractiveness, body value, age, ethnicity, health, or gender from a photograph. It may use an image only for an explicitly requested clothing task, and the user must be able to delete the image and revoke image access. The implementation workflow for this extension is documented in [`docs/atlas-workflow.md`](docs/atlas-workflow.md).

## MCP and skills

Atlas reuses nanobot's MCP and skills surfaces. MCP servers are not discovered or enabled arbitrarily by the model. Each scenario has an allowlist of servers and tools, explicit consent requirements, timeouts, and audit metadata. Research tools must return source references and timestamps. Shell, filesystem mutation, payments, purchases, and account/security changes are not available to Atlas MVP chains.

## Deployment choice

The existing repository has a Docker and Render-oriented deployment surface. The recommended first deployment is the existing container path because Atlas includes Python, Strands, the nanobot gateway, Telegram, and background/runtime behavior.

Vercel can be useful for a separate frontend or thin HTTPS proxy, but it is not the natural host for the complete Python nanobot process or a continuously running Telegram polling/gateway worker. If Vercel is used, keep the Atlas backend and Telegram worker on the existing Python host and use Vercel only for a frontend or carefully bounded serverless endpoint. See [`docs/atlas-vercel.md`](docs/atlas-vercel.md).

## Hackathon disclosure

Atlas is submitted to the Everyday Agents track of the Agents for Humans Hackathon. It uses the AWS Strands Agents SDK as the real orchestration layer. The repository is an extension of the `Arinze-eng/minis` nanobot starter framework; this pre-existing template and incorporated open-source components should be disclosed in the submission.

The submission requires a public repository, README, MIT or Apache license, architecture diagram, and a public video of no more than five minutes showing the working project and explaining the problem, audience, and importance. AWS Builder ID is required in the submission; it is a personal identity separate from an AWS account. Amazon Bedrock AgentCore is encouraged but not required.

## Project files

- [`docs/nanobot-original-README.md`](docs/nanobot-original-README.md) — preserved original upstream README;
- [`docs/atlas-local-quickstart.md`](docs/atlas-local-quickstart.md) — beginner-friendly local walkthrough;
- [`docs/atlas-run-local-demo.md`](docs/atlas-run-local-demo.md) — frontend/backend, Vite, Telegram, testing, and presentation runbook;
- [`docs/atlas-workflow.md`](docs/atlas-workflow.md) — user workflow, background behavior, image privacy, MCP, and demo plan;
- [`docs/atlas-vercel.md`](docs/atlas-vercel.md) — Vercel tradeoffs and deployment topology;
- [`.atlas/ATLAS_MEMORY.md`](.atlas/ATLAS_MEMORY.md) — persistent implementation checklist;
- [`scripts/atlas_demo.py`](scripts/atlas_demo.py) — read-only Atlas service demo;
- [`scripts/atlas_stage1_smoke.py`](scripts/atlas_stage1_smoke.py) — real Strands/tool-call proof.
