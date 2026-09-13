# Atlas Threat Model (Phase 0)

Baseline security analysis for the integrated Atlas release, using OWASP ASVS
concepts as the verification vocabulary. This document records resolved and
**unresolved** limitations honestly; unresolved items block any production
readiness claim.

## 1. Assets and trust boundaries

- **Assets**: wardrobe and reference images; garment metadata; email-derived
  evidence (headers, bounded snippets); transaction evidence (sandbox or
  authorized read-only); consent grants and tokens; user identity; audit
  records; style preference profile.
- **Trust boundaries**: browser ↔ Next.js server; Next.js server ↔ Atlas
  backend service; Atlas backend ↔ providers (Google, transaction provider,
  weather, search); Atlas backend ↔ Postgres; Atlas backend ↔ asset storage.

## 2. Authentication and identity

- Server-verified principal only (`AuthenticatedAtlasContext`); client- or
  model-supplied user ids are ignored by policy (pinned by tests).
- Identity binding for the Next.js layer: session cookie issued by the Atlas
  backend; the adapter forwards verified identity, never client claims.
- **Resolved in existing code**: consent re-checked immediately before every
  provider call; approvals bound to user + action type + payload hash + nonce
  + expiry + idempotency key.

## 3. Authorization and ownership

- Deny-by-default deterministic policy (`policy.py`); capability must be
  declared by the connector and permitted by consent scope.
- Every private record is user-scoped server-side; every delete predicate
  includes owner id (team app's unconditional-id delete is rejected).
- Cross-domain resolution limited to an explicit two-domain allowlist.

## 4. Findings inherited from the team application (disposition)

| Finding | Severity | Disposition |
|---|---|---|
| All tRPC routes `publicProcedure` (no auth) | Critical | Rejected: Atlas APIs enforce server-verified identity on every private route. |
| Fallback owner id `0` treated as a real owner | Critical | Rejected: demo mode is explicit and labelled; no real account maps to id `0`. |
| Client sends base64 images (up to 12 MB) to server procedures | High | Replaced: signed server-issued uploads; server validates MIME, byte size, dimensions, decompression-bomb bounds, content signature before storage/model use. |
| Silent in-memory fallback for real accounts | High | Replaced: explicit `unavailable` state for real accounts; in-memory only inside labelled synthetic demo mode. |
| Delete predicate missing owner id (Drizzle path) | High | Replaced: owner id included in every delete predicate (Neon path already correct). |
| Try-on with person images without consent records or rate limits | High | Deferred: consent-gated, rate-limited, logged, retention-bounded design required before any enablement. |
| Runtime `CREATE TABLE IF NOT EXISTS` schema bootstrap | Medium | Replaced by committed, reviewed migrations against dev/test/prod branches. |
| No rate limiting on model/image endpoints | Medium | Added to requirements: per-user limits with bounded windows on analysis, preview, scan endpoints. |
| Provider errors and fallbacks logged with verbose detail | Low | Bounded redacted error info only (`ConnectorErrorInfo`); trace ids are non-sensitive. |

## 5. Unresolved limitations (explicit, block production claims)

1. **Demo owner fallback**: until the first integrated release ships real
   authenticated sessions end-to-end, demo mode uses a labelled synthetic
   principal. Production multi-tenant claims remain blocked while this exists.
2. **Token storage**: Google OAuth refresh tokens are currently environment
   credentials only (no per-user token store yet). The documented design
   (application-layer encryption with server-only `ENCRYPTION_KEY`, key
   versioning, never returned to browser/logs) must be implemented together
   with the per-user connection store in Neon.
3. **Scan-job state machine**: subscription scan progress, idempotency, and
   deduplication counters are specified but not implemented; they land with
   the Money/Signals phase.
4. **Rate limiting**: per-user bounded windows exist locally in connectors
   (e.g. Gmail's 10/60s window); a shared, per-user server-wide limiter is
   not yet implemented.
5. **PWA sensitive-cache exclusion**: service-worker strategy is specified;
   verification evidence is pending until the Next.js shell exists.

## 6. Data handling rules (binding)

- Never store or log: raw email bodies, OAuth refresh tokens in plaintext,
  private image data outside the asset system, API keys, raw provider
  payloads.
- Evidence retention is minimized to explanation fields (source type, provider
  reference, retrieval/freshness timestamps, normalized merchant/subject,
  bounded excerpt, confidence, redaction status).
- A person's image never reaches an external model without image-use consent
  for that exact purpose; consent revocation prevents future submissions and
  triggers the documented deletion workflow.
- Disconnect/revoke deletes stored tokens, invalidates active jobs, and
  removes or anonymizes derived evidence per the retention policy.
- Full privacy wipe removes wardrobe assets, person/reference assets,
  generated previews, style embeddings, evidence records, subscription
  records, pending jobs, cached drafts, and search indexes for the user.

## 7. Verification baseline

- OWASP ASVS concepts as the checklist vocabulary (V2 authentication, V4
  access control, V5 validation, V7 errors/logging, V8 data protection, V9/
  V13 communications, V14 configuration).
- Atlas policy tests (§7 rule table) plus new tests for: user scoping on every
  private query, delete-ownership predicates, upload validation bounds,
  consent-gated provider submissions, rate limits, and cross-user isolation
  with two test accounts.
- A finding that cannot be fixed is **documented here and labelled** in the
  product, never hidden behind a rebrand.
