# Atlas Local Quickstart

This guide is for a team member who wants to run Atlas locally without needing to understand the internal architecture first.

## 1. Open the repository

```bash
cd /path/to/minis
```

On Windows Git Bash, use the Windows checkout path, for example:

```bash
cd ~/Documents/chinaza/builds/hackathon/minis
```

## 2. Install dependencies

```bash
uv sync --extra atlas --extra dev
```

## 3. Configure local credentials

Create `.env.local` and keep it ignored by Git. Use only the variables needed for the connectors you want to test:

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

Never paste values into a public issue, README, commit, screenshot, or Atlas memory file.

Load the file:

```bash
set -a
source .env.local
set +a
```

Run secret-safe diagnostics:

```bash
uv run --no-sync python scripts/atlas_diagnose.py
uv run --no-sync python scripts/atlas_diagnose.py --health
```

## 4. Prove the real Strands Agent

```bash
uv run --no-sync python scripts/atlas_stage1_smoke.py
```

Look for:

```text
[pass] Stage 1: real Strands Agent executed; tool called through Strands; result validated with Atlas types
```

## 5. Prove the real Atlas Task Start path

If consent has not been recorded for the local demo user:

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario task_start \
  --query "What should I do next?" \
  --grant-consent
```

Run it again without the grant flag to demonstrate stored consent:

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario task_start \
  --query "What should I do next?"
```

Use JSON output when collecting redacted evidence for the hackathon record:

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario task_start \
  --query "What should I do next?" \
  --json
```

## 6. Test product research

```bash
export ATLAS_ENABLE_SERPAPI=true
uv run --no-sync python scripts/atlas_demo.py \
  --scenario shopping_research \
  --query "Find a reliable lower-cost winter jacket" \
  --grant-consent
```

## 7. Test the Telegram credential without sending a message

```bash
export ATLAS_ENABLE_TELEGRAM_DELIVERY=true
uv run --no-sync pytest tests/atlas/test_connector_smoke.py \
  -k telegram -m atlas_smoke -v
```

This uses the read-only `getMe` health operation. The demo script itself keeps `send_flag=False`.

## 8. Test the application without real providers

```bash
uv run --no-sync pytest tests/atlas -q
uv run --no-sync ruff check nanobot/atlas scripts tests/atlas
uv run --no-sync basedpyright nanobot/atlas
```

Offline tests use deterministic fixtures. They should cover missing consent, unavailable providers, stale data, malformed payloads, approval invalidation, idempotency, Drip Advice, wardrobe rules, Money Guard, and cross-domain limits.

## 9. Run the broader repository checks

Run the repository tests in bounded chunks if the full suite is slow:

```bash
uv run --no-sync pytest tests/agent -q
uv run --no-sync pytest tests/channels -q
uv run --no-sync pytest -q --maxfail=1
```

Run the WebUI checks:

```bash
cd webui
bun install --frozen-lockfile
bun run lint
bun run test:coverage
bun run build
```

## 10. Start the existing WebUI

From the repository root:

```bash
uv run nanobot webui
```

The normal local URL is:

```text
http://127.0.0.1:8765
```

Use the existing WebUI for normal nanobot chat and settings. Atlas backend demonstrations remain available through `scripts/atlas_demo.py` until the Atlas Inbox is wired into the WebUI.

## 11. Persistent memory

After every local test session, update:

```text
.atlas/ATLAS_MEMORY.md
```

Record only redacted statuses:

```markdown
## Real provider checks

| Provider | Operation | Result | Error class |
|---|---|---|---|
| Google OAuth | refresh exchange | passed | none |
| Google Tasks | read-only list | passed | none |
| Groq | Strands tool call | passed | none |
| Telegram | getMe | passed | none |
```

Do not record API keys, refresh tokens, access tokens, raw task content, chat IDs, or private messages.
