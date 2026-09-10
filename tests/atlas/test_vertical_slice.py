"""CI-safe mocked tests for the Atlas vertical slice.

Covers: model factory env handling and budgets, Google Tasks + SerpApi
connectors against mocked HTTP (status taxonomy, consent gate, rate window,
normalization, provider-ref preservation), Strands chain orchestration with a
stubbed model, and Telegram delivery card formatting. No network, no creds.
"""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

import httpx
import pytest

from nanobot.atlas.chain import AtlasChain, AtlasChainError, ChainInput, ChainResult
from nanobot.atlas.connectors.google_tasks import GoogleTasksConnector
from nanobot.atlas.connectors.registry import SPECS, is_connector_enabled
from nanobot.atlas.connectors.serpapi import SerpApiConnector
from nanobot.atlas.connectors.telegram_delivery import TelegramDeliveryConnector
from nanobot.atlas.contracts import (
    AuthenticatedAtlasContext,
    ConnectorStatus,
    ConsentScope,
    EvidenceItem,
    Recommendation,
)
from nanobot.atlas.model_factory import (
    AtlasModelUnavailable,
    ModelBudget,
    ModelHandle,
    create_atlas_model,
)
from nanobot.atlas.policy import ConsentState, utc_now

USER = "user-slice"


def make_ctx() -> AuthenticatedAtlasContext:
    return AuthenticatedAtlasContext(
        user_id=USER,
        scopes=frozenset({ConsentScope.READ_PUBLIC, ConsentScope.READ_PROFILE}),
    )


def make_consent(scope: ConsentScope = ConsentScope.READ_PROFILE) -> ConsentState:
    return ConsentState(
        user_id=USER, scope=scope, connector="google_tasks",
        granted_at=utc_now() - timedelta(hours=1), expires_at=None, revoked=False,
    )


def mock_transport(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ---------------------------------------------------------------------------
# Model factory
# ---------------------------------------------------------------------------


def test_model_factory_groq_requires_key() -> None:
    with pytest.raises(AtlasModelUnavailable) as exc:
        create_atlas_model(provider="groq", env={})
    assert exc.value.status is ConnectorStatus.NOT_CONFIGURED


def test_model_factory_unknown_provider() -> None:
    with pytest.raises(AtlasModelUnavailable):
        create_atlas_model(provider="openai-paid", env={"OPENAI_API_KEY": "x"})


def test_model_budget_defaults_and_env() -> None:
    assert ModelBudget().max_model_requests == 4
    assert ModelBudget.from_env().max_model_requests >= 1


def test_model_handle_describe_has_no_secrets() -> None:
    class _FakeModel:
        pass

    handle = ModelHandle(provider="groq", model_id="llama-3.3-70b-versatile",
                         model=_FakeModel(), budget=ModelBudget())
    described = handle.describe()
    assert described == {"provider": "groq", "model": "llama-3.3-70b-versatile"}
    assert "key" not in json.dumps(described).lower()


# ---------------------------------------------------------------------------
# Google Tasks connector (mocked HTTP)
# ---------------------------------------------------------------------------


def _fake_google_creds() -> dict[str, str]:
    """Fake OAuth creds so the connector reaches the mocked transport."""
    return {
        "ATLAS_GOOGLE_CLIENT_ID": "cid",
        "ATLAS_GOOGLE_CLIENT_SECRET": "sec",
        "ATLAS_GOOGLE_REFRESH_TOKEN": "rt",
    }


def _tasks_response(rows: list[dict[str, Any]]) -> httpx.Response:
    return httpx.Response(200, json={"items": rows})


@pytest.mark.asyncio
async def test_google_tasks_missing_consent_denied() -> None:
    connector = GoogleTasksConnector(client=mock_transport(lambda req: httpx.Response(200, json={})))
    from nanobot.atlas.connectors.base import ConnectorContext

    ctx = ConnectorContext(user_id=USER, atlas_context=make_ctx(), consent=None, trace_id="t")
    result = await connector.list_tasks(ctx)
    assert result.status is ConnectorStatus.UNAUTHORIZED


@pytest.mark.asyncio
async def test_google_tasks_rate_window(monkeypatch: pytest.MonkeyPatch) -> None:
    connector = GoogleTasksConnector(client=mock_transport(lambda req: _tasks_response([])))
    for _ in range(10):
        connector._window_requests.append(__import__("time").monotonic())
    from nanobot.atlas.connectors.base import ConnectorContext

    ctx = ConnectorContext(user_id=USER, atlas_context=make_ctx(), consent=make_consent(), trace_id="t")
    result = await connector.list_tasks(ctx)
    assert result.status is ConnectorStatus.RATE_LIMITED


@pytest.mark.asyncio
async def test_google_tasks_success_normalization(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if "oauth2.googleapis.com" in str(request.url):
            return httpx.Response(200, json={"access_token": "at-1", "expires_in": 3600})
        return _tasks_response([
            {"id": "t1", "title": "Renew passport", "status": "needsAction",
             "due": "2026-09-20T10:00:00.000Z", "updated": "2026-09-10T09:00:00.000Z"},
            {"id": "", "title": "malformed row dropped"},
        ])

    connector = GoogleTasksConnector(client=mock_transport(handler))
    connector._credentials = _fake_google_creds  # instance attr: fake creds -> mocked transport
    from nanobot.atlas.connectors.base import ConnectorContext

    ctx = ConnectorContext(user_id=USER, atlas_context=make_ctx(), consent=make_consent(), trace_id="t")
    result = await connector.list_tasks(ctx)
    assert result.status is ConnectorStatus.OK
    assert len(result.items) == 1
    payload = result.items[0].payload
    assert payload["provider_ref"]["provider_id"] == "t1"
    assert payload["provider_ref"]["url"].startswith("https://tasks.google.com/task/")
    assert payload["title"] == "Renew passport"
    assert payload["due_at"].startswith("2026-09-20")


@pytest.mark.asyncio
async def test_google_tasks_401_unauthorized(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if "oauth2.googleapis.com" in str(request.url):
            return httpx.Response(200, json={"access_token": "at-1", "expires_in": 3600})
        return httpx.Response(401, json={"error": "invalid"})

    connector = GoogleTasksConnector(client=mock_transport(handler))
    connector._credentials = _fake_google_creds
    from nanobot.atlas.connectors.base import ConnectorContext

    ctx = ConnectorContext(user_id=USER, atlas_context=make_ctx(), consent=make_consent(), trace_id="t")
    result = await connector.list_tasks(ctx)
    assert result.status is ConnectorStatus.UNAUTHORIZED


@pytest.mark.asyncio
async def test_google_tasks_429_rate_limited() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if "oauth2.googleapis.com" in str(request.url):
            return httpx.Response(200, json={"access_token": "at-1", "expires_in": 3600})
        return httpx.Response(429, headers={"Retry-After": "30"}, json={})

    connector = GoogleTasksConnector(client=mock_transport(handler))
    connector._credentials = _fake_google_creds
    from nanobot.atlas.connectors.base import ConnectorContext

    ctx = ConnectorContext(user_id=USER, atlas_context=make_ctx(), consent=make_consent(), trace_id="t")
    result = await connector.list_tasks(ctx)
    assert result.status is ConnectorStatus.RATE_LIMITED
    assert result.retry_after_seconds == 30


@pytest.mark.asyncio
async def test_google_tasks_not_configured() -> None:
    connector = GoogleTasksConnector()
    connector._access_token = None
    connector._credentials = staticmethod(lambda: {k: "" for k in (
        "ATLAS_GOOGLE_CLIENT_ID", "ATLAS_GOOGLE_CLIENT_SECRET", "ATLAS_GOOGLE_REFRESH_TOKEN")})
    result = await connector.health_check()
    assert result.status is ConnectorStatus.NOT_CONFIGURED


# ---------------------------------------------------------------------------
# SerpApi connector (mocked HTTP)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_serpapi_success_products(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"shopping_results": [
            {"title": "Winter jacket", "price": "$129.99", "extracted_price": 129.99,
             "link": "https://shop.example.com/jacket", "source": "Acme",
             "product_id": "p-1", "rating": 4.5},
            {"title": "No link row"},
        ]})

    connector = SerpApiConnector(client=mock_transport(handler))
    from nanobot.atlas.connectors.base import ConnectorContext

    ctx = ConnectorContext(user_id=USER, atlas_context=make_ctx(), consent=make_consent(), trace_id="t")
    result = await connector.search_products(ctx, "winter jacket")
    assert result.status is ConnectorStatus.OK
    assert len(result.items) == 1
    payload = result.items[0].payload
    assert payload["title"] == "Winter jacket"
    assert payload["price"] == "$129.99"
    assert payload["provider_ref"]["url"] == "https://shop.example.com/jacket"
    assert payload["provider_ref"]["provider"].startswith("serpapi:")


@pytest.mark.asyncio
async def test_serpapi_missing_consent_denied() -> None:
    connector = SerpApiConnector(client=mock_transport(lambda req: httpx.Response(200, json={})))
    from nanobot.atlas.connectors.base import ConnectorContext

    ctx = ConnectorContext(user_id=USER, atlas_context=make_ctx(), consent=None, trace_id="t")
    result = await connector.search_products(ctx, "q")
    assert result.status is ConnectorStatus.UNAUTHORIZED


def test_serpapi_registry_gating() -> None:
    env = {"ATLAS_ENABLE_SERPAPI": "true", "ATLAS_SERPAPI_API_KEY": "k"}
    assert is_connector_enabled("serpapi", env=env) is True


# ---------------------------------------------------------------------------
# Telegram delivery
# ---------------------------------------------------------------------------


def test_demo_card_contains_required_sections() -> None:
    evidence = EvidenceItem(source="google_tasks", content="Renew passport (due 2026-09-20)",
                            state="fresh", uncertainty=0.0)
    card = TelegramDeliveryConnector.format_demo_card(
        user_request="what should I do next on my tasks?",
        connector="google_tasks",
        evidence=[evidence],
        recommendation=Recommendation(user_id=USER, problem_id="p", title="Renew passport first",
                                      rationale="earliest deadline"),
        approval_required=True,
    )
    for fragment in ("Atlas", "Source", "google_tasks", "Renew passport",
                     "Recommendation", "approval"):
        assert fragment in card


def test_demo_card_provider_unavailable_state() -> None:
    card = TelegramDeliveryConnector.format_demo_card(
        user_request="tasks", connector="google_tasks", evidence=[],
        recommendation=None, provider_unavailable=True,
    )
    assert "provider unavailable" in card


# ---------------------------------------------------------------------------
# Chain (Strands orchestration with stubbed model)
# ---------------------------------------------------------------------------


class _StubModelHandle:
    """ModelHandle stand-in: no strands needed for CI-safe chain tests."""

    def __init__(self) -> None:
        self.provider = "groq"
        self.model_id = "stub"
        self.model = None  # stub agent ignores the model
        self.budget = ModelBudget(max_model_requests=4)
        self.atlas_context = make_ctx()
        self.describe_calls = 0

    def describe(self) -> dict[str, str]:
        self.describe_calls += 1
        return {"provider": self.provider, "model": self.model_id}


class _StubAgentResult:
    def __init__(self) -> None:
        self.structured_output = type("S", (), {"title": "Renew passport first",
                                                "rationale": "earliest deadline",
                                                "next_action": "review_tasks"})()


@pytest.mark.asyncio
async def test_chain_task_start_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    """Chain produces a typed recommendation from connector evidence.

    Strands Agent is stubbed at the boundary; the connector call is real
    connector code against mocked HTTP, and the policy gate runs for real.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        if "oauth2.googleapis.com" in str(request.url):
            return httpx.Response(200, json={"access_token": "at-1", "expires_in": 3600})
        return _tasks_response([
            {"id": "t1", "title": "Renew passport", "status": "needsAction"},
            {"id": "t2", "title": "Pay rent", "status": "needsAction"},
        ])

    connector = GoogleTasksConnector(client=mock_transport(handler))
    monkeypatch.setattr(
        type(connector), "_credentials", staticmethod(_fake_google_creds)
    )
    handle = _StubModelHandle()
    chain = AtlasChain(connector=connector, model_handle=handle, consent=make_consent())

    # Capture the tool passed to the Agent so the stub can call the REAL
    # connector path; Strands itself is stubbed at the class boundary.
    captured: dict[str, Any] = {}

    class _StubAgent:
        def __init__(self, **kwargs: Any) -> None:
            assert "tools" in kwargs and len(kwargs["tools"]) == 1  # only chain tool
            captured.update(kwargs)

        async def invoke_async(self, prompt: str) -> _StubAgentResult:
            # The agent actually calls the connector tool (real connector code).
            tool_fn = captured["tools"][0]
            result_json = await tool_fn("what next on my tasks?")
            data = json.loads(result_json)
            assert data["status"] == "ok"
            assert data["items"], "expected real normalized evidence from connector"
            return _StubAgentResult()

    import nanobot.atlas.chain as chain_mod

    def patched_wrap(fn: Any) -> Any:
        # Identity wrapper: CI runs without strands; the plain async fn is the tool.
        return fn

    monkeypatch.setattr(chain_mod, "_wrap_tool", patched_wrap)
    monkeypatch.setattr(chain_mod, "_agent_class", lambda: _StubAgent)

    result = await chain.run(
        ChainInput(user_id=USER, scenario="task_start", query="what next on my tasks?",
                   consent=make_consent())
    )
    assert isinstance(result, ChainResult)
    assert result.status is ConnectorStatus.OK
    assert result.recommendation is not None
    assert result.recommendation.title == "Renew passport first"
    assert result.provider_info == {"provider": "groq", "model": "stub"}
    assert result.approval_required is False  # no side effects in this slice
    assert len(result.evidence) == 2
    assert result.model_requests_used == 1


@pytest.mark.asyncio
async def test_chain_policy_denies_without_consent() -> None:
    connector = GoogleTasksConnector()
    handle = _StubModelHandle()
    chain = AtlasChain(connector=connector, model_handle=handle, consent=None)
    with pytest.raises(AtlasChainError) as exc:
        await chain.run(ChainInput(user_id=USER, scenario="task_start", query="x",
                                   consent=None))
    assert exc.value.reason_code == "policy_denied"


def test_chain_input_bounds() -> None:
    with pytest.raises(AtlasChainError):
        ChainInput(user_id=USER, scenario="task_start", query="   ", consent=make_consent())
    with pytest.raises(AtlasChainError):
        ChainInput(user_id=USER, scenario="task_start", query="x" * 600, consent=make_consent())


# ---------------------------------------------------------------------------
# Registry: new readonly scope surfaced
# ---------------------------------------------------------------------------


def test_google_tasks_readonly_scope_declared() -> None:
    spec = SPECS["google_tasks"]
    assert spec.readonly_scopes == ("https://www.googleapis.com/auth/tasks.readonly",)
    assert spec.required_scopes == ("https://www.googleapis.com/auth/tasks",)
