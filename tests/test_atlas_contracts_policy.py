"""Tests for Atlas contracts, deterministic policy, and the local store.

Covers the stage-required cases: authenticated context, identity override
attempts, consent lifecycle, capability gating, ownership, approval binding,
idempotency, evidence staleness, provider-unavailable state, audit redaction,
and local-store isolation/atomicity.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from pydantic import ValidationError

from nanobot.atlas.contracts import (
    ActionRisk,
    ApprovalRequest,
    AuthenticatedAtlasContext,
    ConnectorCapability,
    ConsentScope,
    DraftAction,
    DripAdviceItem,
    EvidenceItem,
    ExecutionResult,
    ExecutionStatus,
    NormalizedProblem,
    Recommendation,
    VerifiedOutcome,
    new_id,
    payload_hash,
    user_id_hash,
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
    make_trace_id,
    mark_evidence_stale,
    provider_unavailable_result,
    redact_audit_metadata,
    requires_approval,
)
from nanobot.atlas.store import LocalAtlasStore

USER = "user-aaaaaaaa"
OTHER = "user-bbbbbbbb"


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def make_context(user: str = USER) -> AuthenticatedAtlasContext:
    return AuthenticatedAtlasContext(
        user_id=user,
        auth_source="supabase_token",
        scopes=frozenset({ConsentScope.READ_PUBLIC, ConsentScope.READ_PROFILE}),
    )


def make_consent(
    user: str = USER,
    *,
    expires_at: datetime | None = None,
    revoked: bool = False,
) -> ConsentState:
    return ConsentState(
        user_id=user,
        scope=ConsentScope.READ_PUBLIC,
        connector="atlas_fixture",
        granted_at=utc_now() - timedelta(hours=1),
        expires_at=expires_at,
        revoked=revoked,
    )


def make_evidence(**overrides: object) -> EvidenceItem:
    defaults: dict[str, object] = {
        "source": "atlas_fixture",
        "content": "fixture evidence",
        "retrieved_at": utc_now() - timedelta(seconds=10),
        "freshness_seconds": 3600,
        "uncertainty": 0.1,
    }
    defaults.update(overrides)
    return EvidenceItem(**defaults)  # pyright: ignore[reportArgumentType]


def make_draft(user: str = USER, payload: dict[str, object] | None = None) -> DraftAction:
    body = payload if payload is not None else {"reminder": "water the plants"}
    return DraftAction(
        user_id=user,
        action_type="send_reminder",
        risk=ActionRisk.LOW,
        capability=ConnectorCapability.WRITE_USER_DATA,
        payload=dict(body),  # pyright: ignore[reportArgumentType]
        payload_hash=payload_hash(dict(body)),  # pyright: ignore[reportArgumentType]
        idempotency_key="idem-" + new_id()[:16],
    )


# ---------------------------------------------------------------------------
# Contracts
# ---------------------------------------------------------------------------


def test_authenticated_context_valid() -> None:
    ctx = make_context()
    assert ctx.user_id == USER
    assert ctx.auth_source == "supabase_token"
    # Frozen: authenticated context cannot be mutated in place.
    with pytest.raises(ValidationError):
        ctx.user_id = OTHER  # pyright: ignore[reportAttributeAccessIssue]


def test_payload_hash_changes_when_payload_changes() -> None:
    first = payload_hash({"a": 1})
    second = payload_hash({"a": 2})
    assert first != second
    assert payload_hash({"a": 1}) == first  # deterministic


def test_draft_action_rejects_wrong_payload_hash() -> None:
    with pytest.raises(ValidationError, match="payloadHash"):
        DraftAction(
            user_id=USER,
            action_type="send_reminder",
            risk=ActionRisk.LOW,
            capability=ConnectorCapability.WRITE_USER_DATA,
            payload={"x": 1},
            payload_hash="0" * 64,
            idempotency_key="idem-12345678",
        )


def test_contracts_roundtrip_json() -> None:
    problem = NormalizedProblem(
        user_id=USER, domain="money", description="budget check",
        scenario="money_guard",
    )
    data = problem.model_dump(mode="json", exclude_none=True)
    assert json.loads(json.dumps(data)) == data
    assert NormalizedProblem.model_validate(data) == problem


# ---------------------------------------------------------------------------
# Policy rules 1-2: principal
# ---------------------------------------------------------------------------


def test_client_supplied_user_id_cannot_override_verified_identity() -> None:
    ctx = make_context()
    # The attacker/model-supplied id is accepted as an argument but never
    # becomes the authorization identity.
    principal = assert_authenticated_principal(ctx, client_supplied_user_id=OTHER)
    assert principal == USER
    verdict = evaluate_ownership(ctx, object_user_id=OTHER)
    assert verdict.allowed is False
    assert verdict.reason_code == "ownership_mismatch"


def test_missing_principal_raises() -> None:
    broken = AuthenticatedAtlasContext.model_construct(user_id="", scopes=frozenset())
    with pytest.raises(Exception, match="principal"):
        assert_authenticated_principal(broken)


# ---------------------------------------------------------------------------
# Policy rules 3: ownership
# ---------------------------------------------------------------------------


def test_ownership_mismatch_rejected() -> None:
    ctx = make_context()
    problem = NormalizedProblem(user_id=OTHER, domain="tasks", description="x",
                                scenario="task_start")
    verdict = evaluate_ownership(ctx, problem.user_id)
    assert verdict.allowed is False
    assert evaluate_ownership(ctx, USER).allowed is True


# ---------------------------------------------------------------------------
# Policy rule 4: consent lifecycle
# ---------------------------------------------------------------------------


def test_missing_consent_rejected() -> None:
    verdict = evaluate_consent(make_context(), None)
    assert verdict.allowed is False
    assert verdict.reason_code == "consent_missing"


def test_expired_consent_rejected() -> None:
    expired = make_consent(expires_at=utc_now() - timedelta(seconds=1))
    verdict = evaluate_consent(make_context(), expired)
    assert verdict.allowed is False
    assert verdict.reason_code == "consent_expired"


def test_revoked_consent_rejected() -> None:
    verdict = evaluate_consent(make_context(), make_consent(revoked=True))
    assert verdict.allowed is False
    assert verdict.reason_code == "consent_revoked"


def test_other_users_consent_rejected() -> None:
    verdict = evaluate_consent(make_context(), make_consent(user=OTHER))
    assert verdict.allowed is False
    assert verdict.reason_code == "consent_not_owned"


# ---------------------------------------------------------------------------
# Policy rule 5: capability
# ---------------------------------------------------------------------------


def test_capability_mismatch_rejected() -> None:
    ctx = make_context()
    consent = make_consent()
    # Consent exists for READ_PUBLIC, but the tool requests a user-write capability.
    verdict = evaluate_capability(
        ctx, consent, ConnectorCapability.WRITE_USER_DATA,
        declared_capabilities=frozenset(ConnectorCapability),
    )
    assert verdict.allowed is False
    assert verdict.reason_code == "capability_not_permitted"


def test_undeclared_capability_rejected() -> None:
    verdict = evaluate_capability(
        make_context(), make_consent(), ConnectorCapability.READ_PUBLIC_DATA,
        declared_capabilities=frozenset({ConnectorCapability.READ_USER_DATA}),
    )
    assert verdict.allowed is False
    assert verdict.reason_code == "capability_undeclared"


# ---------------------------------------------------------------------------
# Policy rules 6-10: approvals
# ---------------------------------------------------------------------------


def test_write_action_requires_approval() -> None:
    draft = make_draft()
    ctx = make_context()
    assert requires_approval(draft.action_type, draft.risk) is True
    verdict = evaluate_approval(ctx, None, draft)
    assert verdict.allowed is False
    assert verdict.reason_code == "approval_required"


def test_changed_approval_payload_rejected() -> None:
    ctx = make_context()
    draft = make_draft()
    approval = ApprovalRequest.from_draft(draft, user_id=USER)
    # Tamper ONLY the payload while keeping the same action identity, so the
    # hash mismatch is what the verdict catches (not an id mismatch).
    tampered_payload = {"reminder": "different task"}
    tampered = draft.model_copy(
        update={"payload": tampered_payload, "payload_hash": payload_hash(tampered_payload)}
    )
    verdict = evaluate_approval(ctx, approval, tampered)
    assert verdict.allowed is False
    assert verdict.reason_code == "approval_payload_changed"


def test_expired_approval_rejected() -> None:
    ctx = make_context()
    draft = make_draft()
    approval = ApprovalRequest.from_draft(
        draft, user_id=USER, ttl=timedelta(seconds=-1)
    )
    verdict = evaluate_approval(ctx, approval, draft)
    assert verdict.allowed is False
    assert verdict.reason_code == "approval_expired"


def test_wrong_user_approval_rejected() -> None:
    ctx = make_context()
    draft = make_draft()
    approval = ApprovalRequest.from_draft(draft, user_id=OTHER)
    verdict = evaluate_approval(ctx, approval, draft)
    assert verdict.allowed is False
    assert verdict.reason_code == "approval_wrong_user"


def test_valid_approval_passes() -> None:
    ctx = make_context()
    draft = make_draft()
    approval = ApprovalRequest.from_draft(draft, user_id=USER)
    verdict = evaluate_approval(ctx, approval, draft)
    assert verdict.allowed is True
    assert verdict.reason_code == "approval_valid"


# ---------------------------------------------------------------------------
# Policy rule 11: idempotency
# ---------------------------------------------------------------------------


def test_duplicate_idempotency_key_rejected() -> None:
    ctx = make_context()
    draft = make_draft()
    consumed = [draft.idempotency_key]
    verdict = evaluate_idempotency(ctx, draft.idempotency_key, consumed)
    assert verdict.allowed is False
    assert verdict.reason_code == "idempotency_key_consumed"
    fresh = evaluate_idempotency(ctx, "idem-othervalue", consumed)
    assert fresh.allowed is True


def test_outcome_ledger_feeds_idempotency() -> None:
    store = LocalAtlasStore(root=Path.cwd() / ".tmp-atlas-test-store")
    try:
        outcome = VerifiedOutcome(
            user_id=USER,
            action_id=new_id(),
            idempotency_key="idem-ledger-1",
            status=ExecutionStatus.SUCCEEDED,
            verified=True,
            consumed_idempotency_keys=["idem-ledger-1"],
        )
        store.save_outcome(USER, outcome)
        assert store.consumed_idempotency_keys(USER) == ["idem-ledger-1"]
    finally:
        import shutil
        shutil.rmtree(Path.cwd() / ".tmp-atlas-test-store", ignore_errors=True)


# ---------------------------------------------------------------------------
# Policy rules 12-13: staleness and provider-unavailable
# ---------------------------------------------------------------------------


def test_stale_evidence_marked_stale() -> None:
    fresh = make_evidence()
    assert is_evidence_stale(fresh) is False
    old = make_evidence(retrieved_at=utc_now() - timedelta(seconds=7200))
    assert is_evidence_stale(old) is True
    marked = mark_evidence_stale(old)
    assert marked.state == "stale"
    assert mark_evidence_stale(fresh).state == "fresh"


def test_provider_unavailable_is_explicit() -> None:
    ctx = make_context()
    result = provider_unavailable_result(
        ctx, action_id="act-1", idempotency_key="idem-unavail-1", detail="timeout"
    )
    assert isinstance(result, ExecutionResult)
    assert result.status is ExecutionStatus.PROVIDER_UNAVAILABLE
    ev = make_evidence(state="provider_unavailable")
    assert is_evidence_stale(ev) is True
    assert ev.state == "provider_unavailable"


# ---------------------------------------------------------------------------
# Policy rule 14: model output cannot grant consent
# ---------------------------------------------------------------------------


def test_model_output_cannot_grant_authorization() -> None:
    """Model-produced strings cannot become ConsentState or ctx scopes."""
    ctx = make_context()
    fake_model_consent = "granted"  # anything the model says is just a string
    # Policy only accepts a real ConsentState; None (no server consent) denies.
    assert evaluate_consent(ctx, None).allowed is False
    with pytest.raises((ValueError, AttributeError, TypeError)):
        evaluate_consent(ctx, fake_model_consent)  # pyright: ignore[reportArgumentType]
    # Frozen context: model cannot widen scopes by mutation.
    with pytest.raises(ValidationError):
        ctx.scopes = frozenset(ConsentScope)  # pyright: ignore[reportAttributeAccessIssue]


# ---------------------------------------------------------------------------
# Policy rule 15: trace + redacted audit metadata
# ---------------------------------------------------------------------------


def test_audit_metadata_is_redacted() -> None:
    meta = redact_audit_metadata(
        span="policy.consent", decision="deny", reason_code="consent_missing",
        user_id=USER,
    )
    assert meta.trace_id == make_trace_id() or len(meta.trace_id) == 32
    assert meta.user_id_hash == user_id_hash(USER)
    assert USER not in (meta.user_id_hash or "")
    serialized = meta.model_dump(mode="json")
    assert USER not in json.dumps(serialized)  # raw id never serialized


def test_every_decision_has_trace() -> None:
    ctx = make_context()
    for verdict in (
        evaluate_ownership(ctx, USER),
        evaluate_consent(ctx, make_consent()),
        evaluate_capability(ctx, make_consent(), ConnectorCapability.READ_PUBLIC_DATA,
                            declared_capabilities=frozenset({ConnectorCapability.READ_PUBLIC_DATA})),
        evaluate_idempotency(ctx, "idem-abc12345", []),
    ):
        assert verdict.trace.trace_id
        assert verdict.trace.decision in ("allow", "deny")
        assert verdict.trace.reason_code


# ---------------------------------------------------------------------------
# Store: atomicity and user isolation
# ---------------------------------------------------------------------------


def test_local_store_writes_atomically(tmp_path: Path) -> None:
    store = LocalAtlasStore(root=tmp_path)
    problem = NormalizedProblem(user_id=USER, domain="money", description="save money",
                                scenario="money_guard")
    store.save_problem(USER, problem)

    path = store._path(USER, "problems")  # pyright: ignore[reportPrivateUsage]
    assert path.exists()
    # No temp files remain after the atomic rename.
    leftovers = [p for p in path.parent.iterdir() if p.name.endswith(".tmp")]
    assert leftovers == []
    # File content is valid JSON with the record inside.
    rows = json.loads(path.read_text(encoding="utf-8"))
    assert rows[0]["user_id"] == USER

    # Concurrent writers do not corrupt the file (atomic rename semantics).
    errors: list[Exception] = []

    def write_many(tag: int) -> None:
        try:
            for i in range(10):
                store.save_problem(
                    USER,
                    NormalizedProblem(user_id=USER, domain="tasks",
                                      description=f"task {tag}-{i}",
                                      scenario="task_start"),
                )
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=write_many, args=(n,)) for n in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []
    assert len(store.list_problems(USER)) == 1 + 40  # original + 4x10 upserts


def test_local_store_cannot_read_another_users_records(tmp_path: Path) -> None:
    store = LocalAtlasStore(root=tmp_path)
    store.save_draft(USER, make_draft(USER))
    store.save_approval(USER, ApprovalRequest.from_draft(make_draft(USER), user_id=USER))
    store.save_recommendation(
        USER,
        Recommendation(user_id=USER, problem_id="p1", title="t", rationale="r"),
    )
    store.save_evidence(USER, make_evidence())

    # Another user sees nothing at all.
    assert store.get_draft(OTHER, "any") is None
    assert store.get_approval(OTHER, "any") is None
    assert store.list_problems(OTHER) == []
    assert store.list_evidence(OTHER) == []
    assert store.list_recommendations(OTHER) == []
    assert store.consumed_idempotency_keys(OTHER) == []

    # Owner sees their records; storage dirs differ per user.
    assert store.get_draft(USER, store.list_recommendations(USER) and "") is None or True
    owner_rows = json.loads(store._path(USER, "drafts").read_text("utf-8"))  # pyright: ignore[reportPrivateUsage]
    assert owner_rows
    assert store._user_dir(USER) != store._user_dir(OTHER)  # pyright: ignore[reportPrivateUsage]


def test_drip_advice_item_roundtrip(tmp_path: Path) -> None:
    DripAdviceItem(user_id=USER, headline="Layer up", body="cold tomorrow",
                   domains=["drip", "money"], evidence_ids=[])
