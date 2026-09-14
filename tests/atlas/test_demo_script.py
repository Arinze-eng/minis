"""CI-safe tests for the live demo script (``scripts/atlas_demo.py``).

Covers the script's logic without network or real credentials: scenario
routing, consent granting, fallback hint mapping, and the run() exit-code
taxonomy when connectors/models are unconfigured (the provider-unavailable
fallback shown explicitly). The live path itself is env-gated and skipped in
CI, mirroring the stage1 smoke test.
"""

from __future__ import annotations

import importlib.util
import os
from datetime import timedelta
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

from nanobot.atlas.contracts import ConsentScope, utc_now
from nanobot.atlas.policy import ConsentState
from nanobot.atlas.store import LocalAtlasStore

REPO_ROOT = Path(__file__).resolve().parents[2]
USER = "demo-user"


def _load_demo() -> ModuleType:
    """Import the demo script as a module (no repo-root sys.path games)."""
    script = REPO_ROOT / "scripts" / "atlas_demo.py"
    assert script.exists(), f"demo script missing: {script}"
    spec = importlib.util.spec_from_file_location("atlas_demo_script", script)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _isolated_store(tmp_path: Any) -> LocalAtlasStore:
    return LocalAtlasStore(root=Path(tmp_path) / "atlas-root")


def _consent(connector: str) -> ConsentState:
    return ConsentState(
        user_id=USER, scope=ConsentScope.READ_PROFILE, connector=connector,
        granted_at=utc_now() - timedelta(hours=1), expires_at=None, revoked=False,
    )


# ---------------------------------------------------------------------------
# Consent helper
# ---------------------------------------------------------------------------


def test_grant_consent_records_read_consent(tmp_path: Any) -> None:
    demo = _load_demo()
    store = _isolated_store(tmp_path)
    demo._grant_consent(USER, "google_tasks", store)
    assert store.get_consent(USER, "google_tasks") is not None


def test_grant_consent_idempotent(tmp_path: Any) -> None:
    demo = _load_demo()
    store = _isolated_store(tmp_path)
    demo._grant_consent(USER, "serpapi", store)
    first = store.get_consent(USER, "serpapi")
    demo._grant_consent(USER, "serpapi", store)
    second = store.get_consent(USER, "serpapi")
    assert first is not None and second is not None
    assert (first.connector, first.user_id, first.scope, first.granted_at) == (
        second.connector, second.user_id, second.scope, second.granted_at
    )


def test_grant_consent_serpapi_uses_public_scope(tmp_path: Any) -> None:
    demo = _load_demo()
    store = _isolated_store(tmp_path)
    demo._grant_consent(USER, "serpapi", store)
    consent = store.get_consent(USER, "serpapi")
    assert consent is not None and consent.scope is ConsentScope.READ_PUBLIC


# ---------------------------------------------------------------------------
# Fallback hints: every known reason code maps to an actionable hint
# ---------------------------------------------------------------------------


def test_fallback_hints_cover_service_reason_codes() -> None:
    demo = _load_demo()
    for reason in ("connector_disabled", "consent_missing", "model_unconfigured"):
        assert reason in demo._FALLBACK_HINTS
        assert demo._FALLBACK_HINTS[reason].strip()


# ---------------------------------------------------------------------------
# run(): exit-code taxonomy with everything unconfigured (no network)
# ---------------------------------------------------------------------------


async def test_run_returns_nonzero_when_connector_disabled(tmp_path: Any) -> None:
    """No env flags, no credentials -> NOT_CONFIGURED, exit 1, hint printed."""
    demo = _load_demo()
    code = await demo.run("task_start", USER, "q", as_json=False,
                          store=_isolated_store(tmp_path))
    assert code == 1


async def test_run_returns_zero_on_success(tmp_path: Any, monkeypatch: Any) -> None:
    """Wardrobe path with consent + stubbed model -> OK (exit 0)."""
    demo = _load_demo()
    store = _isolated_store(tmp_path)
    store.save_consent(USER, _consent("wardrobe_store"))
    from types import SimpleNamespace

    from nanobot.atlas.contracts import ConnectorStatus

    async def stub_chain(*_args: Any, **_kwargs: Any) -> Any:
        return SimpleNamespace(
            status=ConnectorStatus.OK,
            reason_code="ok",
            evidence=[object()],
            recommendation=SimpleNamespace(title="Plan outfit", rationale="use available garments"),
            provider_info={"provider": "groq", "model": "stub"},
        )

    monkeypatch.setattr("nanobot.atlas.service.create_atlas_model", lambda **_: _fake_handle())
    monkeypatch.setattr("nanobot.atlas.service.AtlasChain.run", stub_chain)
    code = await demo.run(
        "wardrobe_research", USER, "casual outfit", as_json=False, store=store
    )
    assert code == 0


def _fake_handle() -> Any:
    """Frozen-dataclass ModelHandle stand-in driving the chain's success path.

    Must be a real dataclass: the service attaches the verified context via
    ``dataclasses.replace(handle, atlas_context=...)``.
    """
    import dataclasses

    from nanobot.atlas.model_factory import ModelBudget

    @dataclasses.dataclass(frozen=True)
    class FakeHandle:
        provider: str = "groq"
        model_id: str = "openai/gpt-oss-120b"
        model: Any = None
        budget: Any = dataclasses.field(default_factory=ModelBudget)
        atlas_context: Any = None

        def describe(self) -> dict[str, str]:
            return {"provider": self.provider, "model": self.model_id}

    return FakeHandle()


# ---------------------------------------------------------------------------
# Live path (env-gated, skipped in CI)
# ---------------------------------------------------------------------------


def _live_enabled() -> bool:
    tasks_flag = os.getenv("ATLAS_ENABLE_GOOGLE_TASKS", "").strip().lower()
    creds = all(
        os.getenv(name, "").strip()
        for name in (
            "ATLAS_GOOGLE_CLIENT_ID", "ATLAS_GOOGLE_CLIENT_SECRET", "ATLAS_GOOGLE_REFRESH_TOKEN"
        )
    )
    model_key = bool(os.getenv("GROQ_API_KEY", os.getenv("ATLAS_GROQ_API_KEY", "")).strip())
    return tasks_flag in {"1", "true", "yes", "on"} and creds and model_key


@pytest.mark.skipif(
    not _live_enabled(),
    reason="live demo skipped: requires ATLAS_ENABLE_GOOGLE_TASKS=true, Google credentials, and GROQ_API_KEY",
)
async def test_live_demo_real_connector_and_model(tmp_path: Any) -> None:
    """Real Google Tasks read through the full service flow with Groq.

    Uses an isolated store with explicitly granted consent so the live read
    goes through the full policy gate (consent_missing would otherwise be the
    expected — and correct — denial for an unconsented test principal).
    """
    demo = _load_demo()
    store = _isolated_store(tmp_path)
    demo._grant_consent(USER, "google_tasks", store)
    code = await demo.run("task_start", USER, "what should I do next?",
                          as_json=True, store=store)
    assert code == 0
