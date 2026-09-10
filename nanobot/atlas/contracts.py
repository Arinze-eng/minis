"""Atlas domain contracts.

Typed, serializable domain objects shared by the future Atlas orchestration
layer, the deterministic policy layer, and the provisional local store. These
models are intentionally Strands-agnostic: no AWS Strands types appear here, so
the orchestration stage can adopt Strands behind these contracts.

Conventions follow the repository's existing patterns:
- Pydantic models on ``nanobot.config_base.Base`` (camelCase aliases accepted,
  ``populate_by_name=True``) — same as tool configs and channel configs;
- stable IDs are ``uuid4().hex`` strings generated client-side at creation;
- timestamps are timezone-aware ``datetime`` values in UTC;
- payload hashing is SHA-256 over a canonical JSON dump of the action payload;
- "safe serialization" means ``model_dump(mode="json")`` with
  ``exclude_none=True`` so records round-trip through JSONL/JSON stores.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta
from enum import Enum
from typing import Any, Literal

from pydantic import Field, model_validator

from nanobot.config_base import Base

# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class ConsentScope(str, Enum):
    """What a user has allowed Atlas to do on their behalf.

    Values are ordered from least to most powerful for readability only;
    policy checks membership, never ordering.
    """

    READ_PUBLIC = "read_public"  # read public/market/reference data
    READ_PROFILE = "read_profile"  # read the user's own profile-scoped data
    SUGGEST_ONLY = "suggest_only"  # produce recommendations, never act
    DRAFT_ACTIONS = "draft_actions"  # prepare draft actions for approval
    EXECUTE_APPROVED = "execute_approved"  # execute previously approved actions
    SPEND = "spend"  # money-moving capability; requires EXECUTE_APPROVED too


class ConnectorCapability(str, Enum):
    """Classification of what a connector (current or future) can do.

    Capabilities are declared by connector definitions and checked against the
    consent scope the user granted. Atlas never infers capabilities from model
    output.
    """

    READ_PUBLIC_DATA = "read_public_data"
    READ_USER_DATA = "read_user_data"
    WRITE_USER_DATA = "write_user_data"
    EXECUTE_ACTION = "execute_action"
    EXECUTE_FINANCIAL = "execute_financial"
    SEND_COMMUNICATION = "send_communication"


class ActionRisk(str, Enum):
    """Risk class of a drafted action; drives the approval requirement."""

    READ_ONLY = "read_only"
    LOW = "low"
    HIGH = "high"
    FINANCIAL = "financial"


# ---------------------------------------------------------------------------
# Small shared value objects
# ---------------------------------------------------------------------------


def new_id() -> str:
    """Stable, opaque identifier (uuid4 hex, 32 chars)."""
    return uuid.uuid4().hex


def utc_now() -> datetime:
    return datetime.now(UTC)


def payload_hash(payload: dict[str, Any]) -> str:
    """SHA-256 over a canonical JSON dump of ``payload``.

    Canonical form: sorted keys, compact separators, UTF-8, JSON-safe values.
    Any change to the payload — even reordering nested containers with
    different key order producing different values — yields a different hash.
    """
    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class TraceMetadata(Base):
    """Redacted audit metadata attached to every decision and result.

    Secrets, tokens, raw payloads, and free-text user content must never be
    placed here. Only identifiers, classifications, and bounded enums.
    """

    trace_id: str = Field(default_factory=new_id)
    span: str | None = None  # e.g. "policy.consent", "tool.atlas_read"
    decision: str | None = None  # e.g. "allow", "deny", "stale"
    reason_code: str | None = None  # bounded code, not free text
    user_id_hash: str | None = None  # SHA-256 of the user id, never the id itself
    created_at: datetime = Field(default_factory=utc_now)


def _user_id_hash(user_id: str) -> str:
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()


def user_id_hash(user_id: str) -> str:
    """Public helper: redact a user id for audit metadata."""
    return _user_id_hash(user_id)


# ---------------------------------------------------------------------------
# Authenticated context
# ---------------------------------------------------------------------------


class AuthenticatedAtlasContext(Base):
    """Server-derived identity and consent context for one Atlas request.

    Constructed only from server-side verification paths (Supabase token
    verification, channel-side sender identity linkage). A user id arriving
    from the client or from model output must never be placed here; see
    ``policy.assert_authenticated_principal``.
    """

    user_id: str = Field(min_length=1)  # server-verified principal
    auth_source: Literal["supabase_token", "channel_identity"] = "supabase_token"
    scopes: frozenset[ConsentScope] = Field(default_factory=frozenset)
    # Consent records are validated policy inputs (see ConsentState in policy.py);
    # the context carries only the resulting scope set plus a trace.
    trace: TraceMetadata = Field(default_factory=TraceMetadata)

    model_config = Base.model_config | {"frozen": True}


# ---------------------------------------------------------------------------
# Problem / evidence / recommendation pipeline
# ---------------------------------------------------------------------------


class NormalizedProblem(Base):
    """A user problem normalized into a bounded, auditable shape."""

    problem_id: str = Field(default_factory=new_id)
    user_id: str = Field(min_length=1)  # ownership: must equal principal
    domain: Literal["money", "tasks", "wardrobe", "drip", "general"]
    description: str = Field(min_length=1, max_length=2000)
    scenario: Literal["money_guard", "task_start", "wardrobe_research", "drip_advice"]
    created_at: datetime = Field(default_factory=utc_now)
    trace: TraceMetadata = Field(default_factory=TraceMetadata)


class EvidenceItem(Base):
    """A piece of evidence with provenance, freshness, and uncertainty.

    Real connectors normalize provider responses into this shape; fixtures may
    produce the same shape for tests/offline development/fallback only. The
    provider's own identifiers, URLs, and timestamps are preserved verbatim in
    ``provider_ref`` so a downstream consumer can always trace evidence back to
    the originating provider record.
    """

    evidence_id: str = Field(default_factory=new_id)
    source: str = Field(min_length=1, max_length=256)  # connector/provider name
    source_url: str | None = None
    # What kind of normalized payload this evidence carries.
    kind: Literal["text", "product", "task", "transaction", "weather", "file"] = "text"
    # Structured normalized payload for typed kinds (e.g. a ProductOffering or
    # TaskItem dump). Kept as a dict so EvidenceItem stays one stable wire shape.
    payload: dict[str, Any] | None = None
    retrieved_at: datetime = Field(default_factory=utc_now)
    freshness_seconds: int = Field(default=3600, ge=1)  # valid window after retrieval
    # 0.0 = certain, 1.0 = fully uncertain. Bounded so policy and UX can be
    # deterministic about uncertainty handling.
    uncertainty: float = Field(default=0.5, ge=0.0, le=1.0)
    content: str = Field(min_length=1, max_length=4000)
    # Explicit data-quality states; policy marks stale evidence rather than
    # dropping it, so the model sees *why* it is stale.
    state: Literal["fresh", "stale", "provider_unavailable"] = "fresh"
    trace: TraceMetadata = Field(default_factory=TraceMetadata)


class DraftAction(Base):
    """A drafted (not executed) action with a bound payload hash."""

    action_id: str = Field(default_factory=new_id)
    user_id: str = Field(min_length=1)
    action_type: str = Field(min_length=1, max_length=128)  # bounded verb, e.g. "send_reminder"
    risk: ActionRisk = ActionRisk.LOW
    capability: ConnectorCapability  # capability this action would need
    payload: dict[str, Any] = Field(default_factory=dict)
    payload_hash: str = Field(min_length=64, max_length=64)  # must equal hash(payload)
    idempotency_key: str = Field(min_length=8, max_length=256)
    created_at: datetime = Field(default_factory=utc_now)
    trace: TraceMetadata = Field(default_factory=TraceMetadata)

    @model_validator(mode="after")
    def _bind_payload_hash(self) -> DraftAction:
        expected = payload_hash(self.payload)
        if self.payload_hash != expected:
            raise ValueError("payloadHash does not match payload")
        return self


class Recommendation(Base):
    """A recommendation produced from evidence; suggestions never execute."""

    recommendation_id: str = Field(default_factory=new_id)
    user_id: str = Field(min_length=1)
    problem_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=256)
    rationale: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[str] = Field(default_factory=list)
    # Recommendation-level uncertainty: bounded mean of evidence uncertainty,
    # set by the orchestrator; policy does not recompute it.
    uncertainty: float = Field(default=0.5, ge=0.0, le=1.0)
    draft: DraftAction | None = None  # present only when an action is proposed
    created_at: datetime = Field(default_factory=utc_now)
    trace: TraceMetadata = Field(default_factory=TraceMetadata)


# ---------------------------------------------------------------------------
# Approval / execution / verification
# ---------------------------------------------------------------------------


class ApprovalRequest(Base):
    """A user approval bound to one exact action payload.

    Binding dimensions (all enforced by policy): authenticated user, action
    type, exact payload hash, nonce, expiry, idempotency key. Any change to
    any of them invalidates the approval.
    """

    approval_id: str = Field(default_factory=new_id)
    user_id: str = Field(min_length=1)
    action_id: str = Field(min_length=1)
    action_type: str = Field(min_length=1, max_length=128)
    payload_hash: str = Field(min_length=64, max_length=64)
    nonce: str = Field(min_length=8, max_length=128)  # one-time value bound at approval
    idempotency_key: str = Field(min_length=8, max_length=256)
    granted_scopes: frozenset[ConsentScope] = Field(default_factory=frozenset)
    expires_at: datetime  # explicit expiry is mandatory for approvals
    revoked: bool = False
    created_at: datetime = Field(default_factory=utc_now)

    @classmethod
    def from_draft(
        cls,
        draft: DraftAction,
        *,
        user_id: str,
        ttl: timedelta = timedelta(minutes=15),
        scopes: frozenset[ConsentScope] | None = None,
    ) -> ApprovalRequest:
        """Create an approval bound to a draft (server-side construction path)."""
        return cls(
            user_id=user_id,
            action_id=draft.action_id,
            action_type=draft.action_type,
            payload_hash=draft.payload_hash,
            nonce=new_id(),
            idempotency_key=draft.idempotency_key,
            granted_scopes=scopes or frozenset(),
            expires_at=utc_now() + ttl,
        )


class ExecutionStatus(str, Enum):
    """Explicit terminal states for execution attempts."""

    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DENIED = "denied"
    PROVIDER_UNAVAILABLE = "provider_unavailable"  # explicit, never silently retried


class ExecutionResult(Base):
    """Outcome of one execution attempt (or denial)."""

    execution_id: str = Field(default_factory=new_id)
    user_id: str = Field(min_length=1)
    action_id: str = Field(min_length=1)
    idempotency_key: str = Field(min_length=8, max_length=256)
    status: ExecutionStatus
    # Bounded detail: enums/codes only, never raw payloads or secrets.
    detail: str = Field(default="", max_length=1000)
    completed_at: datetime = Field(default_factory=utc_now)
    trace: TraceMetadata = Field(default_factory=TraceMetadata)


class VerifiedOutcome(Base):
    """Post-execution verification record for the side-effect ledger.

    ``consumed_idempotency_keys`` is the authoritative record policy consults
    to reject duplicate use of an idempotency key for a completed side effect.
    """

    outcome_id: str = Field(default_factory=new_id)
    user_id: str = Field(min_length=1)
    action_id: str = Field(min_length=1)
    idempotency_key: str = Field(min_length=8, max_length=256)
    status: ExecutionStatus
    verified: bool = False  # did post-execution verification pass?
    consumed_idempotency_keys: list[str] = Field(default_factory=list)
    completed_at: datetime = Field(default_factory=utc_now)
    trace: TraceMetadata = Field(default_factory=TraceMetadata)


class DripAdviceItem(Base):
    """Cross-domain advice item (drip scenario): resolves across domains."""

    item_id: str = Field(default_factory=new_id)
    user_id: str = Field(min_length=1)
    headline: str = Field(min_length=1, max_length=256)
    body: str = Field(min_length=1, max_length=2000)
    domains: list[Literal["money", "tasks", "wardrobe", "drip", "general"]] = Field(
        default_factory=list
    )
    evidence_ids: list[str] = Field(default_factory=list)
    uncertainty: float = Field(default=0.5, ge=0.0, le=1.0)
    created_at: datetime = Field(default_factory=utc_now)
    trace: TraceMetadata = Field(default_factory=TraceMetadata)


# ---------------------------------------------------------------------------
# Real-connector contracts
#
# These types exist so real adapters (SerpApi, Google Tasks, Telegram delivery,
# Plaid read-only, Gmail compose) normalize their responses into Atlas shapes
# and preserve provider identity. Fixtures may emit the same types for tests,
# offline development, deterministic failure testing, and provider-unavailable
# fallback only — never as the primary product experience.
# ---------------------------------------------------------------------------


class ConnectorStatus(str, Enum):
    """Explicit taxonomy of connector call outcomes.

    Distinguishing these states is a contract requirement: callers (policy,
    orchestrator, UI) must be able to react differently to an expired OAuth
    grant versus a rate limit versus malformed provider data, and nothing may
    collapse them into a generic failure.
    """

    OK = "ok"
    NOT_CONFIGURED = "not_configured"  # missing env var / flag disabled
    UNAUTHORIZED = "unauthorized"  # credentials rejected (bad key / forbidden)
    OAUTH_EXPIRED = "oauth_expired"  # grant expired; refresh/re-consent needed
    RATE_LIMITED = "rate_limited"  # provider quota; retry_after_seconds may be set
    UNAVAILABLE = "unavailable"  # network/5xx/timeout; provider unreachable
    STALE = "stale"  # data returned is past its freshness window
    MALFORMED = "malformed"  # response failed normalization/schema validation
    PROVIDER_ERROR = "provider_error"  # well-formed provider-side error (4xx other)


class ConnectorErrorInfo(Base):
    """Redacted, bounded error detail for a failed connector call.

    Never contains credentials, raw provider payloads, or free-text user
    content — only codes, HTTP status, and bounded retry hints.
    """

    status: ConnectorStatus
    http_status: int | None = None
    provider_code: str | None = None  # provider's own error code, bounded
    message: str = Field(default="", max_length=500)  # bounded, redacted
    retry_after_seconds: int | None = Field(default=None, ge=0)
    occurred_at: datetime = Field(default_factory=utc_now)
    trace: TraceMetadata = Field(default_factory=TraceMetadata)


class ProviderRef(Base):
    """Verbatim reference to the provider record behind normalized data.

    ``provider_id`` and ``url`` are preserved exactly as the provider returned
    them so Atlas records remain linkable to provider state (e.g. a Google
    Task ID or a product listing URL).
    """

    provider: str = Field(min_length=1, max_length=64)  # e.g. "serpapi", "google_tasks"
    provider_id: str = Field(min_length=1, max_length=512)
    url: str | None = Field(default=None, max_length=2048)
    # Provider-side timestamps preserved verbatim (ISO strings) alongside the
    # Atlas-side retrieval time recorded on the evidence item.
    provider_timestamp: str | None = None


class ProductOffering(Base):
    """Normalized real product/listing result (shopping research, read-only)."""

    offering_id: str = Field(default_factory=new_id)
    user_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=512)
    price: str | None = None  # provider-formatted price (e.g. "$129.99")
    price_value: float | None = Field(default=None, ge=0)  # numeric if parseable
    currency: str | None = Field(default=None, min_length=3, max_length=3)  # ISO 4217
    merchant: str | None = Field(default=None, max_length=256)
    rating: float | None = Field(default=None, ge=0, le=5)
    provider_ref: ProviderRef
    retrieved_at: datetime = Field(default_factory=utc_now)
    freshness_seconds: int = Field(default=1800, ge=1)
    trace: TraceMetadata = Field(default_factory=TraceMetadata)


class TaskItem(Base):
    """Normalized real task/deadline (Google Tasks et al.).

    ``provider_ref.provider_id`` is the provider's task ID and ``url`` its
    deep link; updates through the approval gate must address that same ID.
    """

    task_id: str = Field(default_factory=new_id)  # Atlas-side id
    user_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=512)
    notes: str | None = Field(default=None, max_length=4000)
    due_at: datetime | None = None
    completed: bool = False
    task_list_id: str | None = None  # provider tasklist id
    provider_ref: ProviderRef
    updated_at: datetime = Field(default_factory=utc_now)
    trace: TraceMetadata = Field(default_factory=TraceMetadata)


class TransactionItem(Base):
    """Normalized read-only financial transaction (Plaid Sandbox or approved
    read-only provider). Atlas never mutates financial accounts."""

    transaction_id: str = Field(default_factory=new_id)
    user_id: str = Field(min_length=1)
    # True when the data source is a sandbox/testing environment; the demo must
    # label sandbox data as such whenever production bank data is unavailable.
    is_sandbox: bool = True
    amount: float
    currency: str = Field(min_length=3, max_length=3, default="USD")
    merchant: str | None = Field(default=None, max_length=256)
    posted_at: datetime | None = None
    account_name: str | None = Field(default=None, max_length=128)  # display name only
    provider_ref: ProviderRef
    retrieved_at: datetime = Field(default_factory=utc_now)
    trace: TraceMetadata = Field(default_factory=TraceMetadata)


class ApprovalDelivery(Base):
    """Server-generated binding for delivering an approval request over a
    channel (e.g. Telegram), including callback binding for the user's
    approve/deny response.

    The callback token is stored hashed only; the raw token exists transiently
    in the delivery message and is verified server-side on callback.
    """

    delivery_id: str = Field(default_factory=new_id)
    approval_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)  # must equal approval.user_id (policy-checked)
    channel: Literal["telegram", "websocket", "webui"]
    chat_id: str | None = None  # channel delivery target (server-derived)
    # Binding dimensions echoed from the approval: callbacks must present these
    # exactly; policy re-validates them against the stored ApprovalRequest.
    action_type: str = Field(min_length=1, max_length=128)
    payload_hash: str = Field(min_length=64, max_length=64)
    nonce: str = Field(min_length=8, max_length=128)
    expires_at: datetime
    callback_token_hash: str | None = None  # SHA-256 of the one-time callback token
    delivered_at: datetime | None = None
    response: Literal["pending", "approved", "denied", "expired", "failed"] = "pending"
    trace: TraceMetadata = Field(default_factory=TraceMetadata)


class ConnectorResult(Base):
    """Typed outcome of one connector call.

    ``status`` uses the explicit taxonomy so failures are distinguishable and
    observable; a connector never raises past its boundary for expected
    provider conditions — it returns the corresponding status instead.
    """

    connector: str = Field(min_length=1, max_length=64)
    status: ConnectorStatus
    items: list[EvidenceItem] = Field(default_factory=list)
    error: ConnectorErrorInfo | None = None
    # Rate-limit / retry hints surfaced to the orchestrator.
    retry_after_seconds: int | None = Field(default=None, ge=0)
    completed_at: datetime = Field(default_factory=utc_now)
    trace: TraceMetadata = Field(default_factory=TraceMetadata)

    @model_validator(mode="after")
    def _check_error_consistency(self) -> ConnectorResult:
        if self.status == ConnectorStatus.OK and self.error is not None:
            raise ValueError("ConnectorResult OK must not carry an error")
        if self.status != ConnectorStatus.OK and self.error is None:
            raise ValueError(f"ConnectorResult {self.status.value} requires error info")
        return self
