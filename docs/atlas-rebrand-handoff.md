# Atlas Rebrand, Domain, and Demo Handoff

This document is the next-person handoff for making the starter project feel like Atlas rather than a lightly modified nanobot installation.

## Objective

Refurbish the product so that a reviewer sees a coherent Atlas product identity across the browser, Telegram messages, documentation, repository metadata, and public demo domain.

The work must preserve the existing nanobot runtime and Atlas safety contracts. Rebranding is a product-surface task, not permission to weaken consent, approval, identity, credential, or audit controls.

## Priority order

### P0: product identity

Replace generic user-facing language where it appears in the Atlas experience:

- product name: **Atlas**;
- tagline: **“Notices the work you are avoiding, prepares the next move, and asks before it acts.”**;
- primary navigation and welcome screen;
- empty states;
- onboarding copy;
- error and fallback messages;
- browser title and favicon;
- Telegram welcome/help copy where the channel supports it;
- demo output labels and README language.

Do not rename internal nanobot package paths or upstream compatibility surfaces unless a separate migration plan exists. Internal package stability is more important than cosmetic renaming.

### P0: Atlas visual system

Create a small, consistent design system:

- Atlas wordmark and simple compass/route mark;
- one primary color, one accent, neutral background, accessible contrast;
- typography scale;
- status colors for evidence, recommendation, approval, blocked, stale, and provider unavailable;
- consistent card layout for evidence, next action, approval request, and verified outcome;
- responsive layout for desktop presentation and narrow Telegram-linked browser views.

Use original team-created assets or permissively licensed assets. Record asset licenses in `docs/atlas-assets.md`.

### P0: domain and public demo

Choose a domain that clearly belongs to Atlas and does not impersonate AWS, nanobot, Strands, Google, Telegram, or another provider. Before purchasing or publishing, confirm ownership, DNS, and billing with the project owner.

Recommended topology:

```text
atlas.example domain
        |
        +--> public landing/demo frontend
        |
        +--> authenticated WebUI
                     |
                     v
              Python Atlas backend
              nanobot gateway
              Strands Agent
              Telegram channel
```

Use Vercel for a static/React landing page or frontend only when that is useful. Keep the Python gateway, Strands runtime, Telegram long polling, MCP processes, and provider secrets on the existing Python/container deployment path unless the team intentionally builds an authenticated backend split.

Required before publishing:

- HTTPS;
- no provider secrets in browser bundles;
- authentication for non-demo data;
- rate limiting;
- redacted logs;
- a demo mode with synthetic or explicitly authorized data;
- a privacy notice;
- a delete/revoke-consent path;
- a clear “not financial advice” boundary for Money Guard;
- a clear statement that the demo does not purchase or send without approval.

### P1: Atlas WebUI integration

Wire the existing WebUI chat/API to one shared Atlas request contract and add:

- Atlas Inbox;
- source/consent status;
- evidence cards;
- recommendation cards;
- approval cards with exact payload summary, expiry, and approve/deny controls;
- stale-data and provider-unavailable states;
- outcome verification state;
- Drip Advice quiet-hours/snooze controls;
- user-scoped wardrobe image consent and delete controls.

Do not create a second hidden authorization mechanism in prompts. The deterministic Atlas policy remains authoritative.

### P1: Telegram Atlas integration

Route Atlas intents from Telegram through the same Atlas request contract used by the WebUI. Keep the normal nanobot conversation path for unsupported requests.

Implement:

- explicit Atlas command or intent recognition;
- consent request message;
- evidence-backed recommendation card;
- approval callback with nonce and payload hash;
- expired/invalid approval response;
- outcome verification message;
- pairing and user identity binding;
- no broad group-chat authorization by default.

Test Telegram inbound, callback, duplicate callback, expired callback, revoked consent, and provider-unavailable cases.

### P1: presentation polish

Prepare a five-minute demo path:

1. Atlas welcome screen;
2. authorized Google Tasks or SerpApi source;
3. normalized evidence;
4. recommendation;
5. explicit approval boundary;
6. Telegram or WebUI continuation;
7. outcome or safe blocked state;
8. memory/audit explanation;
9. final product identity and domain.

Do not show `.env.local`, OAuth client JSON, refresh tokens, raw email, private task data, Telegram chat IDs, or Plaid identifiers.

## What the next teammate does not need initially

The next teammate should not block the rebrand on the following items:

- paid fashion APIs;
- production bank connections;
- Gmail sending or drafting;
- production financial actions;
- public Telegram webhooks;
- multi-tenant billing;
- mobile apps;
- a full custom MCP marketplace;
- replacing the existing nanobot runtime;
- a full image-recognition fashion model.

For the hackathon, a polished read-only vertical slice with real Strands orchestration, real authorized data, strong consent behavior, and an original Atlas surface is more valuable than many incomplete connectors.

## Required handoff sequence

1. Read `README.md`, `.atlas/ATLAS_MEMORY.md`, `docs/atlas-team-onboarding.md`, and this document.
2. Run the offline Atlas suite before changing code.
3. Record the baseline commit and test count in the memory file.
4. Create a visual inventory of every generic nanobot surface visible to a user.
5. Create a Figma or coded Atlas visual target before implementing broad UI changes.
6. Refactor copy and theme tokens first.
7. Add Atlas Inbox cards using existing UI primitives.
8. Wire the shared Atlas request contract into the WebUI.
9. Wire the same contract into Telegram.
10. Add domain/deployment configuration only after local acceptance tests pass.
11. Run offline tests, frontend checks, connector smoke tests, and a redacted demo rehearsal.
12. Update `.atlas/ATLAS_MEMORY.md` and commit each stable stage.

## Definition of done

The rebrand stage is complete when a new user can open the public Atlas surface and immediately understand what Atlas does, interact through the WebUI, receive the same supported workflow through Telegram, see evidence and safety states, and complete a read-only demo without seeing generic starter-template branding or secrets.
