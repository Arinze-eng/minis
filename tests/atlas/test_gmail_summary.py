"""CI-safe tests for the Gmail read-only evidence summary (directive §2.5).

Covers: registry spec (read-only scope/capability — no send/compose), the
EmailItem contract, the Gmail connector against mocked HTTP (consent gate,
NOT_CONFIGURED/OAUTH_EXPIRED short-circuits, error taxonomy, metadata
normalization, bounded fetch), chain + service wiring, and the
email_summary capability bundle with blocked write ops. No network.
"""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

import httpx
import pytest

from nanobot.atlas.bundles import BUNDLES, bundle_for_scenario
from nanobot.atlas.chain import AtlasChain, AtlasChainError, ChainInput
from nanobot.atlas.connectors.base import ConnectorContext
from nanobot.atlas.connectors.gmail import GmailConnector
from nanobot.atlas.connectors.registry import SPECS
from nanobot.atlas.contracts import (
    ConnectorCapability,
    ConnectorStatus,
    ConsentScope,
    EmailItem,
    utc_now,
)
from nanobot.atlas.model_factory import ModelBudget, ModelHandle
from nanobot.atlas.policy import ConsentState
from nanobot.atlas.service import SCENARIO_CONNECTORS, AtlasRequest, AtlasService

USER = "user-1"


def make_ctx() -> Any:
    from nanobot.atlas.contracts import AuthenticatedAtlasContext

    return AuthenticatedAtlasContext(
        user_id=USER, scopes=frozenset({ConsentScope.READ_PROFILE})
    )


def make_consent() -> ConsentState:
    return ConsentState(
        user_id=USER, scope=ConsentScope.READ_PROFILE, connector="gmail",
        granted_at=utc_now() - timedelta(hours=1), expires_at=None, revoked=False,
    )


def make_connector_ctx() -> ConnectorContext:
    return ConnectorContext(
        user_id=USER, atlas_context=make_ctx(), consent=make_consent(),
        trace_id="t-gmail",
    )


def mock_transport(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def creds_patch(monkeypatch: pytest.MonkeyPatch, empty: bool = False) -> None:
    values = ("", "", "") if empty else ("cid", "sec", "rt")
    monkeypatch.setattr(
        GmailConnector, "_credentials", staticmethod(lambda: dict(zip(
            ("ATLAS_GOOGLE_CLIENT_ID", "ATLAS_GOOGLE_CLIENT_SECRET",
             "ATLAS_GOOGLE_REFRESH_TOKEN"), values
        )))
    )


# ---------------------------------------------------------------------------
# Registry + contract
# ---------------------------------------------------------------------------


def test_gmail_spec_is_read_only() -> None:
    spec = SPECS["gmail"]
    assert spec.required_scopes == ("https://www.googleapis.com/auth/gmail.readonly",)
    assert spec.read_only is True
    assert ConnectorCapability.WRITE_USER_DATA not in spec.capabilities
    assert ConnectorCapability.READ_USER_DATA in spec.capabilities


def test_email_item_contract() -> None:
    item = EmailItem(
        user_id=USER, sender="news@example.com",
        provider_ref=__import__(
            "nanobot.atlas.contracts", fromlist=["ProviderRef"]
        ).ProviderRef(provider="gmail", provider_id="msg-1"),
    )
    assert item.subject == "(no subject)"
    assert item.labels == ()
    dumped = json.loads(item.model_dump_json())
    assert dumped["sender"] == "news@example.com"


# ---------------------------------------------------------------------------
# Connector: short-circuits before provider access
# ---------------------------------------------------------------------------


def forbidden_transport() -> httpx.AsyncClient:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("no provider request may happen without consent/creds")

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_missing_consent_denied() -> None:
    connector = GmailConnector(client=forbidden_transport())
    ctx = ConnectorContext(user_id=USER, atlas_context=make_ctx(), consent=None,
                           trace_id="t")
    result = await connector.list_recent_messages(ctx)
    assert result.status is ConnectorStatus.UNAUTHORIZED


async def test_missing_credentials_short_circuit(monkeypatch: pytest.MonkeyPatch) -> None:
    connector = GmailConnector(client=forbidden_transport())
    creds_patch(monkeypatch, empty=True)
    result = await connector.list_recent_messages(make_connector_ctx())
    assert result.status is ConnectorStatus.NOT_CONFIGURED


async def test_placeholder_credentials_never_reach_api(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "replace_me")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "your_client_secret")
    monkeypatch.setenv("GOOGLE_REFRESH_TOKEN", "your_refresh_token")
    connector = GmailConnector(client=forbidden_transport())
    result = await connector.list_recent_messages(make_connector_ctx())
    assert result.status is ConnectorStatus.NOT_CONFIGURED


async def test_oauth_failure_maps_to_expired(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "oauth2.googleapis.com" in str(request.url)
        return httpx.Response(400, json={"error": "invalid_grant"})

    connector = GmailConnector(client=mock_transport(handler))
    creds_patch(monkeypatch)
    result = await connector.list_recent_messages(make_connector_ctx())
    assert result.status is ConnectorStatus.OAUTH_EXPIRED


# ---------------------------------------------------------------------------
# Connector: normalization + error taxonomy (mocked HTTP)
# ---------------------------------------------------------------------------


def _message_detail(message_id: str) -> dict[str, Any]:
    return {
        "id": message_id,
        "snippet": "Your statement is ready",
        "labelIds": ["INBOX", "CATEGORY_PERSONAL"],
        "payload": {"headers": [
            {"name": "Subject", "value": "Statement ready"},
            {"name": "From", "value": "Bank <alerts@bank.example>"},
            {"name": "Date", "value": "invalid-date-on-purpose"},
        ]},
    }


def _gmail_http() -> httpx.AsyncClient:
    """Token exchange + messages.list + per-message metadata GETs."""

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        path = request.url.path
        if "oauth2.googleapis.com" in url:
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
        if path.endswith("/messages"):
            return httpx.Response(200, json={"messages": [
                {"id": "msg-1"}, {"id": "msg-2"}, "garbage-row", {},
            ]})
        if "msg-2" in url:
            return httpx.Response(500, text="boom")
        return httpx.Response(200, json=_message_detail(path.rsplit("/", 1)[-1]))

    return mock_transport(handler)


async def test_list_messages_normalizes_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    connector = GmailConnector(client=_gmail_http())
    creds_patch(monkeypatch)
    result = await connector.list_recent_messages(make_connector_ctx())
    assert result.status is ConnectorStatus.OK
    assert len(result.items) == 1  # msg-2 500s; garbage/empty rows skipped
    payload = result.items[0].payload
    assert payload["subject"] == "Statement ready"
    assert "alerts@bank.example" in payload["sender"]
    assert payload.get("received_at") is None  # unparseable date -> None, never fabricated (excluded by exclude_none=True)
    assert "INBOX" in payload["labels"]
    assert result.trace.reason_code == "skipped_malformed_rows:3"


async def test_error_taxonomy_from_gmail_responses(monkeypatch: pytest.MonkeyPatch) -> None:
    cases: dict[int, ConnectorStatus] = {401: ConnectorStatus.UNAUTHORIZED,
                                         403: ConnectorStatus.UNAUTHORIZED,
                                         429: ConnectorStatus.RATE_LIMITED,
                                         500: ConnectorStatus.PROVIDER_ERROR}

    def make_handler(code: int) -> Any:
        def handler(request: httpx.Request) -> httpx.Response:
            if "oauth2.googleapis.com" in str(request.url):
                return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
            return httpx.Response(code, json={})

        return handler

    for code, expected in cases.items():
        connector = GmailConnector(client=mock_transport(make_handler(code)))
        connector._access_token = None
        creds_patch(monkeypatch)
        result = await connector.list_recent_messages(make_connector_ctx())
        assert result.status is expected, f"{code} -> {expected}"


# ---------------------------------------------------------------------------
# Chain + service + bundle wiring
# ---------------------------------------------------------------------------


def _chain() -> AtlasChain:
    return AtlasChain(connector=GmailConnector(), model_handle=_handle(), consent=make_consent())


def _handle() -> ModelHandle:
    return ModelHandle(
        provider="groq", model_id="openai/gpt-oss-120b", model=object(),
        budget=ModelBudget(), atlas_context=make_ctx(),
    )


async def test_chain_policy_gate_denies_without_consent() -> None:
    chain = AtlasChain(connector=GmailConnector(), model_handle=_handle(), consent=None)
    with pytest.raises(AtlasChainError) as exc:
        await chain.run(ChainInput(user_id=USER, scenario="email_summary",
                                   query="x", consent=None))
    assert exc.value.reason_code == "policy_denied"


def test_email_summary_bundle_blocks_writes() -> None:
    bundle = bundle_for_scenario("email_summary")
    assert bundle is not None and bundle.connector == "gmail"
    blocked = {op.op for op in bundle.write if op.blocked_reason}
    assert {"send_email", "mutate_message", "download_attachment"} <= blocked


def test_service_maps_email_summary_to_gmail() -> None:
    assert SCENARIO_CONNECTORS["email_summary"] == "gmail"


async def test_service_connector_disabled_without_flag() -> None:
    service = AtlasService(env={})  # gmail flag off -> connector_disabled
    response = await service.handle_request(
        AtlasRequest(user_id=USER, scenario="email_summary", query="summarize inbox")
    )
    assert response.status is ConnectorStatus.NOT_CONFIGURED
    assert response.reason_code == "connector_disabled"
    assert response.connector == "gmail"


async def test_service_end_to_end_not_configured(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> None:
    """Flag on, placeholders only -> NOT_CONFIGURED without any provider call."""
    from nanobot.atlas.store import LocalAtlasStore

    monkeypatch.setenv("ATLAS_ENABLE_GMAIL", "1")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "replace_me")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "your_client_secret")
    monkeypatch.setenv("GOOGLE_REFRESH_TOKEN", "your_refresh_token")
    store = LocalAtlasStore(root=tmp_path / "atlas")
    store.save_consent(USER, make_consent())
    service = AtlasService(store)
    response = await service.handle_request(
        AtlasRequest(user_id=USER, scenario="email_summary", query="summarize inbox")
    )
    assert response.status is ConnectorStatus.NOT_CONFIGURED
    assert response.connector == "gmail"


def test_all_bundles_import_time_invariants_hold() -> None:
    # Import-time validation already ran; this pin keeps the count explicit.
    assert "email_summary" in BUNDLES
