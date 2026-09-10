"""Stage 1 live smoke test: real Strands Agent + real tool call (Groq first).

Env-gated: runs ONLY when ``ATLAS_ENABLE_GROQ_SMOKE=true`` (or ``yes/on/1``)
and ``GROQ_API_KEY``/``ATLAS_GROQ_API_KEY`` are present; otherwise SKIPs with
the exact reason. Mirrors ``scripts/atlas_stage1_smoke.py`` so a live run is
reproducible from pytest. Asserts the Stage 1 exit criteria: Strands imports,
a real Agent executes, the tool is called through Strands, and the result
validates against Atlas types. Read-only; no writes anywhere.
"""

from __future__ import annotations

import os

import pytest

pytestmark = pytest.mark.atlas_smoke


def _smoke_enabled() -> bool:
    flag = os.getenv("ATLAS_ENABLE_GROQ_SMOKE", "").strip().lower()
    key = os.getenv("GROQ_API_KEY", os.getenv("ATLAS_GROQ_API_KEY", "")).strip()
    return flag in {"1", "true", "yes", "on"} and bool(key)


@pytest.mark.skipif(
    not _smoke_enabled(),
    reason=(
        "Stage 1 live smoke skipped: set ATLAS_ENABLE_GROQ_SMOKE=true and "
        "GROQ_API_KEY (or ATLAS_GROQ_API_KEY) to enable"
    ),
)
@pytest.mark.asyncio
async def test_stage1_real_strands_agent_and_tool_call(monkeypatch: pytest.MonkeyPatch) -> None:
    """Real Strands Agent executes and calls the tool through Strands."""
    # Import the smoke script as a module (no repo-root sys.path games here).
    import importlib.util
    from pathlib import Path

    script = Path(__file__).resolve().parents[2] / "scripts" / "atlas_stage1_smoke.py"
    assert script.exists(), f"smoke script missing: {script}"
    spec = importlib.util.spec_from_file_location("atlas_stage1_smoke", script)
    assert spec is not None and spec.loader is not None
    smoke = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(smoke)

    # Load .env.local if present (names only are ever logged).
    smoke.load_env_file(script.parents[1] / ".env.local")
    assert smoke._secret_env("GROQ_API_KEY", "ATLAS_GROQ_API_KEY"), (
        "GROQ credential disappeared between gate and run"
    )

    # Build the real model (Groq first), then run the real chain once.
    provider, model_id, model = smoke.build_model()
    assert provider == "groq", "Groq-first order violated"

    from strands import Agent
    from strands import tool as strands_tool

    from nanobot.atlas.stage1 import _DEMO_KEY, atlas_stage1_lookup, validate_stage1_result

    agent_tool = strands_tool(atlas_stage1_lookup)

    agent = Agent(
        model=model,
        tools=[agent_tool],
        system_prompt=(
            "You are the Atlas Stage 1 smoke agent. Call the tool "
            f"atlas_stage1_lookup with key {_DEMO_KEY}, then summarize the "
            "returned record in one short sentence. Do not invent data."
        ),
        load_tools_from_directory=False,
    )
    result = await agent.invoke_async(
        f"Look up the local Atlas record for key {_DEMO_KEY}."
    )

    record = validate_stage1_result(
        atlas_stage1_lookup(_DEMO_KEY),
        result,
        provider=provider,
        model_id=model_id,
        user_id=os.getenv("ATLAS_DEMO_USER_ID", "stage1-demo"),
    )
    assert record.agent_executed is True
    assert record.tool_call_executed is True
    assert record.atlas_validated is True
    assert record.stop_reason  # bounded, non-empty
    assert record.tool_call_count >= 1
    assert record.provider == "groq"
