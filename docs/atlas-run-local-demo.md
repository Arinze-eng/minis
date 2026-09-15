# Atlas Local Full-Stack Runbook

This runbook explains how to run the repository locally for development, testing, Telegram interaction, and the Atlas agent product.

## Architecture in one view

```text
Browser WebUI or Telegram
          |
          v
nanobot gateway
  - WebSocket WebUI channel
  - Telegram channel
  - model/provider configuration
  - sessions, memory, automations, MCP
          |
          v
normal nanobot AgentLoop

Atlas proof path today:

scripts/atlas_demo.py
  -> AtlasService
  -> consent/policy
  -> real connector
  -> real Strands Agent
  -> typed recommendation
```

The nanobot gateway owns the Python agent runtime, channels, sessions, automations, MCP, and provider routing. `atlas-web` is the production browser surface: its Next.js Route Handlers call the same authenticated Atlas store and policy boundary, with Postgres as the durable store when `DATABASE_URL` is configured. Telegram and the browser therefore share the same consent and capability model even though they use different presentation channels.

## Before starting

Install:

```bash
uv sync --extra atlas --extra dev
```

If you intend to edit or develop the frontend itself, install its dependencies:

```bash
cd webui
bun install --frozen-lockfile
cd ..
```

Create `.env.local` in the repository root. Keep it ignored and never commit it:

```dotenv
# Model used by the Atlas Strands path
GROQ_API_KEY=...
ATLAS_MODEL_PROVIDER=groq
ATLAS_MODEL_ID=openai/gpt-oss-120b

# Google Tasks / Gmail OAuth
ATLAS_GOOGLE_CLIENT_ID=...
ATLAS_GOOGLE_CLIENT_SECRET=...
ATLAS_GOOGLE_REFRESH_TOKEN=...
ATLAS_ENABLE_GOOGLE_TASKS=true
ATLAS_ENABLE_GOOGLE_OAUTH_PROBE=true

# Product research
ATLAS_SERPAPI_API_KEY=...
ATLAS_ENABLE_SERPAPI=true

# Telegram channel credentials are normally configured through WebUI Settings
TELEGRAM_BOT_TOKEN=...
ATLAS_ENABLE_TELEGRAM_DELIVERY=false
```

Load the variables into the shell before running Atlas commands:

```bash
set -a
source .env.local
set +a
```

On Windows PowerShell, set the variables through the shell or configure the provider/channel in the WebUI. The nanobot gateway primarily reads its provider and channel configuration from its nanobot configuration, so do not assume that a repository `.env.local` alone configures the WebUI gateway.

## Mode A: easiest local run (recommended for the first demo)

This mode uses the bundled frontend served by nanobot. It is the best option for a presentation because it uses one command and avoids frontend/backend proxy confusion.

### Terminal 1: start the WebUI and gateway

```bash
uv run nanobot webui
```

Open:

```text
http://127.0.0.1:8765
```

The launcher starts or joins the local gateway and serves the WebUI through the WebSocket channel. In the browser:

1. Open **Settings → Models**.
2. Configure Groq, Gemini, or another supported provider.
3. Select an active model.
4. Start a new topic.
5. Send `Hello!`.

After the ordinary nanobot reply works, open **Settings → Channels → Telegram** and configure Telegram there.

### Keep the backend alive

If you do not want the gateway to stop when the WebUI terminal closes:

```bash
uv run nanobot gateway --background
```

Check it:

```bash
uv run nanobot gateway status
```

View logs:

```bash
uv run nanobot gateway logs --no-follow
```

Follow logs live:

```bash
uv run nanobot gateway logs
```

Stop it:

```bash
uv run nanobot gateway stop
```

## Mode B: separate frontend development server

Use this mode when actively editing React/TypeScript files in `webui/`.

### Terminal 1: backend/gateway

Start the nanobot gateway:

```bash
uv run nanobot gateway
```

The gateway health endpoint is normally:

```text
http://127.0.0.1:18790
```

The browser WebSocket/WebUI endpoint is normally served on port `8765` by the WebSocket channel.

### Terminal 2: Vite frontend

From the repository root:

```bash
cd webui
NANOBOT_API_URL=http://127.0.0.1:8765 bun run dev
```

Open:

```text
http://127.0.0.1:5173
```

The Vite configuration proxies `/webui`, `/api`, and `/auth` to `NANOBOT_API_URL`. The nanobot application WebSocket is opened directly by the browser; Vite's HMR socket uses its own path.

On Windows PowerShell:

```powershell
cd webui
$env:NANOBOT_API_URL="http://127.0.0.1:8765"
bun run dev
```

Use the bundled WebUI mode if the Vite mode shows a blank page, authentication issue, or WebSocket issue. The bundled mode is the canonical presentation path.

### Frontend checks

```bash
cd webui
bun run lint
bun run test:coverage
bun run build
```

The build output is written to the repository's nanobot web distribution directory and is normally picked up by the packaged WebUI launcher.

## Run the real Atlas proof path

The Atlas demo is read-only and does not send Telegram messages.

### Prove Strands itself

```bash
uv run --no-sync python scripts/atlas_stage1_smoke.py
```

This should show that a real Strands Agent executed and called the bounded tool path.

### Run Google Tasks Task Start

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario task_start \
  --query "What should I do next?" \
  --grant-consent
```

Run it again without granting consent to verify stored consent behavior:

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario task_start \
  --query "What should I do next?"
```

### Run Shopping Research

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario shopping_research \
  --query "Find a reliable lower-cost alternative to a winter jacket" \
  --grant-consent
```

### Use JSON output for a demo capture

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario task_start \
  --query "What should I do next?" \
  --json
```

The demo output should show scenario, status, connector, provider, evidence count, and recommendation. It must never print credentials.

## Telegram setup and interaction

### Create or use a Telegram bot

Use Telegram's `@BotFather` to create a bot and copy its token. If the token is exposed, regenerate it immediately.

### Configure Telegram in the WebUI

With the gateway running:

1. Open `http://127.0.0.1:8765`.
2. Open **Settings → Channels → Telegram**.
3. Install or enable Telegram support if prompted.
4. Paste the BotFather token.
5. Save and enable Telegram.
6. Keep pairing-only access enabled for the first test.

Telegram uses long polling by default, which is the easiest local mode. A public HTTPS webhook is not needed for local testing.

### Test the bot

1. Open Telegram.
2. Find your bot.
3. Send a private message such as:

```text
Hello from Atlas testing
```

4. The bot should return a pairing code.
5. Approve the pairing code through the trusted local surface:

```bash
uv run nanobot agent -m "/pairing approve YOUR-CODE"
```

6. Send the message again.

At this stage, the Telegram response is the normal nanobot agent-loop response. Atlas-specific evidence cards, approval callbacks, and `AtlasService` routing are not yet fully mounted into the Telegram message handler. The current Atlas Telegram delivery connector is separately gated and can format/send a bounded recommendation card only when its feature flag, consent, trusted chat ID, and explicit send flag all pass.

### Telegram read-only health test

Keep delivery disabled while testing:

```bash
export ATLAS_ENABLE_TELEGRAM_DELIVERY=false
uv run --no-sync pytest tests/atlas/test_connector_smoke.py \
  -k telegram -m atlas_smoke -v
```

The manual Atlas demo always uses `send_flag=False`.

## Full local test sequence

Run diagnostics:

```bash
uv run --no-sync python scripts/atlas_diagnose.py
uv run --no-sync python scripts/atlas_diagnose.py --health
```

Run Atlas tests:

```bash
uv run --no-sync pytest tests/atlas -q
```

Run static validation:

```bash
uv run --no-sync ruff check nanobot/atlas scripts tests/atlas
uv run --no-sync basedpyright nanobot/atlas
uv run --no-sync python -m compileall -q nanobot scripts tests
```

Run the broader repository suite in chunks if needed:

```bash
uv run --no-sync pytest tests/agent -q
uv run --no-sync pytest tests/channels -q
uv run --no-sync pytest -q --maxfail=1
```

## Presentation/demo video plan

Use two terminal windows and one browser window.

### Before recording

Run the diagnostics command and confirm the required credentials show as `set`, not `placeholder`. Start the gateway and open the bundled WebUI. Confirm the model replies to `Hello!`. Confirm Telegram is paired but keep destructive or external writes disabled.

### Demo sequence

1. Explain the problem: unfinished obligations, recurring money leaks, and decision fatigue.
2. Show Atlas's promise: it notices, prepares the next move, and asks before acting.
3. In the WebUI, ask `What should I do next?`.
4. Explain that Atlas uses an explicitly authorized source.
5. Run the read-only Atlas Task Start command in a terminal or show its captured output.
6. Point out the real connector, evidence count, provider, and recommendation.
7. Show the safety result: no external write happened.
8. Send a similar question to Telegram and show that the same nanobot runtime can answer there.
9. Show the Atlas memory/checklist and policy tests briefly.
10. Close with the roadmap: direct Atlas Inbox and Telegram card integration, then private wardrobe image intake.

Do not claim that Atlas-specific WebUI cards or Telegram callbacks are complete until those routes are actually connected to `AtlasService`.

## Troubleshooting

### Browser opens but model does not reply

Configure the model under **Settings → Models**, verify the provider key, and send `Hello!` before testing Atlas. Inspect:

```bash
uv run nanobot gateway logs --no-follow
```

### Vite page is blank or disconnected

Use the bundled launcher first. If using Vite, confirm the gateway is running on `127.0.0.1:8765` and start Vite with:

```bash
NANOBOT_API_URL=http://127.0.0.1:8765 bun run dev
```

### Telegram token is accepted but no message arrives

Confirm the gateway is still running, Telegram support is enabled, the bot token is current, and the bot is being contacted by private DM. Run:

```bash
uv run nanobot channels status
uv run nanobot gateway --verbose
```

### Telegram pairing code appears

That is expected. Approve it from a trusted local nanobot surface, then send the message again.

### Atlas reports `NOT_CONFIGURED`

Run diagnostics. Confirm the relevant `ATLAS_ENABLE_*` flag is enabled and the credential is not blank or a placeholder. The Atlas connectors intentionally stop before provider access when credentials are unusable.

### Atlas reports `consent_missing`

Run the demo once with `--grant-consent`, or implement the consent UI before asking the service to read a provider.
