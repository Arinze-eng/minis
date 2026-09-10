"""Atlas: bounded domain contracts, deterministic policy, and persistence.

Atlas is an orchestration layer on top of the existing nanobot agent loop.
Contracts stay Strands-agnostic so the orchestration stage can adopt the AWS
Strands Agents SDK without breaking these domain types.

Security model (see ``policy.py``):
- authorization uses only the server-derived authenticated principal;
- client- or model-supplied user IDs are never trusted;
- every decision is deny-by-default and deterministic.

Connectors (see ``connectors/``): typed interfaces for real providers
(SerpApi, Google Tasks, Gmail compose, Plaid read-only, Telegram delivery).
Fixture implementations are permitted only for unit tests, offline
development, deterministic failure testing, and provider-unavailable fallback
— never as the primary product experience.
"""

from nanobot.atlas.contracts import (
    ApprovalDelivery,
    ApprovalRequest,
    AuthenticatedAtlasContext,
    ConnectorCapability,
    ConnectorErrorInfo,
    ConnectorResult,
    ConnectorStatus,
    ConsentScope,
    DraftAction,
    DripAdviceItem,
    EvidenceItem,
    ExecutionResult,
    NormalizedProblem,
    ProductOffering,
    ProviderRef,
    Recommendation,
    TaskItem,
    TransactionItem,
    VerifiedOutcome,
)
from nanobot.atlas.policy import (
    AtlasPolicyError,
    ConsentState,
    PolicyVerdict,
    evaluate_approval,
    evaluate_capability,
    evaluate_consent,
    evaluate_idempotency,
    evaluate_ownership,
    evaluate_read_operation,
    is_evidence_stale,
    make_trace_id,
    mark_evidence_stale,
    provider_unavailable_result,
    redact_audit_metadata,
)
from nanobot.atlas.store import AtlasStore, LocalAtlasStore

__all__ = [
    "ApprovalDelivery",
    "ApprovalRequest",
    "AtlasPolicyError",
    "AtlasStore",
    "AuthenticatedAtlasContext",
    "ConsentState",
    "ConnectorCapability",
    "ConnectorErrorInfo",
    "ConnectorResult",
    "ConnectorStatus",
    "ConsentScope",
    "DraftAction",
    "DripAdviceItem",
    "EvidenceItem",
    "ExecutionResult",
    "LocalAtlasStore",
    "NormalizedProblem",
    "PolicyVerdict",
    "ProductOffering",
    "ProviderRef",
    "Recommendation",
    "TaskItem",
    "TransactionItem",
    "VerifiedOutcome",
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
]
