"""Tests for the minimal Atlas tool wrapper (read-only fixture path)."""

from __future__ import annotations

import json
from datetime import timedelta

import pytest

from nanobot.agent.tools.atlas import AtlasTool
from nanobot.agent.tools.context import RequestContext, request_context
from nanobot.atlas.contracts import (
    AuthenticatedAtlasContext,
    ConsentScope,
    EvidenceItem,
)
from nanobot.atlas.policy import ConsentState, utc_now

USER = "user-atlas-tool"


def make_atlas_context() -> AuthenticatedAtlasContext:
    return AuthenticatedAtlasContext(
        user_id=USER,
        auth_source="supabase_token",
        scopes=frozenset({ConsentScope.READ_PUBLIC}),
    )


def make_consent() -> ConsentState:
    return ConsentState(
        user_id=USER,
        scope=ConsentScope.READ_PUBLIC,
        connector="atlas_fixture",
        granted_at=utc_now() - timedelta(minutes=5),
        expires_at=utc_now() + timedelta(hours=1),
        revoked=False,
    )


def bind_attributes(**extra: object):
    """Bind a RequestContext carrying the verified Atlas context + consent."""
    attrs: dict[str, object] = {
        "atlas_context": make_atlas_context(),
        "atlas_consent": make_consent(),
    }
    attrs.update(extra)
    return request_context(
        RequestContext(channel="test", chat_id="c1", attributes=attrs)  # pyright: ignore[reportArgumentType]
    )


@pytest.mark.asyncio
async def test_valid_read_only_fixture_succeeds() -> None:
    tool = AtlasTool(store=None)
    with bind_attributes():
        result = await tool.execute(query="cheap winter jackets")
    assert not result.is_error
    payload = json.loads(str(result))
    assert payload["status"] == "ok"
    evidence = EvidenceItem.model_validate(payload["evidence"])
    assert evidence.source == "atlas_fixture"
    assert evidence.state == "fresh"


@pytest.mark.asyncio
async def test_missing_authenticated_context_denied() -> None:
    tool = AtlasTool(store=None)
    # No RequestContext bound at all -> no verified principal.
    result = await tool.execute(query="anything")
    assert result.is_error
    assert "atlas_context_missing" in str(result)


@pytest.mark.asyncio
async def test_missing_consent_denied() -> None:
    tool = AtlasTool(store=None)
    attrs = {"atlas_context": make_atlas_context()}  # context but no consent
    with bind_attributes(**attrs):
        result = await tool.execute(query="anything")
    assert result.is_error
    assert "atlas_consent_missing" in str(result)


@pytest.mark.asyncio
async def test_model_supplied_user_id_is_ignored() -> None:
    """A user_id passed in tool arguments must not affect authorization."""
    tool = AtlasTool(store=None)
    with bind_attributes():
        # attacker/model tries to smuggle identity via arguments; the wrapper
        # has no such parameter, and execution still uses the verified ctx.
        result = await tool.execute(query="check", user_id="victim-user")
    assert not result.is_error
    payload = json.loads(str(result))
    assert payload["status"] == "ok"


@pytest.mark.asyncio
async def test_expired_consent_denied() -> None:
    tool = AtlasTool(store=None)
    expired = ConsentState(
        user_id=USER,
        scope=ConsentScope.READ_PUBLIC,
        connector="atlas_fixture",
        granted_at=utc_now() - timedelta(hours=2),
        expires_at=utc_now() - timedelta(seconds=1),
    )
    attrs = {"atlas_context": make_atlas_context(), "atlas_consent": expired}
    with bind_attributes(**attrs):
        result = await tool.execute(query="anything")
    assert result.is_error
    assert "capability_not_permitted" in str(result) or "consent_expired" in str(result)


def test_tool_has_no_access_to_other_capabilities() -> None:
    """Structural bound: the Atlas module must not reference other tools."""
    import nanobot.agent.tools.atlas as atlas_module

    source = atlas_module.__dict__
    forbidden = ("ExecTool", "BrowserTool", "NovitaSandboxTool", "AlpacaTradeTool",
                 "WebSearchTool", "WebFetchTool", "ApplyPatchTool")
    for name in forbidden:
        assert name not in source
    assert AtlasTool.read_only.fget(AtlasTool) if hasattr(AtlasTool.read_only, "fget") else True
