"""CI-safe tests for the outcome verification state machine (directive §2.8).

Covers: legal/illegal transitions, the never-verify-without-execution rule,
refreshed-evidence verification windows, provider-unavailable handling, and
user feedback states.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest

from nanobot.atlas.contracts import EvidenceItem, utc_now
from nanobot.atlas.outcome import (
    CaseEvent,
    CaseRecord,
    OutcomeState,
    is_terminal,
    transition,
    verify_with_evidence,
)

USER = "user-outcome"


def new_case(**updates: Any) -> CaseRecord:
    return CaseRecord(user_id=USER, problem_id="p1", **updates)


def evidence(retrieved_offset_seconds: int, eid: str = "ev1") -> EvidenceItem:
    return EvidenceItem(
        source="plaid",
        content="refreshed provider state",
        retrieved_at=utc_now() + timedelta(seconds=retrieved_offset_seconds),
        evidence_id=eid,
    )


def drive(case: CaseRecord, *kinds: str) -> CaseRecord:
    for kind in kinds:
        case = transition(case, CaseEvent(kind=kind))  # type: ignore[arg-type]
    return case


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_full_happy_path_to_verified() -> None:
    case = drive(new_case(), "evidence_collected", "recommended", "approval_required",
                 "approved", "executed")
    assert case.state is OutcomeState.EXECUTED
    refreshed = [evidence(+30)]
    verified = verify_with_evidence(case, refreshed, attempted_at=utc_now())
    assert verified.state is OutcomeState.VERIFIED
    assert verified.evidence_ids == ["ev1"]


def test_history_is_recorded() -> None:
    case = drive(new_case(), "evidence_collected", "recommended")
    assert case.history == [OutcomeState.DETECTED, OutcomeState.EVIDENCE_COLLECTED]


# ---------------------------------------------------------------------------
# Illegal transitions
# ---------------------------------------------------------------------------


def test_detected_cannot_verify_directly() -> None:
    with pytest.raises(ValueError, match="illegal transition"):
        drive(new_case(), "verify")


def test_recommended_cannot_execute() -> None:
    case = drive(new_case(), "evidence_collected", "recommended")
    with pytest.raises(ValueError, match="illegal transition"):
        drive(case, "executed")


def test_attempted_is_never_verified_without_transition_gate() -> None:
    # From RECOMMENDED, 'verify' is not even a legal transition.
    case = drive(new_case(), "evidence_collected", "recommended")
    with pytest.raises(ValueError):
        transition(case, CaseEvent(kind="verify"))


def test_rejection_is_terminal_via_dismissal() -> None:
    case = drive(new_case(), "evidence_collected", "recommended", "approval_required",
                 "rejected")
    dismissed = transition(case, CaseEvent(kind="dismissed"))
    assert dismissed.state is OutcomeState.DISMISSED
    assert is_terminal(dismissed) is True
    with pytest.raises(ValueError):
        transition(dismissed, CaseEvent(kind="evidence_collected"))


def test_stale_can_refresh_back_to_evidence() -> None:
    case = drive(new_case(), "evidence_collected", "recommended", "stale")
    assert case.state is OutcomeState.STALE
    refreshed = drive(case, "evidence_collected")
    assert refreshed.state is OutcomeState.EVIDENCE_COLLECTED


# ---------------------------------------------------------------------------
# Verification rules
# ---------------------------------------------------------------------------


def test_no_refreshed_evidence_is_provider_unavailable() -> None:
    case = drive(new_case(), "evidence_collected", "recommended", "approval_required",
                 "approved", "executed")
    result = verify_with_evidence(case, [], attempted_at=utc_now())
    assert result.state is OutcomeState.PROVIDER_UNAVAILABLE


def test_pre_attempt_evidence_cannot_verify() -> None:
    case = drive(new_case(), "evidence_collected", "recommended", "approval_required",
                 "approved", "executed")
    stale_only = [evidence(-600)]  # observed before the attempt
    result = verify_with_evidence(case, stale_only, attempted_at=utc_now())
    assert result.state is OutcomeState.OUTCOME_UNVERIFIED
    # Bounded re-verification later succeeds with fresh evidence.
    later = verify_with_evidence(
        result, [evidence(+60, "ev2")], attempted_at=utc_now()
    )
    assert later.state is OutcomeState.VERIFIED


def test_partially_executed_can_verify() -> None:
    case = drive(new_case(), "evidence_collected", "recommended", "approval_required",
                 "approved", "partially_executed")
    result = verify_with_evidence(case, [evidence(+10)], attempted_at=utc_now())
    assert result.state is OutcomeState.VERIFIED


# ---------------------------------------------------------------------------
# User feedback states
# ---------------------------------------------------------------------------


def test_user_correction_and_snooze_paths() -> None:
    case = drive(new_case(), "evidence_collected", "recommended", "user_corrected")
    assert case.state is OutcomeState.USER_CORRECTED
    back = drive(case, "evidence_collected")
    assert back.state is OutcomeState.EVIDENCE_COLLECTED
    snoozed = drive(new_case(), "snoozed")
    assert snoozed.state is OutcomeState.SNOOZED
    assert drive(snoozed, "dismissed").state is OutcomeState.DISMISSED


def test_verified_can_go_stale_on_later_evidence() -> None:
    case = drive(new_case(), "evidence_collected", "recommended", "approval_required",
                 "approved", "executed")
    verified = verify_with_evidence(case, [evidence(+30)], attempted_at=utc_now())
    staled = transition(verified, CaseEvent(kind="stale"))
    assert staled.state is OutcomeState.STALE
