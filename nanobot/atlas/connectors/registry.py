"""Connector registry: environment variables, feature flags, smoke-test metadata.

This module is the single declarative source for which real connectors exist,
which environment variables and feature flags gate them, and how to smoke-test
them. No credentials are read at import time; ``connector_config_from_env`` is
called only by the smoke-test/launch path.

MCP-vs-direct decision (verified against the checkout): the repository's MCP
support (``agent/tools/mcp.py`` + ``tools.mcpServers`` with ``enabled_tools``
filtering) is the right integration point when a maintained MCP server exists
for a provider. For the demo priorities the decision is:

- SerpApi: direct API (simple GET, no maintained official MCP server);
- Google Tasks / Gmail: direct API via google-api-python-client (OAuth is
  handled through the existing nanobot provider/OAuth conventions; no
  per-user MCP server process needed for one demo);
- Telegram delivery: the EXISTING nanobot Telegram channel (not a new
  connector transport) — Atlas reuses ``channels/telegram`` outbound send;
- Plaid Sandbox: direct API (REST + JSON, official client optional).

Each spec carries ``read_only`` so smoke tests and policy can distinguish
probe operations from approval-gated writes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from nanobot.atlas.contracts import ConnectorCapability

ConnectorName = Literal["serpapi", "google_tasks", "gmail", "plaid", "telegram"]


@dataclass(frozen=True)
class ConnectorSpec:
    """Declarative metadata for one real connector."""

    name: str
    env_vars: tuple[str, ...]  # required credential/config env vars
    flag_var: str  # env var that must be "1/true/yes/on" to enable
    required_scopes: tuple[str, ...]  # OAuth scopes (empty for API-key providers)
    capabilities: frozenset[ConnectorCapability]
    read_only: bool  # True = has only read operations (smoke-testable safely)
    mcp_mode: bool  # True = integrate via repository MCP support instead of direct API
    docs_url: str
    smoke_hint: str  # what a successful smoke test should observe
    # Narrower read-only scopes where the provider offers them (declared after
    # non-default fields because this dataclass is frozen).
    readonly_scopes: tuple[str, ...] = ()


SPECS: dict[str, ConnectorSpec] = {
    "serpapi": ConnectorSpec(
        name="serpapi",
        env_vars=("ATLAS_SERPAPI_API_KEY",),
        flag_var="ATLAS_ENABLE_SERPAPI",
        required_scopes=(),
        capabilities=frozenset({ConnectorCapability.READ_PUBLIC_DATA}),
        read_only=True,
        mcp_mode=False,
        docs_url="https://serpapi.com/search-api",
        smoke_hint="GET https://serpapi.com/search with api_key returns JSON with 'shopping' or 'organic_results'",
    ),
    "google_tasks": ConnectorSpec(
        name="google_tasks",
        env_vars=("ATLAS_GOOGLE_CLIENT_ID", "ATLAS_GOOGLE_CLIENT_SECRET", "ATLAS_GOOGLE_REFRESH_TOKEN"),
        flag_var="ATLAS_ENABLE_GOOGLE_TASKS",
        # Demo READ path uses tasks.readonly; the full tasks scope is required
        # only for the later approval-gated create/update stage.
        required_scopes=("https://www.googleapis.com/auth/tasks",),
        readonly_scopes=("https://www.googleapis.com/auth/tasks.readonly",),
        capabilities=frozenset({ConnectorCapability.READ_USER_DATA, ConnectorCapability.WRITE_USER_DATA}),
        read_only=False,
        mcp_mode=False,
        docs_url="https://developers.google.com/tasks/reference/rest",
        smoke_hint="tasks.list on the default tasklist returns 200 with a 'items' array",
    ),
    "gmail": ConnectorSpec(
        name="gmail",
        env_vars=("ATLAS_GOOGLE_CLIENT_ID", "ATLAS_GOOGLE_CLIENT_SECRET", "ATLAS_GOOGLE_REFRESH_TOKEN"),
        flag_var="ATLAS_ENABLE_GMAIL",
        required_scopes=("https://www.googleapis.com/auth/gmail.compose",),
        capabilities=frozenset({ConnectorCapability.WRITE_USER_DATA}),
        read_only=False,
        mcp_mode=False,
        docs_url="https://developers.google.com/gmail/api/reference/rest",
        smoke_hint="gmail.users.drafts.create returns a draft resource with an 'id' (never sends)",
    ),
    "plaid": ConnectorSpec(
        name="plaid",
        env_vars=("ATLAS_PLAID_CLIENT_ID", "ATLAS_PLAID_SECRET", "ATLAS_PLAID_ACCESS_TOKEN"),
        flag_var="ATLAS_ENABLE_PLAID",
        required_scopes=(),
        capabilities=frozenset({ConnectorCapability.READ_USER_DATA}),
        read_only=True,
        mcp_mode=False,
        docs_url="https://plaid.com/docs/api/sandbox/",
        smoke_hint="/transactions/get on a Sandbox item returns transactions with is_sandbox labeling",
    ),
    "telegram": ConnectorSpec(
        name="telegram",
        env_vars=("TELEGRAM_BOT_TOKEN",),  # reuses the existing channel's credential
        flag_var="ATLAS_ENABLE_TELEGRAM_DELIVERY",
        required_scopes=(),
        capabilities=frozenset({ConnectorCapability.SEND_COMMUNICATION}),
        read_only=False,
        mcp_mode=False,
        docs_url="https://core.telegram.org/bots/api#sendmessage",
        smoke_hint="bot getMe returns the bot identity; sendMessage reaches the server-derived chat",
    ),
}


def _flag_enabled(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def is_connector_enabled(name: str, *, env: dict[str, str] | None = None) -> bool:
    """Feature-flag check: flag on AND all required env vars non-empty."""
    spec = SPECS.get(name)
    if spec is None:
        return False
    source = env if env is not None else dict(os.environ)
    if not _flag_enabled(source.get(spec.flag_var)):
        return False
    return all(source.get(var, "").strip() for var in spec.env_vars)


def connector_config_from_env(name: str, *, env: dict[str, str] | None = None) -> dict[str, str]:
    """Read a connector's credential env vars into a bounded config dict.

    Values are for adapter use only: never logged, never persisted into Atlas
    records, never placed in prompts or tool arguments.
    """
    spec = SPECS.get(name)
    if spec is None:
        return {}
    source = env if env is not None else dict(os.environ)
    return {var: source.get(var, "").strip() for var in spec.env_vars}


def configured_connectors(
    *, env: dict[str, str] | None = None
) -> list[ConnectorSpec]:
    """Return specs for every connector currently enabled by flag+credentials."""
    return [spec for name in SPECS if is_connector_enabled(name, env=env) for spec in [SPECS[name]]]


def resolve_connector_spec(name: str) -> ConnectorSpec | None:
    return SPECS.get(name)


# Shareable OAuth setup notes for the report / docs (no secrets here).
OAUTH_NOTES: dict[str, str] = {
    "google_tasks": (
        "Google Cloud OAuth client (Desktop or Web). Refresh token obtained once via "
        "installed-app flow with scope https://www.googleapis.com/auth/tasks; stored as "
        "ATLAS_GOOGLE_REFRESH_TOKEN env var, never in Atlas records."
    ),
    "gmail": (
        "Same Google client as google_tasks; refresh token must include scope "
        "https://www.googleapis.com/auth/gmail.compose (draft creation only — gmail.send "
        "is intentionally NOT requested at this stage)."
    ),
}


__all__ = [
    "ConnectorSpec",
    "OAUTH_NOTES",
    "SPECS",
    "configured_connectors",
    "connector_config_from_env",
    "is_connector_enabled",
    "resolve_connector_spec",
]
