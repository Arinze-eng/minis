# Atlas Wardrobe v2 — Full Architecture Plan

Goal: give Atlas everything Fitcheck (`sonnysangha/AI-Wardrobe-app-vercel-eve-clerk-nextjs`) does — photo import, AI cutouts, outfit builder, virtual try-on, a tool-using stylist agent — and go further where Atlas is already stronger (money, consent, privacy, Gmail, Google Tasks, Telegram), using free AI services first and AWS Bedrock credits where free options are weak.

Status: plan only. Nothing here is built yet. Stack decision (Oct 2026): **Convex Cloud** as the single system of record, Next.js stateless frontend, Strands TS stylist (see §15). Items marked **VERIFY** depend on provider limits that change often; check them in the provider console before building on them.

---

## 1. What Fitcheck is (complete read, Oct 2026)

Fitcheck is a Next.js 16 + Convex + Clerk + Vercel Eve app. Every file was read; the shadcn `components/ui/*` primitives are stock library code and were catalogued by name only.

| Area | How Fitcheck does it | Files |
|---|---|---|
| Import | Upload 1–50 photos → free vision scan (`gpt-5-mini`, JSON schema: name, category, subcategory, colours, pattern, material, seasons, formality, bbox, one-sentence isolating description) → user ticks which detected pieces to keep → only selected pieces are charged and extracted. | `convex/model/uploads.ts`, `convex/ai/prompts.ts`, `workflows/ingest.ts`, `components/upload/*` |
| Cutout | `gpt-image-2` edit: "isolate only this item… clean flat-lay, transparent background". Retries opaque if transparency is rejected. Dominant colour hex from pixels (`pngjs`). Embedding (`text-embedding-3-small`) + vector search ≥ 0.92 cosine flags duplicates (never merges). | `convex/ai/openai.ts`, `ai/colours.ts`, `model/items.ts` |
| Wardrobe | Grid with filters (category, colour, season, formality), text search (Convex search index), sort, bulk hide/delete/category, item detail with editable attributes, wear count, "outfits with this", re-extract, demo wardrobe seeding (men/women, 8 items). | `model/items.ts`, `components/wardrobe/*`, `model/demo_wardrobe.ts` |
| Outfits | Slots: outerwear, top, bottom, dress (replaces top+bottom), shoes, accessories[]. Server validates ownership, readiness and slot↔category. Mark worn bumps every item. | `model/outfits.ts`, `components/outfits/*` |
| Avatars | 1/2/5 person photos by plan; default avatar; replace in place; blocked while a render uses it. | `model/avatars.ts` |
| Try-on | One `gpt-image-2` edit with avatar + every garment cutout as reference images in layer order, long prompt preserving identity and body proportions, 2:3 full-body output. Credits reserved up front, refunded per failed image. | `ai/openai.ts renderImage`, `model/renders.ts`, `workflows/render.ts` |
| Jobs | Every long task is a `jobs` row with typed steps (`upload, detect, review, reserve, extract:n, render:n, finalize`), progress, refunds; Convex Workflow gives retries (3 attempts, exp. backoff), max parallelism 8; per-step running-average durations drive ETAs; UI subscribes live. | `model/jobs.ts`, `shared/jobs.ts`, `components/common/job-stepper.tsx` |
| Stylist | Eve agent (`openai/gpt-5.4-mini`), tools: `get_context`, `get_wardrobe`, `gap_analysis`, `get_weather` (Open-Meteo), `compose_outfits`, `quote_renders`, `start_renders` (approval-gated), `save_outfit`, `ask_question`, `load_skill` (colour-pairing, dress-codes). Page context (current item/outfit/draft) is sent each turn as **untrusted** data. Sessions bound to threads server-side; 100 messages/day cap. | `agent/*`, `convex/agent.ts`, `src/hooks/use-stylist.ts`, `src/lib/stylist-context.ts` |
| Money | Credits ledger with idempotent refs, plan + pack buckets, daily cap 150, global `MAX_DAILY_SPEND_USD` kill switch, Clerk Billing plans (Free 25 credits, Pro $9.99/150, Plus $19.99/300 + HQ). | `model/credits.ts`, `subscriptions.ts` |
| Ops | Admin dashboard (revenue, COGS, margin, failed jobs, retry/refund, top spenders), daily aggregates, step ETAs, 17 node:test files, CI typecheck/lint/test. | `model/admin.ts`, `model/stats.ts`, `tests/*` |
| Sharing | Public `/share/[token]` page for a render (Pro feature). | `renders.share/getShared` |

Fitcheck weaknesses found in review (do not copy): wiping data resets daily AI limits; deleted Clerk accounts keep all photos (no webhook); unlimited upload URLs and orphaned files; storage ids not owner-checked; share links survive plan cancellation; dev impersonation without a production guard; weather fetch without timeout; unbounded thread list; one OpenAI vendor for everything; no wear idempotency (double tap = two wears).

---

## 2. Gap analysis — Fitcheck vs Atlas today vs Atlas v2

| Capability | Fitcheck | Atlas today (`atlas-web`) | Atlas v2 target |
|---|---|---|---|
| Garment photo upload | Yes, batch 1–50 | Single image → Cloudinary, garment row "needs confirmation" | Batch upload + background scan |
| AI detection + tagging | Yes | No (manual confirm) | Gemini Flash vision, free |
| Choose pieces from a photo | Yes, numbered boxes | No | Yes |
| Clean cutouts | Generative flat-lay | No | Crop + background removal (free in-browser, Bedrock fallback) |
| Duplicate detection | Embeddings | No | Perceptual hash + attribute match (free), embeddings later |
| Colour swatches | Pixel stats | Manual colours | `sharp` dominant colours |
| Search & filters | Yes | Basic | Convex search index + filters |
| Outfit builder | Yes | "Ask" picks pieces, Looks page | Full builder with slots + validation |
| Virtual try-on | gpt-image-2 | No | Amazon Nova Canvas `VIRTUAL_TRY_ON` (Bedrock credits) |
| Stylist agent with tools | Eve + OpenAI | Rule-based Ask; Python Strands demo | Strands **TypeScript** SDK inside atlas-web, free-first models |
| Approval before spend | Eve approval | Payload-hash approvals (Python) | Signed approval tokens in web |
| Weather | Open-Meteo | Demo snapshot | Open-Meteo live |
| Wear logging | Not idempotent | Idempotent per key | Keep Atlas version |
| Cost per wear / money link | No | Yes | Yes + receipts → wardrobe |
| Gmail receipts | No | Yes (metadata only) | Detect clothing purchases → suggest adding item |
| Google Tasks / Telegram | No | Yes | Morning outfit + reminders via Telegram |
| Consent per data use | No | Yes (`garment_image_analysis`, `person_image_use`) | Required gate for every AI call |
| Privacy export / wipe | Partial | Yes (fixed in audit) | Include photos, avatars, renders, threads |
| Account deletion | Not automatic | Not automatic | Clerk `user.deleted` webhook purge |
| Background jobs | Convex Workflow | None | Convex Workflow + per-provider Workpools |
| Live progress | Convex subscriptions | Polling | Polling/SSE on job rows |
| Billing / credits | Clerk Billing + ledger | None | Usage quotas + spend kill switch (no payments in v2) |
| Admin / COGS | Yes | No | Lightweight usage dashboard |
| Tests | 17 files | 70 tests | Add per-pipeline tests |

---

## 3. Target architecture (decision: Convex)

Atlas is still at the concept/test stage, so migration cost no longer decides the stack. The priorities are scalability, load balancing and security. On those, Convex wins for this app shape (see §15): managed horizontal scaling, live updates, durable jobs, built-in rate limiting, and a function-only data API with no direct database access from clients.

```
Browser (Next.js app, Apple HIG UI)
  │ Clerk session ──► Convex client (WebSocket, live queries; Clerk JWT on every call)
  │ optional in-browser background removal (bg0, Apache-2.0)
  ▼
Next.js 15 (Vercel Pro or Render paid; stateless, horizontally scaled)
  ├─ pages + Clerk middleware
  ├─ /api/stylist  → Strands Agents TS SDK; tools call Convex with the USER'S Clerk JWT
  ├─ /api/oauth/*  → Gmail / Google Tasks OAuth callbacks → Convex mutations (user JWT)
  (Clerk user.deleted webhook is a Convex HTTP action, svix-verified, so no secret leaves Convex)
  ▼
Convex Cloud (system of record; scales functions + storage; SOC 2 Type II, AES-256 at rest)
  ├─ schema + indexes (Fitcheck schema extended with Atlas tables, §5)
  ├─ queries / mutations (requireUser + ownership on every function)
  ├─ actions ("use node"): AI router, Bedrock, Groq, Gemini, Cloudinary/Convex storage, Gmail
  ├─ components: Workflow, Workpool, Rate Limiter, Sharded Counter, (Aggregate)
  ├─ scheduler + crons: stale-job sweep, orphan-file sweep, morning drip, Gmail rescans
  └─ file storage (private; signed URLs)          ◄── Cloudinary optional for transforms
  ▲
Python nanobot/atlas (Telegram, CLI) ── convex-py client, narrow service functions (§9)
```

Key decisions:

1. **Convex is the only system of record.** All Atlas data (wardrobe, money findings, Gmail connections, consent, signals, notifications, preferences, audit) moves into Convex tables. No second database, so export, wipe and account deletion stay correct.
2. **Port Fitcheck's backend patterns almost as-is:** `model/*` business logic, thin public functions, `requireUser` / `assertOwner`, typed `appError` codes, job rows with steps, Workflow-based pipelines, credits/usage ledger with unique refs. Keep Atlas's stronger pieces: consent gates, payload-hash approvals, idempotent wear logging, encrypted OAuth tokens, privacy export/wipe.
3. **Strands TS agent runs in Next.js, not in Convex.** Chat turns stream for tens of seconds; a Next route handler (Vercel functions up to 300 s+ on Pro) suits that. Every tool calls Convex with `ConvexHttpClient.setAuth(userJwt)`, so the same `requireUser` rules apply. This removes Fitcheck's shared `AGENT_SERVICE_KEY` god-key from the browser-facing path.
4. **Free-first AI router lives in Convex actions** (§4.1), behind consent checks, rate limits and the `dataClass` privacy filter (§16).
5. **Consent is the gate for every image call** (`garment_image_analysis`, `person_image_use`), enforced inside the mutation that enqueues work, not only in the UI.


---

---

## 4. AI provider plan (free first)

| Capability | Primary (free) | Fallback 1 | Paid-credit option (AWS) | Notes |
|---|---|---|---|---|
| Garment detection + tags + bboxes | **Bedrock Amazon Nova Lite** (multimodal, AWS credits, inputs not used for training) | Groq `meta-llama/llama-4-scout-17b-16e-instruct` (vision; Groq does not train on inputs, no retention by default — **VERIFY still free**) | Gemini Flash **paid tier** only | User photos are personal data: never send them to Gemini's free tier (see §16). Normalise boxes to 0–1. |
| Garment cutout | In-browser background removal with `@bg0/browser` (BiRefNet-lite ONNX, Apache-2.0) on the bbox crop, before upload — zero server cost | Bedrock Nova Canvas `BACKGROUND_REMOVAL` on the server crop | Same | Avoid `@imgly/background-removal` (AGPL/GPL). For occluded garments, optional generative "flat-lay" via Gemini Flash Image edit (**VERIFY** free availability). |
| Colour swatches | `sharp` (`stats().dominant` + quantised histogram on opaque pixels) | — | — | Replaces Fitcheck's `pngjs`. |
| Duplicate detection | Perceptual hash (dHash via `sharp`) + same category + colour distance | Gemini text embeddings | Nova Multimodal Embeddings (image vectors, 256–3072 dims) | No API call needed for v1. |
| Semantic search | Convex full-text search index | Nova Multimodal Embeddings + Convex vector index (≤ 4,096 dims, ≤ 256 results) | Gemini embeddings (paid tier) | Full-text is enough below ~1,500 items. Garment text is personal-adjacent, so no free-tier embeddings. |
| Virtual try-on | — (no strong free commercial option) | Hugging Face CatVTON / IDM-VTON Spaces (**non-commercial licences**, rate-limited — demo only) | **Nova Canvas `VIRTUAL_TRY_ON`** (≈ $0.04 per standard image per AWS guidance — **VERIFY** current price/regions) | Main try-on engine. See §6.3. |
| Stylist agent (tool calls) | Groq `openai/gpt-oss-120b` (already Atlas default; Developer-plan base 30 RPM / 1K RPD / 8K TPM / 200K TPD per **organization**) | Bedrock Nova Lite / Nova Pro / Claude Haiku (Strands' native Bedrock provider) | Gemini Flash **paid tier** via OpenAI-compatible endpoint | Chat can contain personal details, so Gemini's free tier is excluded. Opt out of Groq troubleshooting logs in Data Controls. |
| Short text with no personal data (dress-code tips, generic copy) | Gemini Flash-Lite free tier | Groq small model | — | Only content you would be happy for Google reviewers to read. |
| Last-resort text | OpenRouter `:free` models (20 RPM, 50/day without credits) | — | — | Optional. |
| Weather | Open-Meteo geocoding + forecast (no key) | — | — | Always with an 8 s timeout. |
| Product research | SerpApi (free 250 searches/month; already integrated in Python Atlas) | — | — | Read-only; never purchases. |
| Image storage | Convex file storage (private, signed URLs; Free 1 GB, Pro 100 GB) | Cloudinary free tier for resized thumbnails | S3 (with credits) | One store keeps wipe/export simple; Cloudinary only if transforms are needed. |

Provider facts used above (Oct 2026): Strands TS SDK v1.20 (`@strands-agents/sdk`); Nova Canvas task types include `BACKGROUND_REMOVAL` and `VIRTUAL_TRY_ON`; VTO accepts a source image, a reference image (which may contain several outfit components), and a mask (`GARMENT` with `garmentClass` `UPPER_BODY | LOWER_BODY | FOOTWEAR | FULL_BODY`, `PROMPT`, or `IMAGE`), supports `garmentStyling` (`longSleeveStyle`, `tuckingStyle`, `outerLayerStyle` `OPEN|CLOSED`), `mergeStyle` `BALANCED|SEAMLESS|DETAILED`, up to 5 images, no text prompt; output sides 320–4096 px, divisible by 16, aspect 1:4–4:1, < 4.19 MP. Gemini Pro models left the free tier in April 2026; Flash / Flash-Lite remain.

### 4.1 Router module (`convex/ai/router.ts`, `"use node"` actions)

```ts
type Capability = "detect" | "cutout" | "tryon" | "agent" | "text" | "embed";
type Provider = "gemini" | "groq" | "bedrock" | "openrouter";
// One table, read from env so deployments can reorder without code changes:
// ATLAS_AI_CHAIN_DETECT=gemini,groq,bedrock   ATLAS_AI_CHAIN_TRYON=bedrock
```

Behaviour:
- Try providers in order; on `429` or `5xx`, open a per-provider circuit for 60 s and move on; on `4xx` content/validation errors, stop (no paid retry of a rejected input — Fitcheck's rule).
- Every call records `provider`, `model`, `latencyMs`, token/image usage and estimated cost into the job step `meta` and an `aiUsage` row (powers the admin view and the spend cap).
- Paid providers (Bedrock) are allowed only when `ATLAS_ALLOW_PAID_AI=true`, the user is under their daily paid quota, and the global `ATLAS_MAX_DAILY_SPEND_USD` is not reached.

---

## 5. Data model (Convex schema)

Start from Fitcheck's `convex/schema.ts` (users, avatars, uploads, items, itemEmbeddings, outfits, renders, jobs, creditLedger→usageLedger, threads, proposals, systemCounters, usageCounters, dailyStats, stepStats) and add the Atlas tables. Every user-owned table carries `userId: v.id("users")` and a `by_user…` index; every read goes through an index (no `.filter` scans, no unbounded `.collect()`).

| Table | Source | Notes |
|---|---|---|
| `users` | Fitcheck | drop Clerk Billing fields for now; keep `prefs` (+ `quietHours`, `homeCity`, `timezone`) |
| `avatars`, `uploads`, `items`, `itemEmbeddings`, `outfits`, `renders`, `jobs`, `threads`, `proposals` | Fitcheck | add `items.laundryState`, `items.price`/`currency`, `items.phash`, `renders.provider`, `renders.shareExpiresAt` |
| `wearEvents` | Atlas | `idempotencyKey` unique per user via index `by_user_key` — keeps double taps from double counting |
| `consentGrants` | Atlas | `by_user_scope`; revocations recorded, never deleted |
| `sourceConnections` | Atlas | Gmail / Google Tasks; `encryptedRefreshToken` (AES-256-GCM in a `"use node"` action, key in env); never returned by queries |
| `oauthStates` | Atlas | state + PKCE verifier + `userId`, 10-min TTL, cron sweep |
| `emailFindings`, `moneyFindings`, `signals`, `notifications`, `preferences` | Atlas | dedup via `by_user_dedupKey` index |
| `garmentSuggestions` | new | receipts → wardrobe (§6.4) |
| `approvals` | Atlas | action, payloadHash, nonce, expiresAt, consumedAt |
| `auditEvents` | Atlas | append-only; kept through content wipe, removed on account deletion |
| `aiUsage` | new | provider, model, keyAlias, dataClass, costUsd, latencyMs, ok |
| `usageCounters` | Fitcheck | **kept through content wipe** (fixes Fitcheck's limit-reset bug) |

Counters that every request touches (daily spend, totals, stats) use the **Sharded Counter** component instead of one hot document, because Convex uses optimistic concurrency and a single hot row throws write conflicts under load (Fitcheck's `dailyStats` / `systemCounters` would hit this at scale).


---

---

## 6. Pipelines

### 6.1 Background jobs (Convex Workflow + Workpool)

- Every long task is a `jobs` row plus a durable **Workflow** (Fitcheck pattern): steps written with `setStep`, retries `{ maxAttempts: 3, initialBackoffMs: 2000, base: 2 }`, `onComplete` settles refunds/quota and statuses. The UI subscribes to `jobs.get` — live progress with no polling.
- Separate **Workpools** per provider so one slow provider cannot starve the others: `bedrockPool` (maxParallelism sized to the account's Bedrock quota), `groqPool`, `geminiPool`. This is the load-balancing layer for AI calls.
- Per-user fairness: max 3 running units per user (a photo batch = one unit), checked in the enqueuing mutation.
- Crons: sweep stuck jobs, delete orphaned storage files (uploaded but never registered after 24 h), expire share links and OAuth states, nightly Gmail rescan for connected users, morning outfit drip per user timezone.
- Convex limits to design around: Node actions 10 min, Convex-runtime actions 30 min, mutations 1 s of user code and ≤ 16,000 documents written / 32,000 scanned per transaction, 1 MiB per document, 8,192 array elements. Purges and backfills run in scheduled batches (Fitcheck's `purgeUserData` pattern).

### 6.2 Import: scan → choose → cutout

1. Client: user picks photos (JPEG/PNG/WebP; reject HEIC like Fitcheck), consent `garment_image_analysis` required. Upload goes straight to Convex storage via `uploads.generateUploadUrl` (rate-limited per user), then `uploads.createBatch` checks stored content type and size (Fitcheck's `assertStoredImage`), confirms each storage id is not referenced by another row, and starts one scan workflow per photo. Actions re-validate bytes with `sharp` before any provider call. Per-user daily caps on uploads and scans (`usageCounters`).
2. `scan` job: router `detect` → Gemini Flash with Fitcheck's detection instructions and JSON schema (reuse the prompt text, it is well tuned), max 12 items, bbox normalised and clamped. Store `candidates`; status `awaiting_selection`.
3. UI: original photo with numbered boxes, all unticked; user selects; `POST /api/uploads/:id/select` validates indices (unique, in range) and capacity (≤ 1,500 garments), creates garment rows `extracting`, enqueues `extract`.
4. `extract` job per garment: crop bbox (+8 % padding) with `sharp` → background removal (client-side bg0 result if the browser supplied one, else Nova Canvas `BACKGROUND_REMOVAL`, else keep the crop on a neutral background) → store cutout in Convex storage → colours with `sharp` → dHash → duplicate check (same category, Hamming distance ≤ 6, colour distance small) → garment `ready`, `analysis_provider` records provider chain.
5. Atlas confirm step stays: AI tags are suggestions; user can edit (existing confirm PATCH).

### 6.3 Try-on with Nova Canvas

Inputs: default avatar (consent `person_image_use`), outfit slots in layer order.

Strategy A — **one call** (cheapest): build one reference flat-lay with `sharp` (top, bottom/dress, shoes laid out on white, each scaled), then `VIRTUAL_TRY_ON` with `maskType: "GARMENT"`, `garmentClass: "FULL_BODY"`, `mergeStyle: "SEAMLESS"`, `preserveFace: "ON"`, output 768×1152 (2:3, divisible by 16).

Strategy B — **chained calls** (higher fidelity, used for HQ): `LOWER_BODY` (bottom) → `UPPER_BODY` with `outerLayerStyle: "CLOSED"` (top) → `UPPER_BODY` with `outerLayerStyle: "OPEN"` (outerwear) → `FOOTWEAR` (shoes); each call's output is the next call's source. Dress = `FULL_BODY`.

Rules carried from Fitcheck: check quota before enqueue (no job row for an unaffordable request); one `renders` row per image, `pending → done|failed`; permanent 4xx errors fail immediately; transient errors retry; failures release the user's daily try-on quota; outputs 2:3 with `object-contain` so feet and head stay visible; pending renders block avatar delete/replace.

Free demo fallback: `ATLAS_TRYON_PROVIDER=hf_space` calls a CatVTON Space via its Gradio API — **non-commercial licence**, label output "demo", never default in production.

### 6.4 Receipts → wardrobe (Atlas-only)

After a Gmail scan, findings whose merchant/subject match a clothing allowlist (Zara, Uniqlo, ASOS, H&M, Nike…; deterministic list) become `garment_suggestions`. Inbox card: "You bought *Linen shirt* from Uniqlo on 12 Oct — add it to your wardrobe?" Accept creates a garment with price (feeds cost-per-wear) and asks for a photo. Metadata only; no email bodies.

---

## 7. Stylist agent (Strands TypeScript SDK)

Route: `POST /api/stylist/threads/:id/messages` → streams Server-Sent Events. Identity from `requirePrincipal()`; the model never sees or chooses a principal id.

```ts
import { Agent, tool } from "@strands-agents/sdk";        // VERIFY exact exports against installed version
const agent = new Agent({
  model: router.agentModel(),        // Groq gpt-oss-120b → Gemini Flash → Bedrock Nova (by policy)
  systemPrompt: STYLIST_INSTRUCTIONS, // adapted from Fitcheck agent/instructions.md (British → user locale)
  tools: [getContext, getWardrobe, gapAnalysis, getWeather, composeOutfits, quoteTryOn, requestTryOn,
          saveOutfit, askQuestion, getMoneySignals, planTripPacking, researchProducts],
});
```

| Tool | Reads/writes | Source |
|---|---|---|
| `get_context` | prefs, avatar count, quotas left | Fitcheck + Atlas preferences |
| `get_wardrobe` | ready, non-hidden, clean garments (category/season filter) | Fitcheck |
| `gap_analysis` | category/season/formality/colour gaps | Fitcheck (port `summariseGaps`) |
| `get_weather` | Open-Meteo, 8 s timeout | Fitcheck (+ timeout fix) |
| `compose_outfits` | validates ownership/slots, writes `outfits` source `agent` | Fitcheck |
| `quote_tryon` | quota + blockers (no avatar, no consent, jobs running) | Fitcheck `quoteRenders` |
| `request_tryon` | creates a signed approval (`approvals` row: action, payload hash, nonce, 10 min expiry) and returns a card; **never starts work itself** | Atlas approval model |
| `save_outfit` | sets `saved_at` | Fitcheck |
| `ask_question` | renders 2–4 option buttons | Fitcheck |
| `get_money_signals` | cost-per-wear, unworn items, renewals | Atlas-only |
| `plan_trip_packing` | weather × wardrobe → packing list | Atlas-only |
| `research_products` | SerpApi read-only for a named gap | Atlas-only |

Model rotation for the agent uses Strands' own `ModelRouter` with `FallbackStrategy` (verified in `@strands-agents/sdk` 1.21; API marked provisional) over `OpenAIModel` candidates (`api: "chat"`, `clientConfig.baseURL` for Groq / Gemini-paid) and `BedrockModel`. The candidate list is built from the shared `convex/shared/ai.ts` policy, the same module the Convex router uses, so the `dataClass` rule (§16) cannot drift between the two runtimes.

Approval flow: the user taps Approve → `POST /api/approvals/:id` re-checks principal, payload hash, nonce, expiry, consent and quota, consumes the approval atomically, then enqueues the try-on job. Approval is a gate, authorization is re-derived server-side (Fitcheck's rule).

Page context: send current page/item/outfit/draft as `clientContext` marked untrusted (port `src/lib/stylist-context.ts`). Limits: 100 messages/day/user, max 4 model requests per turn (Atlas `ModelBudget`), 20 context items.

Skills: ship Fitcheck's `colour-pairing` and `dress-codes` as markdown loaded on demand.

---

## 8. Atlas-only features (better than Fitcheck)

1. **Receipts → wardrobe** (§6.4) with purchase price, so cost-per-wear is real from day one.
2. **Morning outfit drip**: daily at the user's chosen time (respect quiet hours) — weather + calendar-free heuristic → one outfit from clean garments → Inbox card and optional Telegram message (existing delivery flag + consent).
3. **Travel packing**: `/travel` becomes real: destination + dates → Open-Meteo range → packing list from owned items with gaps flagged.
4. **Laundry state**: wearing an item marks it `worn`; the stylist prefers clean items; "Laundry day" card when > N worn.
5. **Declutter / resale signals**: unworn ≥ 90 days or cost-per-wear above threshold → "rotate, donate or resell" card (Inbox already has the `unworn` signal).
6. **Gap → research, never purchase**: gap analysis → SerpApi offers → evidence card; buying stays outside Atlas.
7. **Google Tasks**: "Dry-clean the navy suit before Friday" created only after approval (Atlas has the connector; read-only today — writing needs a scope review).
8. **Privacy by design**: per-use consent, export/wipe covering photos, avatars, renders and chats; account-deletion webhook; share links expire (default 7 days) and are disabled when consent is revoked.

---

## 9. Security and privacy rules (from both reviews)

- Identity only from `requirePrincipal()`; every store query filters `principal_id`; OAuth/approval flows bind to the signed-in principal (audit finding 1).
- Asset ownership: every `asset_id` used by uploads/avatars/renders must belong to the caller and be referenced by at most one row; deletes check references first (Fitcheck finding 4).
- Upload rate limits per user/day; orphaned Convex storage files swept daily by the scheduled job (Fitcheck finding 3).
- Usage counters survive content wipes (Fitcheck finding 1).
- Telegram/CLI (Python) call only narrow `telegram.*` Convex functions guarded by `TELEGRAM_SERVICE_KEY` plus a verified Telegram-to-user link; they can never read Gmail tokens or images.
- Clerk `user.deleted` webhook (svix-verified) → full purge (Fitcheck's batched `purgeUserData` in `account` mode) including storage files and Google token revoke (Fitcheck finding 2).
- No dev impersonation in production; every outbound fetch has a timeout; all lists bounded or paginated.
- Images normalised server-side before any provider (orientation, sRGB, ≤ 2048 px, single frame, ≤ 50 MP) — port Fitcheck's `normalizeImageInput` logic using `sharp`.
- Prompt-injection stance: garment names, descriptions and page context are data; tools re-validate every id.

---

## 10. Cost, quota and load controls

| Control | Mechanism | Default |
|---|---|---|
| Per-user daily limits (uploads 50, scans 100, stylist messages 100, try-on 10 standard / 3 HQ, server cutouts 30) | `usageCounters` (or the **Rate Limiter** component, token bucket) in the enqueuing mutation | survive content wipe |
| Burst limits per user (e.g. 10 stylist messages/minute) | Rate Limiter component, token bucket | — |
| Provider concurrency | one Workpool per provider | sized to provider quota |
| Provider failover | router circuit breaker per provider/model | 60 s open on 429/5xx |
| Global paid spend | Sharded Counter `spend:<day>` checked before every paid call | `ATLAS_MAX_DAILY_SPEND_USD` |
| AWS budget | AWS Budgets alarms at 50/80/100 % of remaining credits | — |

Free-provider exhaustion degrades honestly ("Scanning is busy, retrying in a few minutes"), never silently.


---

---

## 11. Routes and screens

| Route | Purpose |
|---|---|
| `/wardrobe` | grid, filters (category, colour, season, formality, laundry), search, bulk actions |
| `/wardrobe/add` | batch upload, scan progress, review candidates, import queue |
| `/wardrobe/[id]` | detail, edit, swatches, wear history, outfits using it, re-extract |
| `/looks` | outfits list + builder (`/looks/new`, `/looks/[id]`) with try-on panel |
| `/lookbook` | renders gallery, share (expiring), download, delete |
| `/ask` | stylist chat (threads), proposal cards, approval cards, ask-question buttons |
| `/settings` (hub) | appearance, avatars (consent-gated), sources, privacy, notifications, quotas |
| `/travel` | real packing planner |
| `/admin` | usage, provider health, spend vs cap, failed jobs (role-gated) |

Data access is Convex functions (`uploads.*`, `items.*`, `outfits.*`, `avatars.*`, `renders.*`, `jobs.*`, `threads.*`, `approvals.*`, `money.*`, `consent.*`, `privacy.*`) called from the browser with the Clerk JWT. Next.js route handlers remain only for `/api/stylist/*` (streaming Strands agent) and `/api/oauth/{gmail,google-tasks}/*` callbacks. The Clerk `user.deleted` webhook is a Convex HTTP action (`/clerk-users-webhook`).

---

## 12. Delivery phases

| Phase | Scope | Done when |
|---|---|---|
| 0 Foundation | Convex project + Clerk JWT template; foundation schema (users, consentGrants, auditEvents, usageCounters, aiUsage, jobs, approvals); `lib/auth`, `lib/errors`, `lib/env`; Workflow/Workpool/Rate Limiter/Sharded Counter components; shared AI policy + router with `dataClass` filter, key pool and circuit breaker; Clerk deletion webhook (Convex HTTP action) → batched purge | Tests: router never sends `personal_*` to free Gemini; ownership on every public function; purge removes every table |
| 1 Port Atlas core | consent, preferences, audit, notifications, signals, money findings, Gmail + Google Tasks OAuth (encrypted tokens), privacy export/wipe | Existing atlas-web screens run on Convex with live queries; old Postgres store deleted |
| 2 Import | batch upload, scan (Bedrock Nova Lite → Groq), review, cutout (bg0 client + Nova fallback), colours, dHash duplicates | 3 photos → choose 4 pieces → 4 ready cutouts with tags |
| 3 Wardrobe + outfits | grid, filters, search index, bulk actions, detail, laundry state, outfit builder, idempotent wear logging | server rejects foreign/unready/miscategorised items (tests) |
| 4 Avatars + try-on | consent-gated avatars, Nova Canvas VTO (strategies A/B), renders, lookbook, expiring shares | outfit → 2 images; failures release quota; avatar locked while pending |
| 5 Stylist | Strands TS agent in a Convex Node action (same AI policy, key pool and spend ledger as every other call; tools are internal functions scoped to the thread's owner), approvals, threads | brief → proposals → approved try-on; injected text cannot trigger tools |
| 6 Atlas-only | receipts → wardrobe, morning drip (+Telegram via convex-py), travel packing, declutter, research | each behind consent, visible in Inbox |
| 7 Hardening | admin usage view, provider health, load test (k6) at S256 concurrency, accessibility pass | no write-conflict errors under load; p95 job pickup < 5 s |


---

---

### Sign in with Google = Gmail and Tasks connected

Users who sign in with Google through Clerk get Gmail and Google Tasks linked without a second
OAuth flow. Clerk holds and refreshes the Google grant; Convex reads a short-lived access token from
Clerk's Backend API (`/v1/users/{id}/oauth_access_tokens/oauth_google`) when it scans. Setup:

1. Clerk dashboard → SSO connections → Google → use custom credentials (the same Google OAuth client).
2. Add scopes `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/tasks.readonly`
   to sign in for everyone, or leave them off: the Sources page then asks for each one on demand
   (Clerk `externalAccount.reauthorize({ additionalScopes })`, incremental authorization).
3. `npx convex env set CLERK_SECRET_KEY sk_...`.

A user who disconnects a source is never re-linked automatically; pressing Connect again re-enables it.
`gmail.readonly` is a Google *restricted* scope: production use beyond 100 test users needs Google's
OAuth verification and an annual third-party security assessment (CASA). Plan for it before launch.

Travel hands off to Google Flights and Google Hotels with the route and dates filled in. Atlas never
books or takes payment.

## 13. Environment variables

```dotenv
# Next.js (Vercel/Render)
NEXT_PUBLIC_CONVEX_URL=        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=   CLERK_SECRET_KEY=
GROQ_API_KEYS=key_a,key_b            # agent model calls (one org = no extra quota)
AWS_REGION=us-east-1  AWS_ACCESS_KEY_ID=  AWS_SECRET_ACCESS_KEY=     # agent Bedrock fallback (least-privilege IAM)

# Convex deployment (npx convex env set ...)
CLERK_JWT_ISSUER_DOMAIN=       CLERK_WEBHOOK_SECRET=   ENCRYPTION_KEY=   ENCRYPTION_KEY_PREVIOUS=
GOOGLE_CLIENT_ID=  GOOGLE_CLIENT_SECRET=          # Gmail + Google Tasks (read-only scopes)
CLERK_SECRET_KEY=                                 # lets Convex read the Google token of users who signed in with Google
GEMINI_API_KEY=  GEMINI_PAID=false                 # free tier = public_text only
GROQ_API_KEYS=   AWS_REGION=  AWS_ACCESS_KEY_ID=  AWS_SECRET_ACCESS_KEY=
ATLAS_AI_CHAIN_DETECT=bedrock,groq   ATLAS_AI_CHAIN_TEXT_PUBLIC=gemini,groq
ATLAS_BEDROCK_IMAGE_MODEL=amazon.nova-canvas-v1:0  # VERIFY model id/region
ATLAS_ALLOW_PAID_AI=true  ATLAS_MAX_DAILY_SPEND_USD=5
TELEGRAM_SERVICE_KEY=                              # only for the narrow Telegram functions (§9)
```

IAM: a dedicated user or role with only `bedrock:InvokeModel` on the Nova Canvas, Nova Lite and Nova embeddings ARNs; never root keys. Rotate keys through the pool without downtime.


---

---

## 14. Open verifications before building

Verified on 2026-10-17 (npm registry and package type definitions): `@strands-agents/sdk` 1.21.0 (Node ≥ 22; exports `Agent`, `tool` with zod, `OpenAIModel` with `clientConfig`, `BedrockModel`, `GoogleModel`, `ModelRouter` + `FallbackStrategy`, HITL interventions), `convex` 1.47.0, `@convex-dev/workflow` 0.4.10, `@convex-dev/workpool` 0.4.14, `@convex-dev/rate-limiter` 0.4.2, `@convex-dev/sharded-counter` 0.2.3, `@convex-dev/aggregate` 0.3.3, `convex-test` 0.0.62, `@aws-sdk/client-bedrock-runtime` 3.1152.0, `svix` 2.8.0, `@bg0/browser` 0.1.1 (early — keep the server fallback).

Still open:


1. Gemini free-tier RPD for the current Flash model and whether Flash Image editing is free (AI Studio rate-limit page).
2. Groq free catalogue: is Llama 4 Scout (vision) still free; current `gpt-oss-120b` limits.
3. Nova Canvas: current price per image, regions, exact model id, and whether VTO works well with a composite multi-garment reference (Strategy A) — run a 10-outfit bake-off against Strategy B.
4. Strands TS SDK: OpenAI-compatible base URL support (for Groq/Gemini) vs native providers; streaming and structured output APIs in the installed version.
5. `@bg0/browser` model size and mobile performance; fallback when WebGPU/WASM is unavailable.
6. Convex region options (EU residency), current SOC 2 report, and Professional pricing on convex.dev/pricing.
7. Licences: CatVTON / IDM-VTON are non-commercial — demo only.

---

## 15. Database decision: Convex (verified October 2026)

The first draft kept Postgres only because atlas-web already used it. With Atlas still at test stage and the priorities set to scalability, load balancing and security, the decision is **Convex Cloud**.

**Why Convex fits these priorities**
- **Scalability:** functions and storage scale on Convex's managed infrastructure. Professional runs in concurrency class S256 (256 concurrent queries and mutations, 512 Convex-runtime actions, 256 Node actions, 256 scheduled jobs, 10,000 concurrent sessions); Business/Enterprise offer D1024/D2048. Free is S16 with hard caps (16 concurrent queries/mutations, 0.5 GB DB, 1 GB files, 1M calls/month) — enough to build and test, not to launch.
- **Load balancing:** Next.js stays stateless and scales horizontally; Convex handles database connections and fan-out (no connection-pool tuning, unlike serverless Postgres). AI load is balanced by per-provider Workpools plus router failover.
- **Security:** no client ever touches the database directly; every access is a typed function with argument validators and `requireUser`. Convex states SOC 2 Type II, AES-256 at rest, TLS in transit, GDPR compliance, and HIPAA BAAs on request (security page is dated — request the current report). Clerk JWTs are verified by Convex on every call.
- **Live UX for free:** job steppers, try-on cards and chat proposals update instantly through subscriptions.
- **Proven blueprint:** Fitcheck's audited patterns (credits ledger, workflows, ownership checks) port with little change.

**Known costs and limits, and how the plan handles them**
| Risk | Mitigation |
|---|---|
| Free tier too small for launch | Plan for Professional ($25 per developer per month) before real users |
| Optimistic-concurrency conflicts on hot documents | Sharded Counter for daily spend/stats; one row per event elsewhere |
| Per-transaction limits (32k scanned / 16k written docs, 1 s user code) | Indexed reads only; batched scheduled purges/backfills |
| Billing per document scanned | Every query uses an index; no `.filter` on large tables |
| Lock-in | Backend is open source (FSL Apache 2.0) and self-hostable on Postgres if ever needed |
| Python services | `convex` PyPI client with `set_auth`; create one client per request (shared-client thread safety unverified) |
| EU data residency | **VERIFY** current region options with Convex before onboarding EU users |
| Frontend hosting | Vercel Hobby forbids commercial use; use Vercel Pro or a paid Render instance for launch |

**Migration path from today's atlas-web:** port the store (`lib/server/store.ts`) table by table into `convex/model/*`, keep route handlers only for OAuth callbacks and the stylist stream (the Clerk webhook becomes a Convex HTTP action), and delete the Postgres migrations once Phase 1 passes. The Python Atlas layer switches from local storage to `convex-py`.

## 16. Provider and API key rotation

Two different things are called "rotation". Only one of them is safe.

**Allowed: provider and model failover (build this).** The router (§4.1) keeps an ordered chain per capability, for example `groq:gpt-oss-120b → bedrock:nova-lite`. On `429`, `5xx` or a timeout it opens a short circuit breaker for that provider/model and moves to the next. That gives resilience and spreads load across genuinely different quotas.

**Allowed: key pools for availability and secret rotation.** `GROQ_API_KEYS=a,b` lets you revoke and replace keys without downtime and keep environments apart. It does **not** add capacity: Groq applies limits per organization ("Rate limits apply at the organization level, not individual users."), and Gemini applies them per Google Cloud project.

**Not allowed: multiplying free quota with extra accounts or projects.** Groq's Acceptable Use Policy (per a third-party summary; read the original) bars getting around published limits through extra accounts or coordinated use across organizations, and Groq may keep prompts for up to 30 days when it investigates suspected rate-limit circumvention. Doing this risks a ban that takes Atlas offline. Scale by adding a paid tier, or by routing to Bedrock with your AWS credits.

**Privacy rule that decides routing.** Gemini's free ("Unpaid Services") terms say Google uses submitted content to improve its products, that human reviewers may read inputs and outputs, and: "Do not submit sensitive, confidential, or personal information to the Unpaid Services." Atlas sends selfies, wardrobe photos, chats and Gmail-derived data. So:

| Data | Allowed providers |
|---|---|
| Avatar and wardrobe photos, try-on images | Bedrock (no training, not shared with model providers, no human access to inputs/outputs), Groq (no training, no retention by default; opt out of troubleshooting logs), Gemini **paid** tier |
| Stylist chat, wardrobe text, Gmail-derived data | Groq (no training; no retention by default; opt out of troubleshooting logs), Bedrock, Gemini paid |
| Generic, non-personal text | Any, including Gemini free |

**Router design.** Each request carries a `dataClass` (`personal_image`, `personal_text`, `public_text`). The router filters the provider chain by `dataClass` before trying anything, so a misconfigured env var can never send a selfie to a free tier. Keys come from a pool; the pool picks the least-recently-throttled key and records `429`s. Every call is logged in `aiUsage` with provider, model, key alias (never the key), latency and cost. A unit test asserts that `personal_*` requests never resolve to `gemini` unless `GEMINI_PAID=true`.

```ts
type DataClass = "personal_image" | "personal_text" | "public_text";
const ALLOWED: Record<DataClass, Provider[]> = {
  personal_image: ["bedrock", "groq", ...(paidGemini ? (["gemini"] as const) : [])],
  personal_text: ["groq", "bedrock", ...(paidGemini ? (["gemini"] as const) : [])],
  public_text: ["gemini", "groq", "bedrock", "openrouter"],
};
```

## 17. Sources

- Fitcheck repository (read in full): https://github.com/sonnysangha/AI-Wardrobe-app-vercel-eve-clerk-nextjs
- Amazon Nova Canvas request types: https://docs.aws.amazon.com/nova/latest/userguide/image-gen-access.html
- Amazon Nova Canvas virtual try-on: https://docs.aws.amazon.com/nova/latest/userguide/image-gen-vto.html
- AWS Virtual Try-On guidance (pricing reference): https://aws.amazon.com/solutions/guidance/virtual-try-on-on-aws/
- Nova Canvas VTO launch blog: https://aws.amazon.com/blogs/aws/amazon-nova-canvas-update-virtual-try-on-and-style-options-now-available
- Nova Multimodal Embeddings: https://aws.amazon.com/blogs/aws/amazon-nova-multimodal-embeddings-now-available-in-amazon-bedrock
- Strands Agents TypeScript SDK v1.20.0: https://strandsagents.com/changelog/sdk/typescript-v1.20.0/
- Gemini API rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini free tier overview (third-party, Oct 2026): https://klymentiev.com/blog/gemini-api-free-tier
- Groq free tier (third-party): https://klymentiev.com/blog/groq-api-free-tier
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- OpenRouter free limits (third-party): https://buldrr.com/openrouter-free-models-list-2026-all-27-models-ranked-tested/
- bg0 in-browser background removal: https://github.com/opencoredev/bg0/wiki
- IDM-VTON licence/README: https://cdn.jsdelivr.net/gh/yisol/idm-vton@main/README.md
- CatVTON: https://huggingface.co/zhengchong/CatVTON
- Gemini API terms (Unpaid Services data use): https://ai.google.dev/gemini-api/terms
- Groq rate limits (organization level): https://console.groq.com/docs/rate-limits
- Groq data use: https://console.groq.com/docs/your-data
- Groq AUP summary (third-party): https://conductatlas.com/platform/groq/groq-acceptable-use-policy/rate-limit-and-account-registration-restrictions/
- Bedrock data use: https://www.repost.aws/knowledge-center/amazon-bedrock-model-data-use
- Convex self-hosting: https://docs.convex.dev/self-hosting and https://github.com/convex/convex-backend
- Convex components (Workflow, Workpool, Agent): https://www.convex.dev/components and https://docs.convex.dev/agents
- Convex free tier (third-party): https://agentdeals.dev/vendor/convex
- Neon free plan: https://neon.com/faqs/free-plan-limits-and-quotas
- Convex limits (concurrency classes S16/S256, per-transaction limits): https://docs.convex.dev/production/state/limits
- Convex security (SOC 2 Type II, AES-256 at rest): https://www.convex.dev/security
- Convex sharded counter component: https://www.convex.dev/components/sharded-counter
- Convex Python client: https://pypi.org/project/convex/ and https://github.com/get-convex/convex-py
- Vercel Hobby (non-commercial only): https://vercel.com/docs/plans/hobby
