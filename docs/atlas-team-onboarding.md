# Atlas Team Onboarding: Credentials, OAuth, Local Testing, and Telegram

This guide takes a new teammate from a clean machine to a verified Atlas demo. It is written for the current `Arinze-eng/minis` repository and distinguishes three things clearly:

1. **Normal nanobot operation:** the bundled WebUI and Telegram channel use the existing nanobot gateway and agent loop.
2. **Atlas proof operation:** `scripts/atlas_demo.py` runs the Atlas policy layer, real connector, and real AWS Strands Agent path.
3. **Future integration work:** direct Atlas Inbox cards and Atlas-specific Telegram approval callbacks still need to be mounted into the channel request path.

Do not claim that the third item is complete until the code is connected and tested end to end.

## 1. What the teammate will build locally

The completed local setup should support the following flow:

```text
Google Tasks / Gmail / SerpApi / Plaid Sandbox
                    |
                    v
             Atlas connectors
                    |
                    v
          consent and policy checks
                    |
                    v
             AWS Strands Agent
                    |
                    v
       evidence-backed recommendation
                    |
          +---------+---------+
          |                   |
       Atlas CLI           nanobot gateway
                              |
                    +---------+---------+
                    |                   |
                 WebUI              Telegram
```

Atlas is intentionally read-only for the first demonstration. It can inspect authorized data, normalize evidence, and prepare a recommendation. It must not silently send messages, purchase products, modify tasks, modify Gmail, or move money.

## 2. Accounts and credentials to prepare

Create or obtain only the credentials needed for the demo. The first successful demo can use only Groq plus either Google Tasks or SerpApi. Gmail, Plaid, Telegram, Gemini, MCP, and wardrobe features can be enabled progressively.

| Capability | Credential(s) | Required for first demo? | Local names |
|---|---|---:|---|
| Strands model | Groq API key or Gemini API key | Yes, one model provider | `GROQ_API_KEY` or `GEMINI_API_KEY` |
| Google Tasks | Google Desktop OAuth client ID, client secret, refresh token | Recommended | `ATLAS_GOOGLE_CLIENT_ID`, `ATLAS_GOOGLE_CLIENT_SECRET`, `ATLAS_GOOGLE_REFRESH_TOKEN` |
| Gmail summary | Same Google OAuth client and a refresh token containing Gmail read-only scope | Optional | Same Google variables plus `ATLAS_ENABLE_GMAIL=true` |
| Product research | SerpApi API key | Recommended alternative demo | `ATLAS_SERPAPI_API_KEY` |
| Telegram | BotFather bot token | Optional but useful for presentation | `TELEGRAM_BOT_TOKEN` |
| Money Guard | Plaid client ID, Sandbox secret, Sandbox access token | Optional | `ATLAS_PLAID_CLIENT_ID`, `ATLAS_PLAID_SECRET`, `ATLAS_PLAID_ACCESS_TOKEN` |
| MCP | Depends on the selected MCP server | Optional | Configure in WebUI Apps/MCP or nanobot config |

Never share credentials in GitHub issues, chat, screenshots, README files, `.atlas/ATLAS_MEMORY.md`, or video recordings. Each teammate should have their own local `.env.local` and their own OAuth grant where possible.

## 3. Machine prerequisites

Install the following:

- Git;
- Python 3.11 or newer;
- `uv`;
- Node.js and Bun for frontend development;
- a browser;
- a Telegram account if testing Telegram.

Verify:

```bash
git --version
python3 --version
uv --version
node --version
bun --version
```

Clone the repository:

```bash
git clone https://github.com/Arinze-eng/minis.git
cd minis
```

Confirm the expected branch and commit:

```bash
git checkout main
git pull --ff-only origin main
git status --short --branch
git log -1 --oneline
```

The repository should be clean before starting.

## 4. Install Python and frontend dependencies

Install the Atlas and development extras:

```bash
uv sync --extra atlas --extra dev
```

The `dev` extra includes `google-auth-oauthlib`, which is used by the local OAuth helper.

If the teammate will edit the WebUI source, install frontend dependencies:

```bash
cd webui
bun install --frozen-lockfile
cd ..
```

If Bun is unavailable, install it from [bun.sh](https://bun.sh/docs/installation), or use the package manager already approved by the team. The backend and Atlas CLI do not require the frontend dependencies.

## 5. Create the local environment file

From the repository root, create `.env.local`:

```dotenv
# -----------------------------
# Atlas model provider: choose Groq OR Gemini
# -----------------------------
GROQ_API_KEY=
ATLAS_MODEL_PROVIDER=groq
ATLAS_MODEL_ID=openai/gpt-oss-120b

# Optional Gemini alternative
GEMINI_API_KEY=
ATLAS_GEMINI_MODEL_ID=gemini-2.0-flash

# -----------------------------
# Google Tasks and Gmail OAuth
# -----------------------------
ATLAS_GOOGLE_CLIENT_ID=
ATLAS_GOOGLE_CLIENT_SECRET=
ATLAS_GOOGLE_REFRESH_TOKEN=
ATLAS_ENABLE_GOOGLE_TASKS=true
ATLAS_ENABLE_GOOGLE_OAUTH_PROBE=true
ATLAS_ENABLE_GMAIL=true

# -----------------------------
# SerpApi product research
# -----------------------------
ATLAS_SERPAPI_API_KEY=
ATLAS_ENABLE_SERPAPI=true

# -----------------------------
# Plaid Sandbox, optional
# -----------------------------
ATLAS_PLAID_CLIENT_ID=
ATLAS_PLAID_SECRET=
ATLAS_PLAID_ACCESS_TOKEN=
ATLAS_PLAID_ENV=sandbox
ATLAS_ENABLE_PLAID=true

# -----------------------------
# Telegram channel/delivery
# -----------------------------
TELEGRAM_BOT_TOKEN=
ATLAS_ENABLE_TELEGRAM_DELIVERY=false

# Optional live model smoke flags; enable only when intentionally testing them
ATLAS_ENABLE_GROQ_SMOKE=false
ATLAS_ENABLE_GEMINI_SMOKE=false
```

The repository uses both Atlas-prefixed names and selected plain aliases. Prefer the Atlas-prefixed names above so the configuration is unambiguous.

Verify that `.env.local` is ignored:

```bash
git check-ignore -v .env.local
```

If the command prints nothing, stop and fix `.gitignore` before entering secrets.

Load the file in each shell that will run Atlas commands:

```bash
set -a
source .env.local
set +a
```

For PowerShell:

```powershell
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^([^#][^=]*)=(.*)$') {
    Set-Item -Path "Env:$($matches[1])" -Value $matches[2]
  }
}
```

Do not print the environment with `env`, `printenv`, or `set` after loading it.

## 6. Create a Groq model key

Groq is the preferred low-cost/free-tier model option for the first Atlas proof.

1. Open the official [Groq Console](https://console.groq.com/).
2. Create an account or sign in.
3. Open [Groq API Keys](https://console.groq.com/keys).
4. Create a key with a descriptive name such as `atlas-local-team-member`.
5. Copy it once into the teammate's private `.env.local`.
6. Do not commit or paste it into the repository.

Set:

```dotenv
GROQ_API_KEY=your_key_here
ATLAS_MODEL_PROVIDER=groq
ATLAS_MODEL_ID=openai/gpt-oss-120b
```

If the selected model is unavailable for the account or provider, choose a currently available Groq model shown in the console and set `ATLAS_MODEL_ID` accordingly. Never silently switch to a paid provider.

## 7. Optional Gemini model key

Gemini can be used as an alternative provider.

1. Open [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Sign in with the Google account that will own the development key.
3. Create or select a Google AI API key.
4. Store it only in `.env.local`.

Set:

```dotenv
GEMINI_API_KEY=your_key_here
ATLAS_MODEL_PROVIDER=gemini
ATLAS_GEMINI_MODEL_ID=gemini-2.0-flash
```

The Atlas live smoke test uses:

```bash
ATLAS_ENABLE_GEMINI_SMOKE=true
```

Gemini is optional. A team can complete the first vertical slice with Groq only.

## 8. Create Google Tasks and Gmail OAuth credentials

Google Tasks and Gmail require OAuth because Atlas reads data belonging to a user. Do not use a service account for this local personal-data demo.

Use the official Google documentation:

- [Google Workspace credential creation](https://developers.google.com/workspace/guides/create-credentials)
- [Google OAuth for installed desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google API Library](https://console.cloud.google.com/apis/library)
- [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials)
- [Google Auth Platform clients](https://console.developers.google.com/auth/clients)

### 8.1 Create or select a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project named something like `atlas-local-dev`.
3. Make sure the new project is selected.
4. Open the API Library.

### 8.2 Enable the APIs

Enable:

- [Google Tasks API](https://console.cloud.google.com/apis/library/tasks.googleapis.com)
- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)

The first Atlas demo can use only Google Tasks. Enable Gmail now if the teammate will test the email-summary path.

### 8.3 Configure the OAuth consent screen

1. Open **Google Auth Platform** in the Cloud Console.
2. Configure the app branding and application name, for example `Atlas Local Dev`.
3. Choose **External** if testing with a personal Google account outside a Workspace organization.
4. Add the teammate's Google account as a test user while the app is in testing mode.
5. Use the minimum scopes:

```text
https://www.googleapis.com/auth/tasks.readonly
https://www.googleapis.com/auth/gmail.readonly
```

The current connector is read-only for Gmail. It does not request `gmail.send`, `gmail.compose`, delete, archive, label-write, or attachment access.

### 8.4 Create a Desktop OAuth client

1. Open **Clients** in Google Auth Platform.
2. Select **Create Client**.
3. Choose **Desktop app**.
4. Name it `Atlas Local Desktop`.
5. Create it.
6. Download the JSON file.
7. Store it outside the repository, for example:

```text
~/.config/atlas/google-client-secret.json
```

On Windows, use a private directory such as:

```text
C:\Users\<name>\AppData\Local\Atlas\google-client-secret.json
```

Never commit the downloaded JSON file.

### 8.5 Generate the refresh token with the repository helper

The repository includes a local installed-app helper. It opens a browser, uses a random localhost loopback port, and requests both read-only scopes:

```bash
uv run --no-sync python scripts/atlas_google_oauth.py \
  --client-secrets "$HOME/.config/atlas/google-client-secret.json"
```

On Windows PowerShell:

```powershell
uv run --no-sync python scripts/atlas_google_oauth.py `
  --client-secrets "$env:LOCALAPPDATA\Atlas\google-client-secret.json"
```

Complete the browser flow:

1. Sign in with the Google account whose Tasks/Gmail data Atlas may read.
2. Review the requested scopes.
3. Approve access.
4. Return to the terminal.
5. Copy the printed refresh token directly into `.env.local` as `ATLAS_GOOGLE_REFRESH_TOKEN`.

The helper uses a desktop loopback redirect. Do **not** use the OAuth Playground redirect with a Desktop client; that commonly causes `redirect_uri_mismatch` or `GeneralOAuthFlow` errors. Google's installed-app documentation specifies the loopback form `http://127.0.0.1:<random-port>` for desktop applications.

Set:

```dotenv
ATLAS_GOOGLE_CLIENT_ID=the_client_id_from_the_downloaded_json
ATLAS_GOOGLE_CLIENT_SECRET=the_client_secret_from_the_downloaded_json
ATLAS_GOOGLE_REFRESH_TOKEN=the_refresh_token_printed_by_the_helper
```

If a refresh token is not returned, revoke the old grant from the Google account's connected-app settings and run the helper again with `prompt=consent` as already configured.

### 8.6 Verify Google OAuth and APIs

Run the OAuth exchange smoke test:

```bash
uv run --no-sync pytest tests/atlas/test_connector_smoke.py \
  -k google_oauth_token_smoke -m atlas_smoke -v
```

Run Google Tasks:

```bash
uv run --no-sync pytest tests/atlas/test_connector_smoke.py \
  -k google_tasks_real_list_smoke -m atlas_smoke -v
```

Run the Atlas Task Start path:

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario task_start \
  --query "What should I do next?" \
  --grant-consent
```

For Gmail, ensure `ATLAS_ENABLE_GMAIL=true`, then run the relevant Gmail tests:

```bash
uv run --no-sync pytest tests/atlas/test_gmail_summary.py -q
```

A refresh token created with only `tasks.readonly` will not authorize Gmail. If Gmail is needed, revoke and regenerate the token with both scopes using the helper.

## 9. Create a SerpApi key

SerpApi is the product-research connector.

1. Open the official [SerpApi dashboard](https://serpapi.com/dashboard).
2. Create an account or sign in.
3. Copy the API key from the dashboard.
4. Review the current free-plan quota at [SerpApi pricing](https://serpapi.com/pricing).
5. Put it only in `.env.local`.

Set:

```dotenv
ATLAS_SERPAPI_API_KEY=your_serpapi_key
ATLAS_ENABLE_SERPAPI=true
```

Run the real read-only smoke test:

```bash
uv run --no-sync pytest tests/atlas/test_connector_smoke.py \
  -k serpapi_real_search_smoke -m atlas_smoke -v
```

Run the Atlas research path:

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario shopping_research \
  --query "Find a reliable lower-cost winter jacket" \
  --grant-consent
```

SerpApi searches only. Atlas does not purchase anything or mutate a cart.

## 10. Configure Plaid Sandbox, optional

Plaid is optional for the first demo and should remain in Sandbox.

Use the official [Plaid Quickstart](https://plaid.com/docs/quickstart/) and [Plaid Dashboard keys page](https://dashboard.plaid.com/developers/keys).

1. Create a Plaid account.
2. Open the Developers → Keys page.
3. Copy the Sandbox `client_id`.
4. Copy the Sandbox `secret`.
5. Create a Sandbox Item using Plaid Link or the Plaid Quickstart.
6. Exchange the Sandbox public token for an access token.
7. Store that access token locally.

Plaid Link's standard flow is:

```text
link_token/create
    -> user completes Sandbox Link
    -> public_token
    -> item/public_token/exchange
    -> access_token + item_id
```

Use the Sandbox credentials:

```text
username: user_good
password: pass_good
2FA: 1234, if requested
```

Set:

```dotenv
ATLAS_PLAID_CLIENT_ID=your_sandbox_client_id
ATLAS_PLAID_SECRET=your_sandbox_secret
ATLAS_PLAID_ACCESS_TOKEN=your_sandbox_access_token
ATLAS_PLAID_ENV=sandbox
ATLAS_ENABLE_PLAID=true
```

Then run:

```bash
uv run --no-sync pytest tests/atlas/test_connector_smoke.py \
  -k plaid_sandbox_item_smoke -m atlas_smoke -v
```

The current Atlas Plaid smoke test requires a real Sandbox access token. Client ID and secret alone are not enough to retrieve transaction data.

## 11. Create and configure Telegram

Telegram is useful for a presentation because it shows that the same local gateway can receive and answer messages outside the browser.

### 11.1 Create the bot

1. Open Telegram.
2. Search for `@BotFather`.
3. Send `/newbot`.
4. Choose a display name.
5. Choose a username ending in `bot`.
6. Copy the HTTP API token.
7. Never commit or publish the token.

Official references:

- [Telegram BotFather](https://t.me/BotFather)
- [Telegram Bot API](https://core.telegram.org/bots/api)

Add the token to `.env.local` for Atlas credential checks:

```dotenv
TELEGRAM_BOT_TOKEN=your_bot_token
ATLAS_ENABLE_TELEGRAM_DELIVERY=false
```

### 11.2 Verify the token without sending a message

```bash
ATLAS_ENABLE_TELEGRAM_DELIVERY=true \
uv run --no-sync pytest tests/atlas/test_connector_smoke.py \
  -k telegram_getme_smoke -m atlas_smoke -v
```

PowerShell:

```powershell
$env:ATLAS_ENABLE_TELEGRAM_DELIVERY="true"
uv run --no-sync pytest tests/atlas/test_connector_smoke.py `
  -k telegram_getme_smoke -m atlas_smoke -v
```

This calls Telegram `getMe`, which is read-only.

### 11.3 Connect Telegram to the nanobot gateway

Start the bundled WebUI:

```bash
uv run nanobot webui
```

Open:

```text
http://127.0.0.1:8765
```

Then:

1. Open **Settings → Channels → Telegram**.
2. Install Telegram support if the WebUI offers that option.
3. Paste the BotFather token.
4. Save and enable the channel.
5. Keep pairing-only mode enabled.

The gateway uses long polling locally. A public HTTPS webhook is not required.

### 11.4 Pair the teammate's Telegram account

1. Open the bot's chat in Telegram.
2. Send:

```text
Hello from the Atlas team
```

3. The bot returns a pairing code.
4. Approve it from the local trusted surface:

```bash
uv run nanobot agent -m "/pairing approve YOUR-CODE"
```

5. Send the message again.
6. Confirm that the bot responds.

Important: `/pairing approve YOUR-CODE` is an administrative access operation,
not a request for the LLM to think. It normally produces no model response.
After approval, send a new ordinary message such as `Hello` or `What can you
help me with?`. The code expires after 10 minutes. Approve it from the WebUI
pairing panel or an already trusted local nanobot surface, not from the
Telegram account that is still waiting for approval.

Check channel status:

```bash
uv run nanobot channels status
```

If messages do not arrive, run the gateway in the foreground with logs:

```bash
uv run nanobot gateway --verbose
```

### 11.5 Telegram and Atlas scope boundary

At the current checkpoint, Telegram is fully usable as a normal nanobot channel. The Atlas connector can perform separately gated delivery, but Atlas-specific inbound cards and approval callbacks are not yet fully mounted into the Telegram handler.

For the hackathon demo, present Telegram as the normal nanobot interaction surface and present the real Atlas/Strands evidence workflow through `scripts/atlas_demo.py`. Do not claim direct Atlas Telegram orchestration until that route is implemented and verified.

## 12. Start the local application

### Recommended bundled mode

From the repository root:

```bash
uv run nanobot webui
```

Open:

```text
http://127.0.0.1:8765
```

The launcher starts or joins the gateway and serves the bundled WebUI.

### Separate frontend development mode

Terminal 1:

```bash
uv run nanobot gateway
```

Terminal 2:

```bash
cd webui
NANOBOT_API_URL=http://127.0.0.1:8765 bun run dev
```

Open:

```text
http://127.0.0.1:5173
```

Use the bundled mode for the presentation unless you are demonstrating live frontend code changes.

## 13. Run the complete local verification sequence

Run these commands in order.

### 13.1 Static diagnostics

```bash
uv run --no-sync python scripts/atlas_diagnose.py
uv run --no-sync python scripts/atlas_diagnose.py --health
```

The diagnostics output must not include secret values.

### 13.2 Offline regression tests

```bash
uv run --no-sync pytest tests/atlas -q
```

Expected current result:

```text
155 passed, 9 skipped
```

The skipped tests are intentionally credential-gated or platform-specific.

### 13.3 Static validation

```bash
uv run --no-sync ruff check nanobot/atlas scripts tests/atlas
uv run --no-sync basedpyright nanobot/atlas
uv run --no-sync python -m compileall -q nanobot scripts tests
```

### 13.4 Real Strands proof

```bash
uv run --no-sync python scripts/atlas_stage1_smoke.py
```

Look for confirmation that a real Strands Agent executed and called the bounded tool.

### 13.5 Real provider smoke tests

Run only the provider tests that have been deliberately configured:

```bash
uv run --no-sync pytest tests/atlas/test_connector_smoke.py \
  -m atlas_smoke -v
```

This can call real providers and consume free-tier quota. It does not perform purchases, Gmail sends, task writes, or Telegram sends in the current smoke suite.

### 13.6 Real Atlas demos

Task Start:

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario task_start \
  --query "What should I do next?" \
  --grant-consent
```

Shopping Research:

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario shopping_research \
  --query "Find a lower-cost reliable winter jacket" \
  --grant-consent
```

JSON capture:

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario task_start \
  --query "What should I do next?" \
  --json
```

## 14. MCP and skills setup, optional

MCP is optional for the first vertical slice. Do not block the basic demo on MCP.

Use the existing WebUI:

1. Open **Apps**.
2. Choose **Add MCP server**.
3. Prefer HTTPS or localhost servers.
4. Use OAuth or request headers only when the server's official documentation requires them.
5. Enable only the tools needed for the demo.
6. Test the MCP connection with a read-only request.

For a local MCP configuration, use the repository's existing MCP configuration conventions rather than adding a second hidden tool registry. Review:

```text
docs/guides/configure-mcp-tools.md
docs/configuration.md
```

For skills, inspect or discover them from the WebUI Skills/Apps surface or the repository skill directories. A skill is not a replacement for policy enforcement: consent, capability checks, approval hashes, idempotency, and audit behavior remain deterministic code responsibilities.

## 15. What to record in Atlas memory

After testing, update `.atlas/ATLAS_MEMORY.md` with redacted results only:

```markdown
## Team member smoke test: 2026-09-12

| Area | Result | Notes |
|---|---|---|
| uv sync | passed | atlas and dev extras installed |
| Strands smoke | passed | real agent and bounded tool observed |
| Google OAuth | passed/skipped | no token or account data recorded |
| Google Tasks | passed/skipped | read-only |
| Gmail | passed/skipped | read-only metadata/snippet path |
| SerpApi | passed/skipped | read-only search |
| Plaid Sandbox | passed/skipped | Sandbox only |
| Telegram getMe | passed/skipped | no token recorded |
| Telegram chat | passed/skipped | pairing-only |
| WebUI | passed | local port 8765 |
```

Never record refresh tokens, API keys, access tokens, raw tasks, email text, chat IDs, account numbers, or private messages.

## 16. Presentation and demo-video checklist

Before recording:

- run `git status --short --branch` and confirm no secret files are tracked;
- run `atlas_diagnose.py`;
- confirm the model answers `Hello!` in the WebUI;
- confirm the Strands smoke test passes;
- confirm one real Atlas connector works;
- confirm Telegram is paired if Telegram is in the video;
- keep all delivery/write flags disabled;
- prepare redacted terminal output rather than showing `.env.local`;
- close unrelated browser tabs and hide account email addresses where possible.

Suggested sequence:

1. Open the WebUI and explain the Atlas problem.
2. Send a normal question to prove the gateway is live.
3. Show the terminal running the Strands smoke test.
4. Run Task Start against Google Tasks or Shopping Research against SerpApi.
5. Explain consent, evidence, provider status, and the no-side-effect boundary.
6. Send a normal message to Telegram and show the gateway response.
7. Show the passing test summary.
8. Explain the next integration stage: direct Atlas cards and approval callbacks in the WebUI and Telegram.

## 17. Troubleshooting

### `model_unconfigured`

Configure the provider in WebUI **Settings → Models**, or confirm that the Atlas CLI shell has loaded `GROQ_API_KEY` and the correct `ATLAS_MODEL_PROVIDER`/`ATLAS_MODEL_ID`.

### `connector_disabled` or `NOT_CONFIGURED`

Check both the credential and the feature flag. For example, SerpApi requires both:

```dotenv
ATLAS_SERPAPI_API_KEY=...
ATLAS_ENABLE_SERPAPI=true
```

### `consent_missing`

Run the demo once with `--grant-consent`. The connector must have server-stored consent before it reads external data.

### Google `redirect_uri_mismatch`

Use the repository's desktop OAuth helper, not OAuth Playground. The helper uses a localhost loopback redirect. Confirm the Google credential type is **Desktop app**, not Web application.

### Google `access_denied` or unverified-app warning

Make sure the teammate's Google account is listed as a test user on the OAuth consent screen. Confirm that the requested scopes are exactly the intended read-only scopes.

### Google refresh token is missing

Revoke the old Atlas grant from the Google account, then run the helper again. The helper requests offline access and explicit consent.

### Gmail is unauthorized while Tasks works

The refresh token probably contains only the Tasks scope. Regenerate it with both `tasks.readonly` and `gmail.readonly`.

### Telegram token works in `getMe` but the bot does not reply

Confirm the gateway is running, Telegram support is enabled, the bot is contacted in a private chat, and the pairing code has been approved.

### Plaid fails

Confirm `ATLAS_PLAID_ENV=sandbox`, the client ID and secret are Sandbox values, and the access token belongs to a Sandbox Item. Client ID and secret alone are insufficient for `/item/get`.

### Vite frontend is blank

Use the bundled mode first. If using Vite, start the gateway in another terminal and set:

```bash
NANOBOT_API_URL=http://127.0.0.1:8765
```

Then open port `5173`, not `8765`.

## 18. Final acceptance criteria for the teammate

The teammate is ready to present when all of the following are true:

| Acceptance check | Required result |
|---|---|
| Repository setup | clean checkout and `uv sync` succeeds |
| Secret hygiene | `.env.local` ignored and no secret printed or committed |
| Model | WebUI answers `Hello!` |
| Strands | real Strands smoke test passes |
| Atlas | one real read-only connector produces evidence and recommendation |
| Policy | missing consent or disabled connector stops safely |
| WebUI | local browser works on port 8765 |
| Telegram | bot token `getMe` passes and private pairing works, if Telegram is included |
| Regression | `155 passed, 9 skipped` or the current repository equivalent |
| Memory | redacted result recorded in `.atlas/ATLAS_MEMORY.md` |

If a provider is unavailable, mark that connector as skipped and proceed with another verified free-tier path. Do not replace a failed real integration with an undocumented mock during the presentation.
