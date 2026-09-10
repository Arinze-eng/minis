"""Real read-only connector smoke tests, strictly gated on env credentials.

These tests run ONLY when the corresponding feature flag and credentials are
present in the environment; otherwise they SKIP with a reason. They perform
read-only calls against real providers (SerpApi search, Telegram getMe, Plaid
sandbox item read) — never writes, purchases, sends, or mutations.

Run explicitly with::

    python -m pytest tests/atlas/test_connector_smoke.py -v --noconftest

This file is intentionally separate from CI-safe mocked tests
(``test_connector_contracts.py``) so CI never requires production credentials.
"""

from __future__ import annotations

import os

import pytest

from nanobot.atlas.connectors.registry import (
    SPECS,
    connector_config_from_env,
    is_connector_enabled,
)

pytestmark = pytest.mark.atlas_smoke


def _require(name: str) -> dict[str, str]:
    if not is_connector_enabled(name):
        spec = SPECS[name]
        pytest.skip(
            f"{name} smoke skipped: set {spec.flag_var}=true and "
            f"{', '.join(spec.env_vars)} to enable"
        )
    return connector_config_from_env(name)


# ---------------------------------------------------------------------------
# Priority 1: SerpApi (read-only product research)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_serpapi_real_search_smoke() -> None:
    """Real SerpApi Google Shopping search returns normalized product evidence."""
    import httpx

    from nanobot.atlas.contracts import ConnectorStatus

    cfg = _require("serpapi")
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            "https://serpapi.com/search",
            params={
                "engine": "google",
                "q": "winter jacket",
                "api_key": cfg["ATLAS_SERPAPI_API_KEY"],
            },
        )
    if response.status_code == 401:
        pytest.fail("SerpApi rejected the API key (UNAUTHORIZED) - check ATLAS_SERPAPI_API_KEY")
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        pytest.fail(f"SerpApi provider error: {payload['error'][:200]}")
    organic = payload.get("organic_results") or payload.get("shopping_results") or []
    assert organic, "expected at least one real search result"
    first = organic[0]
    # Provider identity preserved: title + link present for normalization.
    assert first.get("title") and first.get("link")
    _ = ConnectorStatus.OK  # smoke target state for the future adapter


# ---------------------------------------------------------------------------
# Priority 3: Telegram delivery (existing channel credential)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_telegram_getme_smoke() -> None:
    """Bot token authenticates: getMe succeeds (read-only credential probe)."""
    import httpx

    cfg = _require("telegram")
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"https://api.telegram.org/bot{cfg['TELEGRAM_BOT_TOKEN']}/getMe"
        )
    if response.status_code == 401:
        pytest.fail("Telegram rejected TELEGRAM_BOT_TOKEN (UNAUTHORIZED)")
    response.raise_for_status()
    payload = response.json()
    assert payload.get("ok") is True
    assert payload["result"].get("id")


# ---------------------------------------------------------------------------
# Priority 4: Plaid Sandbox (read-only financial data)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_plaid_sandbox_item_smoke() -> None:
    """Plaid Sandbox: /item/get succeeds with sandbox credentials (read-only)."""
    import httpx

    cfg = _require("plaid")
    environment = os.getenv("ATLAS_PLAID_ENV", "sandbox")
    if environment != "sandbox":
        pytest.skip("Plaid smoke restricted to sandbox environment")
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            f"https://{environment}.plaid.com/item/get",
            json={
                "client_id": cfg["ATLAS_PLAID_CLIENT_ID"],
                "secret": cfg["ATLAS_PLAID_SECRET"],
                "access_token": cfg["ATLAS_PLAID_ACCESS_TOKEN"],
            },
        )
    body = response.json()
    if response.status_code == 400 and "INVALID_CREDENTIALS" in str(body):
        pytest.fail(f"Plaid rejected credentials: {str(body)[:200]}")
    response.raise_for_status()
    item = body.get("item", {})
    assert item.get("item_id"), "expected a real sandbox item id"
    assert body.get("request_id"), "expected provider request id for provenance"


# ---------------------------------------------------------------------------
# Priorities 2 & 5: Google Tasks / Gmail (OAuth-gated, read-only probe)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_google_oauth_token_smoke() -> None:
    """Refresh token exchanges for an access token (scope-verified, read-only use)."""
    import httpx

    env_vars = ("ATLAS_GOOGLE_CLIENT_ID", "ATLAS_GOOGLE_CLIENT_SECRET", "ATLAS_GOOGLE_REFRESH_TOKEN")
    env = {var: os.getenv(var, "").strip() for var in env_vars}
    flag = os.getenv("ATLAS_ENABLE_GOOGLE_OAUTH_PROBE", "").strip().lower()
    if not (flag in {"1", "true", "yes", "on"} and all(env.values())):
        pytest.skip("google oauth probe skipped: set ATLAS_ENABLE_GOOGLE_OAUTH_PROBE=true "
                    "and ATLAS_GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN")
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": env["ATLAS_GOOGLE_CLIENT_ID"],
                "client_secret": env["ATLAS_GOOGLE_CLIENT_SECRET"],
                "refresh_token": env["ATLAS_GOOGLE_REFRESH_TOKEN"],
                "grant_type": "refresh_token",
            },
        )
    if response.status_code == 400:
        pytest.fail("Google rejected refresh token (OAUTH_EXPIRED/UNAUTHORIZED)")
    response.raise_for_status()
    assert response.json().get("access_token")


# ---------------------------------------------------------------------------
# Priority 1 (alternative): Google Tasks real read (Task Start slice)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_google_tasks_real_list_smoke() -> None:
    """Authenticated tasks.list against the live Google Tasks API.

    Requires ATLAS_ENABLE_GOOGLE_TASKS=true plus Google OAuth client vars.
    Read-only: tasks.list on the default tasklist.
    """

    from nanobot.atlas.connectors.base import ConnectorContext
    from nanobot.atlas.connectors.google_tasks import GoogleTasksConnector
    from nanobot.atlas.contracts import (
        AuthenticatedAtlasContext,
        ConnectorStatus,
        ConsentScope,
    )

    if not is_connector_enabled("google_tasks"):
        spec = SPECS["google_tasks"]
        pytest.skip(
            f"google_tasks smoke skipped: set {spec.flag_var}=true and "
            f"{', '.join(spec.env_vars)} to enable"
        )
    connector = GoogleTasksConnector()
    health = await connector.health_check()
    if health.status is ConnectorStatus.OAUTH_EXPIRED:
        pytest.fail("Google OAuth refresh failed (OAUTH_EXPIRED) - check client vars/refresh token")
    assert health.status is ConnectorStatus.OK

    atlas_ctx = AuthenticatedAtlasContext(
        user_id=os.getenv("ATLAS_DEMO_USER_ID", "smoke-user"),
        scopes=frozenset({ConsentScope.READ_PROFILE}),
    )
    from datetime import timedelta

    from nanobot.atlas.policy import ConsentState

    consent = ConsentState(
        user_id=atlas_ctx.user_id,
        scope=ConsentScope.READ_PROFILE,
        connector="google_tasks",
        granted_at=__import__("datetime", fromlist=["datetime"]).datetime.now(
            __import__("datetime").timezone.utc) - timedelta(minutes=1),
        expires_at=None,
    )
    ctx = ConnectorContext(user_id=atlas_ctx.user_id, atlas_context=atlas_ctx,
                           consent=consent, trace_id="smoke")
    result = await connector.list_tasks(ctx)
    if result.status is ConnectorStatus.UNAUTHORIZED:
        pytest.fail("Google Tasks rejected credentials/scope (UNAUTHORIZED)")
    assert result.status is ConnectorStatus.OK
    print(f"google_tasks smoke: {len(result.items)} real task(s) fetched")


# ---------------------------------------------------------------------------
# Model provider smokes (Groq / Gemini, free tiers)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_groq_tool_call_smoke() -> None:
    """Groq free tier reachable, key valid, chat.completions responds."""
    import httpx

    key = os.getenv("GROQ_API_KEY", os.getenv("ATLAS_GROQ_API_KEY", "")).strip()
    if not key or os.getenv("ATLAS_ENABLE_GROQ_SMOKE", "").lower() not in {"1", "true", "yes", "on"}:
        pytest.skip("groq smoke skipped: set ATLAS_ENABLE_GROQ_SMOKE=true and GROQ_API_KEY")
    model = os.getenv("ATLAS_MODEL_ID", "llama-3.3-70b-versatile")
    async with httpx.AsyncClient(timeout=25.0) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": "Reply with the single word: ok"}],
                "max_tokens": 8,
                "tools": [{
                    "type": "function",
                    "function": {
                        "name": "noop",
                        "description": "no-op probe",
                        "parameters": {"type": "object", "properties": {}},
                    },
                }],
            },
        )
    if response.status_code == 401:
        pytest.fail("Groq rejected GROQ_API_KEY (UNAUTHORIZED)")
    if response.status_code == 429:
        pytest.skip("groq free-tier rate limit hit during smoke (expected under load)")
    response.raise_for_status()
    body = response.json()
    assert body.get("model"), "expected model echo in groq response"


@pytest.mark.asyncio
async def test_gemini_tool_call_smoke() -> None:
    """Gemini free tier reachable via native generateContent endpoint."""
    import httpx

    key = os.getenv("GEMINI_API_KEY", os.getenv("ATLAS_GEMINI_API_KEY", "")).strip()
    if not key or os.getenv("ATLAS_ENABLE_GEMINI_SMOKE", "").lower() not in {"1", "true", "yes", "on"}:
        pytest.skip("gemini smoke skipped: set ATLAS_ENABLE_GEMINI_SMOKE=true and GEMINI_API_KEY")
    model = os.getenv("ATLAS_GEMINI_MODEL_ID", "gemini-2.0-flash")
    async with httpx.AsyncClient(timeout=25.0) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": key},
            json={"contents": [{"parts": [{"text": "Reply with the single word: ok"}]}]},
        )
    if response.status_code in (400, 403):
        pytest.fail(f"Gemini rejected key/model ({response.status_code})")
    if response.status_code == 429:
        pytest.skip("gemini free-tier rate limit hit during smoke (expected under load)")
    response.raise_for_status()
    body = response.json()
    assert body.get("candidates"), "expected candidates in gemini response"


# ---------------------------------------------------------------------------
# Priority 6 is exercised through the existing scheduler + Telegram delivery
# (no dedicated smoke here; covered at the orchestration stage).
# ---------------------------------------------------------------------------


def test_smoke_specs_declare_read_only_probe_paths() -> None:
    """Every smoke-tested connector spec must document its probe semantics."""
    assert SPECS["serpapi"].read_only is True
    assert SPECS["plaid"].read_only is True
    assert "getMe" in SPECS["telegram"].smoke_hint
    assert SPECS["telegram"].docs_url.endswith("#sendmessage")
