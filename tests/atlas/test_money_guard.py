"""CI-safe tests for the Money Guard slice (directive §2.1).

Covers: deterministic recurring/price-change detection rules, Plaid Sandbox
connector against mocked HTTP (consent gate, status taxonomy, sandbox
labeling, normalization), and money_guard chain wiring with a stubbed model.
No network, no real credentials.
"""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

import httpx
import pytest

from nanobot.atlas.chain import AtlasChain, AtlasChainError, ChainInput
from nanobot.atlas.connectors.base import ConnectorContext
from nanobot.atlas.connectors.plaid import PlaidConnector
from nanobot.atlas.contracts import (
    AuthenticatedAtlasContext,
    ConnectorStatus,
    ConsentScope,
    ProviderRef,
    TransactionItem,
)
from nanobot.atlas.model_factory import ModelBudget
from nanobot.atlas.money import detect_recurring_charges, review_card
from nanobot.atlas.policy import ConsentState, utc_now

USER = "user-money"


def make_ctx() -> AuthenticatedAtlasContext:
    return AuthenticatedAtlasContext(
        user_id=USER,
        scopes=frozenset({ConsentScope.READ_PROFILE}),
    )


def make_consent() -> ConsentState:
    return ConsentState(
        user_id=USER, scope=ConsentScope.READ_PROFILE, connector="plaid",
        granted_at=utc_now() - timedelta(hours=1), expires_at=None, revoked=False,
    )


def make_txn(
    merchant: str, amount: float, days_ago: int, *, txn_id: str | None = None
) -> TransactionItem:
    return TransactionItem(
        user_id=USER,
        is_sandbox=True,
        amount=amount,
        merchant=merchant,
        posted_at=utc_now() - timedelta(days=days_ago),
        provider_ref=ProviderRef(provider="plaid", provider_id=txn_id or f"txn-{merchant}-{days_ago}"),
    )


# ---------------------------------------------------------------------------
# Deterministic detection rules
# ---------------------------------------------------------------------------


def test_recurring_series_detected() -> None:
    txns = [
        make_txn("StreamFlix", 15.99, 75),
        make_txn("StreamFlix", 15.99, 45),
        make_txn("StreamFlix", 15.99, 15),
        make_txn("Coffee Bar", 4.50, 3),  # irregular, no series
    ]
    findings = detect_recurring_charges(txns, USER)
    assert len(findings) == 1
    f = findings[0]
    assert f.merchant == "StreamFlix"
    assert f.detection == "recurring"
    assert f.typical_amount == pytest.approx(15.99)
    assert f.occurrences == 3
    assert f.cadence_days == 30
    assert f.confidence >= 0.5
    assert len(f.source_transaction_ids) == 3


def test_price_change_detected() -> None:
    txns = [
        make_txn("GymPlus", 29.0, 95),
        make_txn("GymPlus", 29.0, 65),
        make_txn("GymPlus", 29.0, 35),
        make_txn("GymPlus", 39.0, 5),  # latest breaks tolerance
    ]
    findings = detect_recurring_charges(txns, USER)
    assert len(findings) == 1
    f = findings[0]
    assert f.detection == "price_change"
    assert f.typical_amount == pytest.approx(29.0)
    assert f.latest_amount == pytest.approx(39.0)
    assert "typically" in f.summary


def test_irregular_cadence_not_recurring() -> None:
    txns = [
        make_txn("RandomShop", 60.0, 80),
        make_txn("RandomShop", 20.0, 40),
        make_txn("RandomShop", 80.0, 2),
    ]
    findings = detect_recurring_charges(txns, USER)
    assert findings == []


def test_two_occurrences_not_recurring() -> None:
    txns = [make_txn("RentCo", 1200.0, 35), make_txn("RentCo", 1200.0, 5)]
    assert detect_recurring_charges(txns, USER) == []


def test_findings_sorted_by_amount_and_user_scoped() -> None:
    txns = [
        make_txn("CheapSub", 5.0, 70), make_txn("CheapSub", 5.0, 40), make_txn("CheapSub", 5.0, 10),
        make_txn("BigSub", 90.0, 70), make_txn("BigSub", 90.0, 40), make_txn("BigSub", 90.0, 10),
        make_txn("OtherUser", 500.0, 10),  # different user: ignored
    ]
    findings = detect_recurring_charges(txns, USER)
    assert [f.merchant for f in findings] == ["BigSub", "CheapSub"]


def test_review_card_is_bounded_and_sandbox_labeled() -> None:
    txns = [
        make_txn(f"Sub{i}", 10.0 + i, 70 - i)
        for i in range(3)
    ] + [make_txn("SubA", 10.0, 40), make_txn("SubA", 10.0, 10)]
    # Build three distinct recurring merchants
    txns = []
    for idx, (name, amt) in enumerate([("Aa", 10.0), ("Bb", 20.0), ("Cc", 30.0), ("Dd", 40.0), ("Ee", 50.0), ("Ff", 60.0)]):
        for days in (75, 45, 15):
            txns.append(make_txn(name, amt, days))
    card = review_card(detect_recurring_charges(txns, USER), max_items=5)
    assert card["kind"] == "money_guard_review"
    assert len(card["items"]) == 5
    assert "sandbox" in card["sandbox_note"].lower()


# ---------------------------------------------------------------------------
# Plaid connector (mocked HTTP)
# ---------------------------------------------------------------------------


def mock_transport(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _plaid_response(rows: list[dict[str, Any]]) -> httpx.Response:
    return httpx.Response(200, json={
        "accounts": [{"account_id": "acc1", "name": "Checking"}],
        "transactions": rows,
    })


def _connector(handler: Any) -> PlaidConnector:
    conn = PlaidConnector(client=mock_transport(handler))
    conn._credentials = staticmethod(lambda: {  # type: ignore[method-assign]
        "client_id": "cid", "secret": "sec", "access_token": "at-1"})
    return conn


async def _money_ctx() -> ConnectorContext:
    return ConnectorContext(user_id=USER, atlas_context=make_ctx(),
                            consent=make_consent(), trace_id="t")


@pytest.mark.asyncio
async def test_plaid_success_normalization() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        assert body["access_token"] == "at-1"  # credentials flow only into the request
        assert "sandbox.plaid.com" in str(request.url)
        return _plaid_response([
            {"transaction_id": "t1", "name": "StreamFlix", "amount": 15.99,
             "date": "2026-09-01", "iso_currency_code": "USD", "account_id": "acc1"},
            {"transaction_id": "", "name": "malformed"},  # dropped
        ])

    result = await _connector(handler).list_transactions(await _money_ctx())
    assert result.status is ConnectorStatus.OK
    assert len(result.items) == 1
    payload = result.items[0].payload
    assert payload["merchant"] == "StreamFlix"
    assert payload["amount"] == 15.99
    assert payload["is_sandbox"] is True
    assert payload["provider_ref"]["provider_id"] == "t1"
    assert payload["account_name"] == "Checking"
    assert "[SANDBOX]" in result.items[0].content


async def test_plaid_missing_consent_denied() -> None:
    conn = PlaidConnector(client=mock_transport(lambda req: httpx.Response(200, json={})))
    ctx = ConnectorContext(user_id=USER, atlas_context=make_ctx(), consent=None, trace_id="t")
    result = await conn.list_transactions(ctx)
    assert result.status is ConnectorStatus.UNAUTHORIZED


@pytest.mark.asyncio
async def test_plaid_not_configured() -> None:
    conn = PlaidConnector()
    conn._credentials = staticmethod(lambda: {"client_id": "", "secret": "", "access_token": ""})  # type: ignore[method-assign]
    result = await conn.health_check()
    assert result.status is ConnectorStatus.NOT_CONFIGURED


@pytest.mark.asyncio
async def test_plaid_error_statuses() -> None:
    def make(status_code: int):
        return _connector(lambda req: httpx.Response(status_code, json={}))

    ctx = await _money_ctx()
    assert (await make(400).list_transactions(ctx)).status is ConnectorStatus.UNAUTHORIZED
    assert (await make(429).list_transactions(ctx)).status is ConnectorStatus.RATE_LIMITED
    assert (await make(503).list_transactions(ctx)).status is ConnectorStatus.PROVIDER_ERROR


@pytest.mark.asyncio
async def test_plaid_malformed_body() -> None:
    conn = _connector(lambda req: httpx.Response(200, json={"nope": True}))
    result = await conn.list_transactions(await _money_ctx())
    assert result.status is ConnectorStatus.MALFORMED


# ---------------------------------------------------------------------------
# Chain wiring (stubbed model, real connector code)
# ---------------------------------------------------------------------------


class _StubModelHandle:
    provider = "groq"
    model_id = "stub"

    def __init__(self) -> None:
        self.model = None
        self.budget = ModelBudget(max_model_requests=4)
        self.atlas_context = make_ctx()

    def describe(self) -> dict[str, str]:
        return {"provider": self.provider, "model": self.model_id}


class _StubAgentResult:
    structured_output = type(
        "S", (), {"title": "Review StreamFlix charge", "rationale": "recurring, price changed",
                  "next_action": "review_transaction"}
    )()


@pytest.mark.asyncio
async def test_chain_money_guard_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _plaid_response([
            {"transaction_id": f"t{i}", "name": "StreamFlix", "amount": amt,
             "date": (utc_now() - timedelta(days=d)).date().isoformat(),
             "iso_currency_code": "USD", "account_id": "acc1"}
            for i, (amt, d) in enumerate([(15.99, 75), (15.99, 45), (15.99, 15), (19.99, 2)])
        ])

    connector = _connector(handler)
    handle = _StubModelHandle()
    chain = AtlasChain(connector=connector, model_handle=handle, consent=make_consent())

    captured: dict[str, Any] = {}

    class _StubAgent:
        def __init__(self, **kwargs: Any) -> None:
            assert "tools" in kwargs and len(kwargs["tools"]) == 1
            captured.update(kwargs)

        async def invoke_async(self, prompt: str) -> _StubAgentResult:
            tool_fn = captured["tools"][0]
            data = json.loads(await tool_fn("review my recurring charges"))
            assert data["status"] == "ok"
            assert len(data["items"]) == 4
            return _StubAgentResult()

    import nanobot.atlas.chain as chain_mod

    monkeypatch.setattr(chain_mod, "_wrap_tool", lambda fn: fn)
    monkeypatch.setattr(chain_mod, "_agent_class", lambda: _StubAgent)

    result = await chain.run(
        ChainInput(user_id=USER, scenario="money_guard", query="review my recurring charges",
                   consent=make_consent())
    )
    assert result.status is ConnectorStatus.OK
    assert result.recommendation is not None
    assert result.approval_required is False
    assert result.provider_info == {"provider": "groq", "model": "stub"}


@pytest.mark.asyncio
async def test_chain_money_guard_requires_consent() -> None:
    chain = AtlasChain(connector=PlaidConnector(), model_handle=_StubModelHandle(), consent=None)
    with pytest.raises(AtlasChainError) as exc:
        await chain.run(ChainInput(user_id=USER, scenario="money_guard", query="x",
                                   consent=None))
    assert exc.value.reason_code == "policy_denied"
