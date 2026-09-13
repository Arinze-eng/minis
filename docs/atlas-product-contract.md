# Atlas Product Contract (Phase 0)

The promise, the unit of product, and the rules every surface must obey. This
document is the arbiter for scope disputes during Phases 1–6.

## 1. Product promise

> **Atlas notices the work you are avoiding, prepares the next move, and asks
> before it acts.**

Atlas helps a person understand the relationship between what they own, what
they pay for, what they use, and what deserves their attention next. It is a
calm personal operations system — not a chatbot, not a bank dashboard, not an
upsell funnel, not a copied fashion app.

## 2. The four questions

Every surfaced signal must answer:

1. **What did Atlas notice?** — plain-language statement, no jargon.
2. **What evidence supports it?** — sources, freshness, bounded excerpts.
3. **Why does it matter now?** — the implication, with uncertainty shown.
4. **What is the smallest useful next move?** — one primary action, prepared
   not executed.

## 3. The Signal Card (core product object)

A Signal Card combines: signal type; source and freshness; confidence or
uncertainty; supporting evidence; a human-readable implication; one primary
action; secondary controls (Why, Snooze, Dismiss, Correct, Pause); and an
explicit statement of whether Atlas can **advise**, **prepare**, or **act**
(MVP: advise and prepare only).

Reference example (tone and structure to match):

> **Your rental wardrobe is renewing tomorrow**
> Atlas found a renewal message from the authorized mailbox and a recurring
> charge in the read-only transaction feed. You have logged two wears from
> this rotation in the last 30 days.
> **Next move:** review the renewal and decide whether to keep it.
> **Atlas can prepare:** a cancellation checklist. It cannot cancel anything
> without your explicit approval, and the MVP does not perform cancellations.

## 4. Two cooperating engines, one Atlas

- **Wardrobe Engine** — digitizes owned garments, verifies structured
  attributes, learns only from explicit user feedback, produces outfit
  candidates from confirmed items.
- **Culture Engine** — reads authorized lifestyle evidence, detects recurring
  commitments and price changes, computes annualized lifestyle cost, and
  connects spending to actual use (e.g. wear frequency) when evidence exists.

Rules: shared evidence and consent primitives only — no indiscriminate data
sharing. A wardrobe image is not a general personalization signal; a receipt
is not a fashion preference. Cross-domain recommendations require an explicit
allowlisted scenario, sufficient evidence from both domains, and a clear
explanation of the connection. Engine names may appear in architecture and
source-health views; user-facing language is always "Atlas".

## 5. Derived measures (display contract)

- **Annual Lifestyle Cost** — shows normalized charge + cadence assumption.
- **Urgent Renewals** — only with a reliable renewal date.
- **Cost Per Wear** — confirmed wear events or an explicitly labelled user
  estimate.
- **Use-to-Cost Signals** — compares use with recurring cost; never moralizes.

Every derived measure displays: inputs, date range, currency, cadence
assumption, uncertainty, last refreshed time. Neutral wording ("annualized
cost", "review opportunity"); never "damage".

## 6. Information architecture (routes)

- `/` Atlas Inbox · `/ask` Ask Atlas · `/wardrobe` inventory ·
  `/wardrobe/add` add garment · `/looks` saved looks · `/signals` signals ·
  `/signals/:id` signal detail + Why · `/money` recurring-charge review ·
  `/sources` consent + source health · `/settings/privacy` data controls ·
  `/settings/preferences` delivery/quiet hours.

Inbox layout: compact left nav (desktop), focused Signal Card column, right
context rail (source health, quiet hours, access scope), progressive evidence
disclosure, one primary action per card, explicit empty/loading/stale/blocked/
unavailable states. No vanity-metric hero.

## 7. Required behavior invariants

1. Identity, ownership, consent, and deletion are enforced **server-side**.
2. The model never authorizes, owns, consents, deletes, or executes.
3. Every destructive action requires confirmation or offers an undo window.
4. Evidence retention is minimized (bounded fields, redacted snippets; no full
   email bodies or raw provider payloads).
5. Images are sensitive: purpose disclosure → validation → private storage →
   consent-gated analysis → user confirmation; replace/delete always available.
6. Demo/synthetic mode is labelled everywhere it appears; a real account is
   never silently downgraded to volatile storage.
7. Signals never masquerade as certainty: uncertainty is visible, staleness is
   labelled, provider-unavailable is an explicit state.
8. Offline is draft-and-read only, with labelled staleness and idempotent
   reconnect; queued actions are never mistaken for completed ones.

## 8. First-release acceptance flow (non-developer)

Open Atlas → understand the promise in 10 seconds → enter demo mode or connect
one source with clear consent language → add one garment image → review and
correct suggested tags → confirm the garment → ask for an outfit for a stated
occasion and weather → see only outfits from confirmed owned garments → save,
reject, or correct a look → open a Signal Card (synthetic or authorized
evidence) → open Why (source, freshness, confidence, limits) → snooze or
dismiss and see the state change → revoke a source or delete a garment asset →
confirm nothing was sent, bought, cancelled, or mutated without approval →
repeat a supported request through Telegram if enabled → complete the core
flow by keyboard and on a narrow viewport → install as a PWA and reload
offline into a safe, clearly-labelled shell → upload via the signed flow,
confirm metadata, delete, and verify record + asset cleanup → reconnect after
an offline draft/feedback action and observe an idempotent, visible result.

## 9. Reporting vocabulary

The acceptance report must classify every item as: **implemented and
verified**, **implemented but provider-dependent**, **mocked or synthetic**,
**intentionally blocked**, or **not yet implemented**. Fixtures are never
described as live provider results; prototypes are never described as
production-ready private applications.
