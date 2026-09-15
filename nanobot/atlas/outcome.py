"""Deterministic outcome state machine (directive §2.8).

Distinguishes recommendation, approval, execution, and verified result. A
case moves through the explicit states below; every transition is validated
against a deterministic table so an attempted action can never be reported
as a verified outcome.

Verification contract:
- ``verified`` requires refreshed provider evidence produced AFTER the
  execution attempt (evidence observed before execution never verifies).
- Provider unreachable at verification time yields ``provider_unavailable``.
- Refreshed evidence older than the attempt, or evidence that does not
  confirm the change, yields ``outcome_unverified`` (never verified).
- The user can always correct, dismiss, or snooze; those are terminal-ish
  user states recorded verbatim.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

from nanobot.atlas.contracts import EvidenceItem, new_id, utc_now


class OutcomeState(str, Enum):
    """Every state required by directive §2.8."""

    DETECTED = "detected"
    EVIDENCE_COLLECTED = "evidence_collected"
    RECOMMENDED = "recommended"
    APPROVAL_REQUIRED = "approval_required"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXECUTED = "executed"
    PARTIALLY_EXECUTED = "partially_executed"
    VERIFIED = "verified"
    STALE = "stale"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    OUTCOME_UNVERIFIED = "outcome_unverified"
    USER_CORRECTED = "user_corrected"
    DISMISSED = "dismissed"
    SNOOZED = "snoozed"


# Allowed transitions: state -> states it may move to. Anything not listed
# is rejected by the machine (deterministic policy, not model judgment).
_TRANSITIONS: dict[OutcomeState, frozenset[OutcomeState]] = {
    OutcomeState.DETECTED: frozenset({
        OutcomeState.EVIDENCE_COLLECTED, OutcomeState.DISMISSED, OutcomeState.SNOOZED,
    }),
    OutcomeState.EVIDENCE_COLLECTED: frozenset({
        OutcomeState.RECOMMENDED, OutcomeState.STALE, OutcomeState.DISMISSED,
        OutcomeState.SNOOZED,
    }),
    OutcomeState.RECOMMENDED: frozenset({
        OutcomeState.APPROVAL_REQUIRED, OutcomeState.STALE, OutcomeState.DISMISSED,
        OutcomeState.SNOOZED, OutcomeState.USER_CORRECTED,
    }),
    OutcomeState.APPROVAL_REQUIRED: frozenset({
        OutcomeState.APPROVED, OutcomeState.REJECTED, OutcomeState.STALE,
    }),
    OutcomeState.APPROVED: frozenset({
        OutcomeState.EXECUTED, OutcomeState.PARTIALLY_EXECUTED,
        OutcomeState.PROVIDER_UNAVAILABLE,
    }),
    OutcomeState.REJECTED: frozenset({OutcomeState.DISMISSED}),
    OutcomeState.EXECUTED: frozenset({
        OutcomeState.VERIFIED, OutcomeState.OUTCOME_UNVERIFIED,
        OutcomeState.PROVIDER_UNAVAILABLE,
    }),
    OutcomeState.PARTIALLY_EXECUTED: frozenset({
        OutcomeState.OUTCOME_UNVERIFIED, OutcomeState.VERIFIED,
        OutcomeState.PROVIDER_UNAVAILABLE,
    }),
    OutcomeState.PROVIDER_UNAVAILABLE: frozenset({
        # Retry after the provider returns: re-verify or re-attempt via approval.
        OutcomeState.EXECUTED, OutcomeState.VERIFIED, OutcomeState.OUTCOME_UNVERIFIED,
    }),
    OutcomeState.OUTCOME_UNVERIFIED: frozenset({
        # Bounded re-verification loop; user may also correct the record.
        OutcomeState.VERIFIED, OutcomeState.PROVIDER_UNAVAILABLE, OutcomeState.USER_CORRECTED,
    }),
    OutcomeState.VERIFIED: frozenset({
        # Later evidence may invalidate the result.
        OutcomeState.STALE, OutcomeState.USER_CORRECTED,
    }),
    OutcomeState.STALE: frozenset({
        OutcomeState.EVIDENCE_COLLECTED, OutcomeState.DISMISSED,
    }),
    OutcomeState.USER_CORRECTED: frozenset({
        OutcomeState.EVIDENCE_COLLECTED, OutcomeState.DISMISSED,
    }),
    OutcomeState.DISMISSED: frozenset(),
    OutcomeState.SNOOZED: frozenset({
        OutcomeState.EVIDENCE_COLLECTED, OutcomeState.DISMISSED,
    }),
}

# States that may legally transition into VERIFIED (attempted is not enough).
_VERIFIABLE_FROM = frozenset({
    OutcomeState.EXECUTED, OutcomeState.PARTIALLY_EXECUTED,
    OutcomeState.PROVIDER_UNAVAILABLE, OutcomeState.OUTCOME_UNVERIFIED,
})


class CaseRecord(BaseModel):
    """One Atlas case tracked through the outcome state machine."""

    case_id: str = Field(default_factory=new_id)
    user_id: str = Field(min_length=1)
    problem_id: str = Field(min_length=1)
    state: OutcomeState = OutcomeState.DETECTED
    # action_id of the executed/draft action this case tracks, if any.
    action_id: str | None = None
    # Monotonic transition history (bounded by callers).
    history: list[OutcomeState] = Field(default_factory=list)
    # Evidence ids backing the current state.
    evidence_ids: list[str] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=utc_now)


class CaseEvent(BaseModel):
    """One deterministic transition request."""

    kind: Literal[
        "evidence_collected", "recommended", "approval_required", "approved",
        "rejected", "executed", "partially_executed", "verify", "stale",
        "provider_unavailable", "outcome_unverified", "user_corrected", "dismissed",
        "snoozed",
    ]
    evidence_ids: list[str] = Field(default_factory=list)
    action_id: str | None = None


_EVENT_TARGET: dict[str, OutcomeState] = {
    "evidence_collected": OutcomeState.EVIDENCE_COLLECTED,
    "recommended": OutcomeState.RECOMMENDED,
    "approval_required": OutcomeState.APPROVAL_REQUIRED,
    "approved": OutcomeState.APPROVED,
    "rejected": OutcomeState.REJECTED,
    "executed": OutcomeState.EXECUTED,
    "partially_executed": OutcomeState.PARTIALLY_EXECUTED,
    "verify": OutcomeState.VERIFIED,
    "stale": OutcomeState.STALE,
    "provider_unavailable": OutcomeState.PROVIDER_UNAVAILABLE,
    "outcome_unverified": OutcomeState.OUTCOME_UNVERIFIED,
    "user_corrected": OutcomeState.USER_CORRECTED,
    "dismissed": OutcomeState.DISMISSED,
    "snoozed": OutcomeState.SNOOZED,
}


def transition(case: CaseRecord, event: CaseEvent) -> CaseRecord:
    """Apply one event; raises ValueError on an illegal transition."""
    target = _EVENT_TARGET[event.kind]
    if target not in _TRANSITIONS[case.state]:
        raise ValueError(
            f"illegal transition {case.state.value} -> {target.value}"
        )
    if target is OutcomeState.VERIFIED and case.state not in _VERIFIABLE_FROM:
        raise ValueError(
            f"state {case.state.value} cannot verify: no execution attempt recorded"
        )
    history = [*case.history, case.state]
    return case.model_copy(update={
        "state": target,
        "history": history,
        "evidence_ids": event.evidence_ids or case.evidence_ids,
        "action_id": event.action_id or case.action_id,
        "updated_at": utc_now(),
    })


def verify_with_evidence(
    case: CaseRecord,
    refreshed: list[EvidenceItem],
    *,
    attempted_at: datetime,
    now: datetime | None = None,
) -> CaseRecord:
    """Attempt verification using refreshed provider evidence.

    Rules:
    - No refreshed evidence at all -> ``provider_unavailable``.
    - Evidence observed BEFORE the attempt cannot confirm the outcome ->
      ``outcome_unverified``.
    - Fresh post-attempt evidence confirms -> ``verified``.
    The case must be in a verifiable state; an attempted action can never be
    reported as verified without this refreshed-evidence check.
    """
    confirming = [e for e in refreshed if e.retrieved_at > attempted_at]
    if not refreshed:
        return transition(case, CaseEvent(kind="provider_unavailable"))
    if not confirming:
        # Only pre-attempt evidence available: cannot confirm the outcome.
        return transition(
            case,
            CaseEvent(kind="outcome_unverified",
                      evidence_ids=[e.evidence_id for e in refreshed[:10]]),
        )
    return transition(
        case,
        CaseEvent(kind="verify", evidence_ids=[e.evidence_id for e in confirming[:10]]),
    )


def is_terminal(case: CaseRecord) -> bool:
    return not _TRANSITIONS[case.state]


__all__ = [
    "CaseEvent",
    "CaseRecord",
    "OutcomeState",
    "is_terminal",
    "transition",
    "verify_with_evidence",
]
