# Atlas and Vercel

## Short answer

Vercel can host a frontend or a thin API layer for Atlas, but it is not the best first host for the complete Python nanobot gateway, Strands runtime, Telegram worker, and background Drip Advice process.

The existing repository already has a Docker and Render deployment path. For the hackathon MVP, keep the Python Atlas backend, Strands agent, connector credentials, Telegram channel, and background runtime together on the existing container host. Use Vercel only if the team deliberately separates the frontend from that backend.

## Why Vercel can help

Vercel is a good fit for:

- a React/Vite or Next.js frontend;
- a public demo page;
- a thin request proxy;
- preview deployments for UI work;
- static assets and edge-delivered frontend code.

It can make the WebUI easy to share with judges, but the browser must never receive provider secrets. The frontend should call a protected backend endpoint and rely on server-side authentication.

## Why Vercel is not the default Atlas host

Atlas currently includes:

- a Python runtime;
- AWS Strands Agents SDK;
- nanobot gateway and channel lifecycle;
- Telegram interaction;
- MCP processes and tool allowlists;
- background Drip Advice and at-least-once delivery concerns;
- local/session memory and connector state;
- potentially long-running model/tool calls.

A Vercel serverless function is request-scoped and should not be used as the sole home for a continuously running Telegram polling worker, a persistent nanobot gateway, a local MCP process, or an in-memory background scheduler. Timeouts, cold starts, stateless execution, and provider secret handling also complicate the first demo.

## Recommended topology for the hackathon

```text
Vercel (optional)
  React/WebUI frontend and public demo shell
              |
              | HTTPS authenticated requests
              v
Existing Python container host
  nanobot gateway + AtlasService + Strands + connectors
              |
              +-- Supabase or existing persistent store
              +-- Telegram channel
              +-- Google Tasks / SerpApi / Plaid Sandbox / Gmail read-only
```

If the existing WebUI is already packaged and served by nanobot, do not split it just to use Vercel. A single working deployment is more valuable than two partially connected deployments.

## When Vercel becomes worthwhile

Use Vercel when the team has a concrete frontend need such as:

- a polished public landing/demo shell separate from the private gateway;
- preview URLs for UI review;
- a frontend team that wants independent deployment;
- a public read-only demo that calls a protected backend.

Do not move the Strands/Python core to Vercel solely because it is popular.

## If deploying a frontend to Vercel

The frontend should use only public configuration such as:

```dotenv
VITE_ATLAS_API_BASE_URL=https://your-backend.example.com
```

Never put these in frontend environment variables:

- `GROQ_API_KEY`;
- Google client secret or refresh token;
- `SERPAPI_API_KEY`;
- `TELEGRAM_BOT_TOKEN`;
- Plaid secret/access token;
- Supabase service-role key;
- MCP authorization headers.

The backend must enforce authentication, user identity, consent, capability, rate limits, and output validation.

## Background execution

For low-frequency digests, a backend cron or managed scheduler can trigger a bounded Atlas job. The job must use a durable state record, quiet hours, cooldown, and idempotency key.

Do not rely on a Vercel function staying alive after the response. Do not run Telegram polling inside a request handler. Use the existing gateway/container or a separately managed worker for continuous channel behavior.

## Cost and hackathon recommendation

For the current free-first hackathon build:

1. Keep the existing local/container deployment as the primary working path.
2. Use free-tier Groq/Gemini and read-only/sandbox connectors.
3. Add a Vercel frontend only after the real Atlas backend demo works.
4. Do not introduce paid persistent hosting merely to create a second URL.
5. If a public live demo is needed, expose the existing backend safely or use the existing deployment surface and document the URL.

## Verification checklist

Before claiming a Vercel integration works, verify:

- WebUI can authenticate;
- frontend calls the backend over HTTPS;
- provider secrets remain server-side;
- Atlas responses are typed and redacted;
- consent is enforced on the backend;
- Telegram is not duplicated by a second worker;
- long-running jobs have a durable state path;
- provider failures appear as explicit UI states;
- CORS/auth/session behavior is tested;
- the public demo cannot access another user’s case or connector data.
