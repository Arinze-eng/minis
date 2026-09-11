"""CI-safe tests for demo-path credential gating.

Covers: the registry's plain-alias fallback and placeholder rejection (rule 6),
alias resolution in ``connector_config_from_env``, and the connectors'
``NOT_CONFIGURED`` short-circuit that fires before any provider access when
credentials are absent or placeholders. No network, no real credentials.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import httpx

from nanobot.atlas.connectors.base import ConnectorContext
from nanobot.atlas.connectors.google_tasks import GoogleTasksConnector
from nanobot.atlas.connectors.registry import (
    connector_config_from_env,
    is_connector_enabled,
)
from nanobot.atlas.connectors.serpapi import SerpApiConnector
from nanobot.atlas.contracts import (
    AuthenticatedAtlasContext,
    ConnectorStatus,
    ConsentScope,
    utc_now,
)
from nanobot.atlas.policy import ConsentState

USER = "user-1"


def make_ctx() -> AuthenticatedAtlasContext:
    return AuthenticatedAtlasContext(
        user_id=USER,
        scopes=frozenset({ConsentScope.READ_PUBLIC, ConsentScope.READ_PROFILE}),
    )


def make_consent(connector: str, scope: ConsentScope) -> ConsentState:
    return ConsentState(
        user_id=USER, scope=scope, connector=connector,
        granted_at=utc_now() - timedelta(hours=1), expires_at=None, revoked=False,
    )


def make_ctx_tuple(connector: str, scope: ConsentScope) -> ConnectorContext:
    return ConnectorContext(
        user_id=USER, atlas_context=make_ctx(), consent=make_consent(connector, scope),
        trace_id="t-demo",
    )


def forbidden_transport() -> httpx.AsyncClient:
    """A client whose transport fails the test if any request is attempted."""

    def handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("no provider request may happen without usable credentials")

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ---------------------------------------------------------------------------
# Registry: alias fallback + placeholder rejection
# ---------------------------------------------------------------------------


def test_registry_accepts_plain_alias_credentials() -> None:
    env = {
        "ATLAS_ENABLE_GOOGLE_TASKS": "1",
        "GOOGLE_CLIENT_ID": "cid",
        "GOOGLE_CLIENT_SECRET": "sec",
        "GOOGLE_REFRESH_TOKEN": "rt",
    }
    assert is_connector_enabled("google_tasks", env=env) is True


def test_registry_rejects_placeholder_credentials() -> None:
    env = {"ATLAS_ENABLE_SERPAPI": "1", "SERPAPI_API_KEY": "your_api_key"}
    assert is_connector_enabled("serpapi", env=env) is False


def test_registry_accepts_canonical_placeholder_free_mix() -> None:
    env = {
        "ATLAS_ENABLE_PLAID": "1",
        "ATLAS_PLAID_CLIENT_ID": "cid",
        "PLAID_SECRET": "sec",
        "PLAID_ACCESS_TOKEN": "tok",
    }
    assert is_connector_enabled("plaid", env=env) is True


def test_config_from_env_prefers_canonical_over_alias() -> None:
    env = {
        "ATLAS_ENABLE_SERPAPI": "1",
        "ATLAS_SERPAPI_API_KEY": "canon",
        "SERPAPI_API_KEY": "alias",
    }
    cfg = connector_config_from_env("serpapi", env=env)
    assert cfg["ATLAS_SERPAPI_API_KEY"] == "canon"


def test_config_from_env_resolves_aliases_and_skips_placeholders() -> None:
    env = {
        "ATLAS_PLAID_CLIENT_ID": "cid",
        "PLAID_SECRET": "sec",
        "PLAID_ACCESS_TOKEN": "replace_me",
    }
    cfg = connector_config_from_env("plaid", env=env)
    assert cfg == {
        "ATLAS_PLAID_CLIENT_ID": "cid",
        "ATLAS_PLAID_SECRET": "sec",
        "ATLAS_PLAID_ACCESS_TOKEN": "",
    }


# ---------------------------------------------------------------------------
# Connectors: NOT_CONFIGURED before any provider access
# ---------------------------------------------------------------------------


async def test_google_tasks_missing_credentials_short_circuit(monkeypatch: Any) -> None:
    connector = GoogleTasksConnector(client=forbidden_transport())
    monkeypatch.setattr(type(connector), "_credentials", staticmethod(lambda: {}))
    result = await connector.list_tasks(make_ctx_tuple("google_tasks", ConsentScope.READ_PROFILE))
    assert result.status is ConnectorStatus.NOT_CONFIGURED
    assert result.error is not None


async def test_google_tasks_placeholder_env_never_reaches_oauth(
    monkeypatch: Any,
) -> None:
    """Placeholder env values resolve to unusable creds via read_secret (rule 6)."""
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "replace_me")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "your_client_secret")
    monkeypatch.setenv("GOOGLE_REFRESH_TOKEN", "your_refresh_token")
    connector = GoogleTasksConnector(client=forbidden_transport())
    result = await connector.list_tasks(make_ctx_tuple("google_tasks", ConsentScope.READ_PROFILE))
    assert result.status is ConnectorStatus.NOT_CONFIGURED


async def test_serpapi_missing_key_short_circuit(monkeypatch: Any) -> None:
    monkeypatch.delenv("ATLAS_SERPAPI_API_KEY", raising=False)
    monkeypatch.delenv("SERPAPI_API_KEY", raising=False)
    connector = SerpApiConnector(client=forbidden_transport())
    result = await connector.search_products(
        make_ctx_tuple("serpapi", ConsentScope.READ_PUBLIC), "test query"
    )
    assert result.status is ConnectorStatus.NOT_CONFIGURED


async def test_serpapi_placeholder_env_never_reaches_api(monkeypatch: Any) -> None:
    monkeypatch.setenv("SERPAPI_API_KEY", "your_api_key")
    connector = SerpApiConnector(client=forbidden_transport())
    result = await connector.search_products(
        make_ctx_tuple("serpapi", ConsentScope.READ_PUBLIC), "test query"
    )
    assert result.status is ConnectorStatus.NOT_CONFIGURED
