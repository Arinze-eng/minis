# Atlas Workflow Guide

## Product experience

Atlas should feel like a calm personal operations inbox rather than a technical chatbot. A user can ask a question, assign a task, request research, ask why a recommendation appeared, approve an exact draft, snooze it, dismiss it, correct it, or pause access. The same case and policy state must be available from the WebUI, Telegram, CLI, and future integrations.

The user-facing loop is:

```text
ask or authorize
→ Atlas explains the source it needs
→ consent is checked
→ Strands selects a bounded tool path
→ real or explicitly labelled fixture evidence is gathered
→ Atlas returns one useful next action
→ user starts, snoozes, dismisses, corrects, or approves
→ Atlas records the state
→ a later refresh verifies or marks the outcome unresolved
```

## WebUI flow

The WebUI should expose an Atlas Inbox, an Ask Atlas composer, evidence details, consent controls, approval cards, and preferences. The existing nanobot WebUI remains the shell; Atlas should be added through its existing API/WebSocket and component conventions rather than a second frontend.

The Inbox card should answer four questions: what Atlas noticed, what evidence supports it, what the smallest next action is, and what will happen if the user presses the action button. It should expose Start, Snooze, Dismiss, Why, Approve, Edit, and Reject only when those actions apply.

The first-use flow should be short. The user chooses Google Tasks, Shopping Research, Telegram, or sample data; chooses whether Atlas should respond only when asked or provide a digest; then sees a first result or a transparent empty state. Technical capability names are not shown in the primary flow.

## Telegram flow

Telegram is the proactive and approval channel for the private demo. It should accept natural-language questions, deliver compact Atlas cards, and support safe callback actions. Telegram must use the same Atlas service, response contract, consent policy, and idempotency logic as the WebUI.

A Telegram card should contain a short explanation, source and freshness, one next action, and buttons. It should never contain secrets, raw access tokens, internal approval hashes, or unnecessary private provider payloads. Delivery remains disabled by default and requires an explicit send flag, consent, enabled connector, and a server-derived destination.

## Background and drip workflow

Atlas background behavior is intentionally quiet. It may inspect only explicitly authorized sources, use deterministic cooldown and quiet-hour rules, select at most one Drip Advice item for a delivery window, and suppress advice that the user dismissed or corrected. The agent does not send generic productivity spam or diagnose the user.

A useful drip item looks like:

```text
Small suggestion:
You have two errands near the same location tomorrow.
Would you like me to group them into one plan?

[Yes] [Not now] [Not useful]
```

A background run must be idempotent and safe under at-least-once scheduling. It should persist a delivery key before sending and record the outcome after delivery.

## Picture-based Wardrobe Help

The hackathon MVP should begin with user-entered garment records because that path is deterministic, inexpensive, and easy to demonstrate. The next extension can support a user taking a picture of a garment or outfit.

The safe image workflow is:

```text
user chooses Add garment photo
→ explicit image-use consent
→ authenticated upload to private object storage
→ virus/type/size validation
→ opaque object reference stored in user-scoped Atlas record
→ optional user-provided description and tags
→ wardrobe request uses only the selected image/reference
→ user can view, replace, or delete it
```

Do not store binary image data in JSON case records or in the public WebUI bundle. Store a private object key and metadata such as file type, size, checksum, created time, and user scope. Use signed, short-lived access when the image must be displayed. Do not expose object-store credentials to the browser.

The model may use the image only for an explicitly requested clothing task. It must not infer or state attractiveness, body value, age, ethnicity, gender, identity, health, or personality. It may describe visible garment attributes with uncertainty and ask the user to correct them. A user must be able to delete the image and revoke image use.

## MCP and skill workflow

MCP is an extensibility mechanism, not an instruction source. Atlas should show approved integrations in a simple catalog with: name, purpose, data read, possible side effects, required consent, and enabled tools. A model cannot discover and activate arbitrary MCP servers.

For a research request, Atlas may use an approved research MCP server or native SerpApi tool. It must return source URLs, retrieval times, and uncertainty. For Task Start, only the approved task tools are available. For Money Guard, only read-only financial tools are available. Shell, arbitrary filesystem mutation, purchases, payments, and account/security operations remain denied.

Skills should be versioned, scoped to a scenario, and treated as instructions for behavior rather than authorization. Consent and capability policy remain deterministic code.

## Real demo workflow

The five-minute demo should show:

1. A user opens the WebUI or Telegram and asks, “What should I do next?”
2. Atlas explains that it needs to read Google Tasks.
3. The user grants read consent.
4. The real Google Tasks connector reads a bounded task list.
5. A real Strands Agent calls the bounded Task Start tool.
6. Atlas returns one recommendation with evidence and freshness.
7. The user opens Why? and sees the source.
8. The user snoozes or starts the recommendation.
9. Atlas records the state and later reports verified, stale, unavailable, or unresolved.
10. The same case is visible from Telegram or the WebUI.

No external write should occur during the main demo unless the exact action is shown and explicitly approved.

## Local developer workflow

Use the persistent memory file as the handoff record:

```text
.atlas/ATLAS_MEMORY.md
```

For every feature, the implementer should inspect the existing extension point, make the smallest change, run focused tests, update the memory checklist, commit a stable checkpoint, and then continue.

The first local proof is:

```bash
uv run --no-sync python scripts/atlas_stage1_smoke.py
```

The first real Atlas proof is:

```bash
uv run --no-sync python scripts/atlas_demo.py \
  --scenario task_start \
  --query "What should I do next?" \
  --grant-consent
```

The first connector smoke checks are:

```bash
uv run --no-sync pytest tests/atlas/test_connector_smoke.py \
  -k "google_tasks or serpapi or telegram" \
  -m atlas_smoke -v
```

## Acceptance test for a non-developer

A person unfamiliar with the repository should be able to connect one source, ask a question, understand the evidence, find the Why explanation, snooze a case, correct a case, see what Atlas can access, and pause Atlas without reading technical documentation. Any point of confusion should become a product issue rather than a user training requirement.
