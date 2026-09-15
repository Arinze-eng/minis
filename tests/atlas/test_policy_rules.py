"""Consolidated §7 deterministic policy rule tests.

One test per directive rule (1-14) against the real policy layer — no model
involved anywhere. These complement the per-module tests by pinning the exact
rule table in one place.

Rules not directly testable here (structural by design):
- Rule 9 (model cannot authorize itself): approvals are constructed only by
  ``ApprovalRequest.from_draft`` on the server path; the model never holds
  that constructor. Rule 8 tests forge an approval and show the binding check
  rejects it. Rule 10's blocked verbs are pinned in test_bundles.py.
"""

from __future__ import annotations

from datetime import timedelta

from nanobot.atlas.bundles import BUNDLES, assert_no_blocked_op_executable
from nanobot.atlas.contracts import (
    ActionRisk,
    ApprovalRequest,
    AuthenticatedAtlasContext,
    ConnectorCapability,
    ConsentScope,
    DraftAction,
    EvidenceItem,
    ExecutionStatus,
    payload_hash,
    utc_now,
)
from nanobot.atlas.policy import (
    ConsentState,
    assert_authenticated_principal,
    evaluate_approval,
    evaluate_capability,
    evaluate_consent,
    evaluate_idempotency,
    evaluate_ownership,
    is_evidence_stale,
    mark_evidence_stale,
    provider_unavailable_result,
    requires_approval,
)

USER = "rule-user"
OTHER = "rule-other"


def ctx(scopes: frozenset[ConsentScope] | None = None) -> AuthenticatedAtlasContext:
    return AuthenticatedAtlasContext(
        user_id=USER, scopes=scopes or frozenset({ConsentScope.READ_PROFILE}),
    )


def consent(*, connector: str = "google_tasks", revoked: bool = False,
            expired: bool = False) -> ConsentState:
    return ConsentState(
        user_id=USER, scope=ConsentScope.READ_PROFILE, connector=connector,
        granted_at=utc_now() - timedelta(hours=2),
        expires_at=utc_now() - timedelta(minutes=1) if expired else None,
        revoked=revoked,
    )


def draft(*, action_type: str = "update_task", risk: ActionRisk = ActionRisk.HIGH) -> DraftAction:
    payload = {"task_id": "t1", "title": "Renew passport"}
    return DraftAction(
        user_id=USER, action_type=action_type, risk=risk,
        capability=ConnectorCapability.WRITE_USER_DATA, payload=payload,
        payload_hash=payload_hash(payload), idempotency_key="idem-12345678",
    )


# Rule 1: identity from verified context.
def test_rule_1_identity_from_verified_context() -> None:
    assert assert_authenticated_principal(ctx()) == USER


# Rule 2: client-supplied user IDs are ignored.
def test_rule_2_client_supplied_ids_ignored() -> None:
    # Even when a client id is passed, the principal is the server-derived one;
    # the API does not even bind it (parameter exists for call-site clarity).
    assert assert_authenticated_principal(ctx(), OTHER) == USER
    assert assert_authenticated_principal(ctx(), USER) == USER


def test_rule_3_ownership_enforced() -> None:
    assert evaluate_ownership(ctx(), USER).allowed is True
    verdict = evaluate_ownership(ctx(), OTHER)
    assert verdict.allowed is False
    assert verdict.reason_code == "ownership_mismatch"


# Rule 4: consent checked before provider access, in every state.
def test_rule_4_consent_states() -> None:
    good = evaluate_consent(ctx(), consent())
    assert good.allowed is True and good.reason_code == "consent_active"
    for state, code in (
        (consent(revoked=True), "consent_revoked"),
        (consent(expired=True), "consent_expired"),
        (None, "consent_missing"),
        (ConsentState(user_id=OTHER, scope=ConsentScope.READ_PROFILE,
                      connector="google_tasks", granted_at=utc_now()),
         "consent_not_owned"),
    ):
        verdict = evaluate_consent(ctx(), state)
        assert verdict.allowed is False and verdict.reason_code == code


# Rule 5: capability must be declared AND permitted.
def test_rule_5_capability_undeclared_and_unpermitted() -> None:
    ok = evaluate_capability(
        ctx(), consent(), ConnectorCapability.READ_USER_DATA,
        declared_capabilities=frozenset({ConnectorCapability.READ_USER_DATA}),
    )
    assert ok.allowed is True
    undeclared = evaluate_capability(
        ctx(), consent(), ConnectorCapability.WRITE_USER_DATA,
        declared_capabilities=frozenset({ConnectorCapability.READ_USER_DATA}),
    )
    assert undeclared.allowed is False
    assert undeclared.reason_code == "capability_undeclared"
    unpermitted = evaluate_capability(
        ctx(frozenset({ConsentScope.READ_PUBLIC})), consent(),
        ConnectorCapability.READ_USER_DATA,
        declared_capabilities=frozenset({ConnectorCapability.READ_USER_DATA}),
    )
    assert unpermitted.allowed is False
    assert unpermitted.reason_code == "capability_not_permitted"


# Rule 6: writes always need approval.
def test_rule_6_writes_require_approval() -> None:
    assert requires_approval("update_task", ActionRisk.HIGH) is True
    assert requires_approval("send_reminder", ActionRisk.LOW) is True
    assert requires_approval("read_only", ActionRisk.READ_ONLY) is False
    verdict = evaluate_approval(ctx(), None, draft())
    assert verdict.allowed is False and verdict.reason_code == "approval_required"


# Rules 7/8: approval binding is exact; forged/mutated approvals fail.
def test_rule_7_approval_binding_dimensions() -> None:
    base_draft = draft()
    valid = ApprovalRequest.from_draft(base_draft, user_id=USER)
    assert evaluate_approval(ctx(), valid, base_draft).allowed is True

    wrong_user = ApprovalRequest.from_draft(base_draft, user_id=OTHER)
    assert evaluate_approval(ctx(), wrong_user, base_draft).reason_code == "approval_wrong_user"

    # Same action_id, different action_type -> type mismatch fires.
    other_action = base_draft.model_copy(update={"action_type": "delete_task"})
    assert evaluate_approval(
        ctx(), ApprovalRequest.from_draft(base_draft, user_id=USER), other_action
    ).reason_code == "approval_action_type_mismatch"

    # Payload changed after approval -> hash mismatch. DraftAction's validator
    # makes an unbound hash unconstructible, so tampering means presenting a
    # validly-hashed NEW payload under the approval bound to the ORIGINAL one.
    new_payload = {"task_id": "t1", "title": "Renew passport NOW"}
    tampered = base_draft.model_copy(update={
        "payload": new_payload,
        "payload_hash": payload_hash(new_payload),
    })
    assert evaluate_approval(ctx(), valid, tampered).reason_code == "approval_payload_changed"

    expired = ApprovalRequest.from_draft(
        base_draft, user_id=USER, ttl=timedelta(seconds=-1)
    )
    assert evaluate_approval(ctx(), expired, base_draft).reason_code == "approval_expired"


def test_rule_8_self_authorized_approval_rejected() -> None:
    """The model cannot mint an approval: any approval not bound by the server
    path fails at least one binding dimension (here: idempotency key)."""
    d = draft()
    forged = ApprovalRequest.from_draft(d, user_id=USER)  # bound to d's key
    # Same action id/type/payload but a NEW idempotency key: a replay must
    # fail the key binding even though every other dimension matches.
    replay_draft = d.model_copy(update={"idempotency_key": "replay-98765432"})
    verdict = evaluate_approval(ctx(), forged, replay_draft)
    assert verdict.allowed is False
    assert verdict.reason_code == "approval_idempotency_mismatch"


# Rule 11: consumed idempotency keys never run twice.
def test_rule_11_idempotency_consumed() -> None:
    ok = evaluate_idempotency(ctx(), "key-12345678", frozenset())
    assert ok.allowed is True
    consumed = evaluate_idempotency(ctx(), "key-12345678", {"key-12345678"})
    assert consumed.allowed is False
    assert consumed.reason_code == "idempotency_key_consumed"


# Rule 12: evidence staleness is deterministic.
def test_rule_12_evidence_staleness() -> None:
    fresh = EvidenceItem(source="plaid", content="x", retrieved_at=utc_now(),
                         freshness_seconds=3600)
    old = EvidenceItem(source="plaid", content="x",
                       retrieved_at=utc_now() - timedelta(hours=3),
                       freshness_seconds=3600)
    assert is_evidence_stale(fresh) is False
    assert is_evidence_stale(old) is True
    marked = mark_evidence_stale(old)
    assert marked.state == "stale"
    assert mark_evidence_stale(fresh).state == "fresh"


# Rule 13: provider-unavailable is explicit, never a silent failure.
def test_rule_13_provider_unavailable_explicit() -> None:
    result = provider_unavailable_result(ctx(), action_id="a1",
                                         idempotency_key="idem-12345678")
    assert result.status is ExecutionStatus.PROVIDER_UNAVAILABLE


# Rule 10 (structural half): every bundle pins its blocked writes.
def test_rule_10_bundle_write_blocks_intact() -> None:
    for bundle in BUNDLES.values():
        assert_no_blocked_op_executable(bundle)
    assert any(op.blocked_reason for op in BUNDLES["money_guard"].write)
    assert any(op.blocked_reason for op in BUNDLES["research"].write)


def test_rule_3_note_consent_record_is_user_scoped() -> None:
    # ConsentState is a frozen dataclass owned by the policy layer; a record
    # for another user is structurally possible but policy rejects it.
    foreign = ConsentState(
        user_id=OTHER, scope=ConsentScope.READ_PROFILE,
        connector="google_tasks", granted_at=utc_now(),
    )
    verdict = evaluate_consent(ctx(), foreign)
    assert verdict.allowed is False and verdict.reason_code == "consent_not_owned"
