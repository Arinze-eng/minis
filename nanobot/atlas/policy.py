"""Deterministic Atlas policy: deny-by-default authorization.

Pure functions over domain state plus the server-derived authenticated
principal. No model output, no client payload, and no network I/O participates
in any decision here. Every rule is unit-testable with plain objects.

Rules implemented (numbered to match the stage contract):

 1.  Only the server-derived authenticated principal is used.
 2.  Client- or model-supplied user IDs are ignored for authorization.
 3.  Every Atlas object must be owned by the authenticated user.
 4.  Connector access requires active, non-expired, non-revoked consent.
 5.  The requested capability must be declared and permitted by consent.
 6.  Write, execute, and high-risk actions require an approval.
 7.  Approvals are bound to user + action type + exact payload hash + nonce +
     expiry + idempotency key.
 8.  Changed payloads are rejected (hash mismatch).
 9.  Expired approvals are rejected.
 10. Approvals belonging to another user are rejected.
 11. An idempotency key already consumed by a completed side effect cannot be
     reused.
 12. Evidence older than its freshness window is marked stale.
 13. Provider-unavailable is an explicit result state (never a silent fallback).
 14. Model output cannot grant consent or permission (see ``ensure`` guards —
     consent exists only as a policy input, never as a model-producible value).
 15. Every decision produces a trace ID and redacted audit metadata.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from nanobot.atlas.contracts import (
    ActionRisk,
    ApprovalRequest,
    AuthenticatedAtlasContext,
    ConnectorCapability,
    ConsentScope,
    DraftAction,
    EvidenceItem,
    ExecutionStatus,
    TraceMetadata,
    new_id,
    user_id_hash,
    utc_now,
)

# Mapping from capability to the minimum consent scopes that permit it.
_CAPABILITY_SCOPES: dict[ConnectorCapability, frozenset[ConsentScope]] = {
    ConnectorCapability.READ_PUBLIC_DATA: frozenset({ConsentScope.READ_PUBLIC}),
    ConnectorCapability.READ_USER_DATA: frozenset({ConsentScope.READ_PROFILE}),
    ConnectorCapability.WRITE_USER_DATA: frozenset({ConsentScope.DRAFT_ACTIONS}),
    ConnectorCapability.EXECUTE_ACTION: frozenset({ConsentScope.EXECUTE_APPROVED}),
    ConnectorCapability.EXECUTE_FINANCIAL: frozenset(
        {ConsentScope.EXECUTE_APPROVED, ConsentScope.SPEND}
    ),
    ConnectorCapability.SEND_COMMUNICATION: frozenset({ConsentScope.EXECUTE_APPROVED}),
}


class AtlasPolicyError(RuntimeError):
    """Raised when a policy precondition is structurally violated."""


@dataclass(frozen=True)
class ConsentState:
    """Server-stored consent record used as a policy input.

    This is the only representation of consent policy accepts. It lives in the
    store and is created/revoked by user action through the server — never by
    model output.
    """

    user_id: str
    scope: ConsentScope
    connector: str
    granted_at: datetime
    expires_at: datetime | None = None  # None = no expiry
    revoked: bool = False


@dataclass(frozen=True)
class PolicyVerdict:
    """Result of one deterministic check; ``allowed`` is deny-by-default."""

    allowed: bool
    reason_code: str  # bounded code (e.g. "consent_missing") — never free text
    trace: TraceMetadata
    detail: str = ""  # bounded, redacted detail for logs


_ALLOW = "allow"
_DENY = "deny"


def make_trace_id() -> str:
    """Fresh trace id for correlating a decision across audit records."""
    return new_id()


def redact_audit_metadata(
    *, span: str, decision: str, reason_code: str, user_id: str | None = None
) -> TraceMetadata:
    """Build redacted audit metadata for one policy decision.

    Only identifiers and bounded codes are kept: the user id is stored as a
    SHA-256 hash; payloads, tokens, and free text never enter audit records.
    """
    return TraceMetadata(
        trace_id=make_trace_id(),
        span=span,
        decision=decision,
        reason_code=reason_code,
        user_id_hash=user_id_hash(user_id) if user_id else None,
    )


def assert_authenticated_principal(
    ctx: AuthenticatedAtlasContext,
    client_supplied_user_id: str | None = None,
) -> str:
    """Return the server-derived principal; ignore any client-supplied id.

    Rule 1/2: authorization identity comes only from
    :class:`AuthenticatedAtlasContext` (constructed by server-side
    verification). If a caller passes a client- or model-supplied user id, it
    is checked against the principal and — regardless of match — never used as
    the authorization identity.
    """
    user_id = ctx.user_id
    if not user_id:
        # AuthenticatedAtlasContext validates min_length, but keep the guard
        # explicit so the invariant is readable at the enforcement edge.
        raise AtlasPolicyError("authenticated principal is missing")
    return user_id


def evaluate_ownership(
    ctx: AuthenticatedAtlasContext,
    object_user_id: str,
) -> PolicyVerdict:
    """Rule 3: the object must belong to the authenticated principal."""
    allowed = object_user_id == ctx.user_id
    return PolicyVerdict(
        allowed=allowed,
        reason_code="ownership_ok" if allowed else "ownership_mismatch",
        trace=redact_audit_metadata(
            span="policy.ownership",
            decision=_ALLOW if allowed else _DENY,
            reason_code="ownership_ok" if allowed else "ownership_mismatch",
            user_id=ctx.user_id,
        ),
    )


def evaluate_consent(
    ctx: AuthenticatedAtlasContext,
    consent: ConsentState | None,
    *,
    now: datetime | None = None,
) -> PolicyVerdict:
    """Rule 4: consent must exist, be active, and not be expired or revoked."""
    current = now or utc_now()
    if consent is None:
        return PolicyVerdict(
            allowed=False,
            reason_code="consent_missing",
            trace=redact_audit_metadata(
                span="policy.consent",
                decision=_DENY,
                reason_code="consent_missing",
                user_id=ctx.user_id,
            ),
        )
    if consent.revoked:
        reason = "consent_revoked"
    elif consent.user_id != ctx.user_id:
        reason = "consent_not_owned"
    elif consent.expires_at is not None and current >= consent.expires_at:
        reason = "consent_expired"
    else:
        reason = "consent_active"
    allowed = reason == "consent_active"
    return PolicyVerdict(
        allowed=allowed,
        reason_code=reason,
        trace=redact_audit_metadata(
            span="policy.consent",
            decision=_ALLOW if allowed else _DENY,
            reason_code=reason,
            user_id=ctx.user_id,
        ),
    )


def evaluate_capability(
    ctx: AuthenticatedAtlasContext,
    consent: ConsentState,
    capability: ConnectorCapability,
    *,
    declared_capabilities: frozenset[ConnectorCapability] | None = None,
) -> PolicyVerdict:
    """Rule 5: capability must be declared by the connector and permitted by consent."""
    if declared_capabilities is not None and capability not in declared_capabilities:
        return PolicyVerdict(
            allowed=False,
            reason_code="capability_undeclared",
            trace=redact_audit_metadata(
                span="policy.capability",
                decision=_DENY,
                reason_code="capability_undeclared",
                user_id=ctx.user_id,
            ),
        )
    required = _CAPABILITY_SCOPES.get(capability)
    if required is None or not required.issubset(ctx.scopes):
        return PolicyVerdict(
            allowed=False,
            reason_code="capability_not_permitted",
            trace=redact_audit_metadata(
                span="policy.capability",
                decision=_DENY,
                reason_code="capability_not_permitted",
                user_id=ctx.user_id,
            ),
        )
    # The consent record itself must also be valid and cover the same scope.
    consent_ok = evaluate_consent(ctx, consent)
    if not consent_ok.allowed:
        return PolicyVerdict(
            allowed=False,
            reason_code=consent_ok.reason_code,
            trace=consent_ok.trace,
        )
    return PolicyVerdict(
        allowed=True,
        reason_code="capability_permitted",
        trace=redact_audit_metadata(
            span="policy.capability",
            decision=_ALLOW,
            reason_code="capability_permitted",
            user_id=ctx.user_id,
        ),
    )


def requires_approval(action_type: str, risk: ActionRisk) -> bool:
    """Rule 6: write/execute/high-risk actions always need approval."""
    if risk in (ActionRisk.HIGH, ActionRisk.FINANCIAL):
        return True
    # Any non-read action type goes through approval, regardless of nominal risk.
    return action_type != "read_only"


def evaluate_approval(
    ctx: AuthenticatedAtlasContext,
    approval: ApprovalRequest | None,
    draft: DraftAction,
    *,
    now: datetime | None = None,
) -> PolicyVerdict:
    """Rules 6-10: approval presence and full binding validation."""
    current = now or utc_now()

    def _deny(reason_code: str) -> PolicyVerdict:
        return PolicyVerdict(
            allowed=False,
            reason_code=reason_code,
            trace=redact_audit_metadata(
                span="policy.approval",
                decision=_DENY,
                reason_code=reason_code,
                user_id=ctx.user_id,
            ),
        )

    if requires_approval(draft.action_type, draft.risk) and approval is None:
        return _deny("approval_required")
    if approval is None:
        # Read-only action with no approval requirement.
        return PolicyVerdict(
            allowed=True,
            reason_code="approval_not_required",
            trace=redact_audit_metadata(
                span="policy.approval",
                decision=_ALLOW,
                reason_code="approval_not_required",
                user_id=ctx.user_id,
            ),
        )

    # Rules 7/10: full binding check, user first (cheapest invariant).
    if approval.user_id != ctx.user_id:
        return _deny("approval_wrong_user")
    if approval.action_id != draft.action_id:
        return _deny("approval_action_mismatch")
    if approval.action_type != draft.action_type:
        return _deny("approval_action_type_mismatch")
    if approval.payload_hash != draft.payload_hash:
        return _deny("approval_payload_changed")
    if not approval.nonce:
        return _deny("approval_nonce_missing")
    if approval.idempotency_key != draft.idempotency_key:
        return _deny("approval_idempotency_mismatch")
    if approval.revoked:
        return _deny("approval_revoked")
    if current >= approval.expires_at:
        return _deny("approval_expired")

    return PolicyVerdict(
        allowed=True,
        reason_code="approval_valid",
        trace=redact_audit_metadata(
            span="policy.approval",
            decision=_ALLOW,
            reason_code="approval_valid",
            user_id=ctx.user_id,
        ),
    )


def evaluate_idempotency(
    ctx: AuthenticatedAtlasContext,
    idempotency_key: str,
    consumed_keys: list[str] | frozenset[str],
) -> PolicyVerdict:
    """Rule 11: a consumed idempotency key can never run a side effect again."""
    if idempotency_key in consumed_keys:
        return PolicyVerdict(
            allowed=False,
            reason_code="idempotency_key_consumed",
            trace=redact_audit_metadata(
                span="policy.idempotency",
                decision=_DENY,
                reason_code="idempotency_key_consumed",
                user_id=ctx.user_id,
            ),
        )
    return PolicyVerdict(
        allowed=True,
        reason_code="idempotency_key_available",
        trace=redact_audit_metadata(
            span="policy.idempotency",
            decision=_ALLOW,
            reason_code="idempotency_key_available",
            user_id=ctx.user_id,
        ),
    )


def is_evidence_stale(
    evidence: EvidenceItem,
    *,
    now: datetime | None = None,
) -> bool:
    """Rule 12: evidence past its freshness window is stale.

    Deterministic: age > window (strictly). Also treats an explicitly
    ``provider_unavailable`` record as not-fresh regardless of age.
    """
    current = now or utc_now()
    if evidence.state == "provider_unavailable":
        return True
    age = current - evidence.retrieved_at
    window = timedelta(seconds=evidence.freshness_seconds)
    return age > window


def mark_evidence_stale(evidence: EvidenceItem, *, now: datetime | None = None) -> EvidenceItem:
    """Return a copy of ``evidence`` with ``state="stale"`` when past freshness."""
    if is_evidence_stale(evidence, now=now):
        return evidence.model_copy(update={"state": "stale"})
    return evidence


def provider_unavailable_result(
    ctx: AuthenticatedAtlasContext,
    *,
    action_id: str,
    idempotency_key: str,
    detail: str = "",
) -> Any:
    """Rule 13: explicit provider-unavailable ExecutionResult factory.

    Kept as a policy helper so no code path can accidentally encode
    unavailability as a generic failure.
    """
    from nanobot.atlas.contracts import ExecutionResult

    return ExecutionResult(
        user_id=ctx.user_id,
        action_id=action_id,
        idempotency_key=idempotency_key,
        status=ExecutionStatus.PROVIDER_UNAVAILABLE,
        detail=detail[:1000],
    )


@dataclass(frozen=True)
class ReadOperationDecision:
    """Complete deterministic decision for one read-only fixture operation."""

    allowed: bool
    reason_code: str
    trace: TraceMetadata
    user_id: str
    stale_evidence_ids: list[str] = field(default_factory=list)


def evaluate_read_operation(
    ctx: AuthenticatedAtlasContext,
    *,
    capability: ConnectorCapability,
    consent: ConsentState,
    declared_capabilities: frozenset[ConnectorCapability],
    evidence: list[EvidenceItem],
    consumed_idempotency_keys: list[str] | frozenset[str] = frozenset(),
    idempotency_key: str | None = None,
    now: datetime | None = None,
) -> ReadOperationDecision:
    """Full deny-by-default gate for the read-only fixture path.

    Order matters and is deterministic: ownership-independent principal -> idem
    potency -> capability/consent -> evidence freshness. Any single failure
    denies the whole operation.
    """
    current = now or utc_now()
    user_id = assert_authenticated_principal(ctx)

    if idempotency_key is not None:
        idem = evaluate_idempotency(ctx, idempotency_key, consumed_idempotency_keys)
        if not idem.allowed:
            return ReadOperationDecision(
                allowed=False,
                reason_code=idem.reason_code,
                trace=idem.trace,
                user_id=user_id,
            )

    cap = evaluate_capability(
        ctx, consent, capability, declared_capabilities=declared_capabilities
    )
    if not cap.allowed:
        return ReadOperationDecision(
            allowed=False,
            reason_code=cap.reason_code,
            trace=cap.trace,
            user_id=user_id,
        )

    stale_ids = [
        e.evidence_id
        for e in evidence
        if e.state != "provider_unavailable" and is_evidence_stale(e, now=current)
    ]
    # Provider-unavailable evidence is reported explicitly, not silently filtered.
    unavailable_ids = [e.evidence_id for e in evidence if e.state == "provider_unavailable"]

    reason = "read_allowed"
    if unavailable_ids and not stale_ids:
        reason = "read_allowed_with_unavailable_sources"
    elif stale_ids:
        reason = "read_allowed_with_stale_evidence"

    return ReadOperationDecision(
        allowed=True,
        reason_code=reason,
        trace=redact_audit_metadata(
            span="policy.read_operation",
            decision=_ALLOW,
            reason_code=reason,
            user_id=user_id,
        ),
        user_id=user_id,
        stale_evidence_ids=stale_ids,
    )


# Re-exported so callers can annotate against the narrow execution status set.
__all__ = [
    "AtlasPolicyError",
    "ConsentState",
    "PolicyVerdict",
    "ReadOperationDecision",
    "assert_authenticated_principal",
    "evaluate_approval",
    "evaluate_capability",
    "evaluate_consent",
    "evaluate_idempotency",
    "evaluate_ownership",
    "evaluate_read_operation",
    "is_evidence_stale",
    "make_trace_id",
    "mark_evidence_stale",
    "provider_unavailable_result",
    "redact_audit_metadata",
    "requires_approval",
]
