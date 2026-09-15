# Atlas Feature Matrix (Phase 0)

Classification of every relevant feature across the existing Atlas backend,
the team `dripadvisor` application, and the integrated Atlas target. Status
vocabulary: **exists (verified)**, **exists (provider-dependent)**,
**adapt + build**, **build new**, **blocked by policy**, **not planned**.

## 1. Backend foundations (existing Atlas)

| Capability | Status | Notes |
|---|---|---|
| Typed contracts (§6 model set) | exists (verified) | `contracts.py`; tests pin serialization + approval binding. |
| Deterministic policy (15 rules, deny-by-default) | exists (verified) | Rule-by-rule table tests in `test_policy_rules.py`. |
| Scenario→connector routing + consent lookup | exists (verified) | `service.py`; 5 scenarios. |
| Google Tasks read-only connector | exists (provider-dependent) | Live test env-gated; passes with isolated consent. |
| Gmail read-only evidence summary | exists (provider-dependent) | Metadata-only, bounded, consent-gated; placeholder-safe. |
| Plaid Sandbox Money Guard + deterministic recurring/price-change | exists (verified, sandbox-labelled) | `money.py` rules pinned. |
| SerpApi shopping research (read-only) | exists (provider-dependent) | NOT_CONFIGURED short-circuit tested. |
| Telegram delivery (send flag + consent + server chat id) | exists (provider-dependent) | Never implicit. |
| Wardrobe deterministic rules + store persistence | exists (verified) | Confirmed-garment inputs only. |
| Drip advice engine (cooldown/quiet hours/snooze/dismiss/correction) | exists (verified) | `drip.py` + user-scoped feedback records. |
| Cross-domain two-domain allowlist | exists (verified) | Three allowed pairs; bounded card. |
| Outcome verification (15 states) | exists (verified) | Refreshed-evidence-only verification. |
| Capability bundles with import-time invariants | exists (verified) | Blocked ops can never be approval-gated. |
| Local atomic store | exists (verified) | Demo/offline system of record. |
| Secret-safe credentials + diagnostics | exists (verified) | Tri-state presence; placeholder rejection end-to-end. |
| Per-user Postgres system of record | build new | Neon via committed migrations (§3). |
| Per-user OAuth token store (encrypted at rest) | build new | Design in threat model §5.2. |
| Subscription scan jobs (idempotent, dedup, progress) | build new | Money/Signals phase. |

## 2. Team application features

| Team feature | Decision | Integrated status target |
|---|---|---|
| Dark graphite rail + warm paper workspace | preserve (adapt) | Atlas shell tokens (design system §1). |
| Wardrobe overview/inventory/saved looks | adapt + build | Wardrobe routes on Atlas contracts. |
| One-at-a-time upload + editable analysis + confirmation | adapt + build | Analysis state machine with provenance. |
| Wardrobe filtering/search | adapt + build | URL-stateful filters. |
| Weather context (Open-Meteo snapshot) | adapt + build | Weather evidence with `observedAt` freshness. |
| Outfit request composer | adapt + build | `/wardrobe` + `/ask` flows, confirmed items only. |
| Deterministic candidate selection + model explanation | preserve (adapt) | Already the Atlas chain shape. |
| Save/reject/tried-again feedback | preserve (adapt) | Private style profile inputs. |
| Preview consent notice (`noticeAccepted`) | preserve (adapt) | Consent-gated preview flow. |
| Try-on with person images | defer | Requires consent records, rate limits, retention policy. |
| Zod request contracts | preserve (adapt) | Re-expressed at the browser boundary; Pydantic at the service. |
| Neon raw-pg persistence | adapt + build | Committed migrations, user-scoped queries, indexes. |
| Drizzle MySQL schema | replace | Postgres migration document. |
| tRPC routers (`publicProcedure`) | reject | One Atlas request contract; server-verified identity. |
| Owner id `0` fallback | reject | Labelled synthetic demo principal. |
| Client base64 image payloads | replace | Signed server-issued uploads with validation. |
| In-memory fallback for real accounts | replace | Explicit unavailable state. |
| Unconditional delete (no owner in predicate) | replace | Owner-scoped delete everywhere. |
| Muse/DripAdvisor naming | reject | Atlas naming throughout. |
| Demo state presented as private data | reject | Always labelled synthetic. |

## 3. Integrated product surfaces (to build, Phases 1–6)

| Surface | Phase | Depends on |
|---|---|---|
| Atlas shell, nav, routes, empty states, demo mode | 1 | — |
| Next.js App Router tree, metadata, boundaries | 1 | shell |
| PWA manifest, icons, SW lifecycle, install/update UX | 1 | shell |
| Wardrobe inventory + add + analysis confirmation | 2 | shell, uploads |
| Signed upload validation + private asset storage | 2 | asset system |
| Outfit flow (confirmed-only) + saved looks + feedback | 2 | wardrobe |
| Signal Cards + detail + Why panel | 3 | evidence layer |
| Snooze/dismiss/correct/pause/undo | 3 | signals |
| First cross-domain signal (wardrobe × money/email) | 4 | signals + both engines |
| Telegram routing of supported Atlas requests | 5 | service (exists) |
| Hardening: a11y, responsive, security, PWA, isolation tests | 6 | all |

## 4. Intentionally blocked (policy, not missing work)

Purchases; subscription cancellations; bank transfers; financial mutations;
Gmail send/edit/archive/delete; body/attractiveness judgments; identity,
ethnicity, age, health, personality inference from images; unbounded
background autonomy; arbitrary MCP activation; public feed of private
wardrobe data; unlabelled "AI stylist" inventing garments.
