"""Atlas Stage 1 live smoke: real Strands Agent + real tool call (Groq first).

Exit criteria proven here (and only here is Stage 1 claimed complete):
  1. ``strands`` imports successfully;
  2. a REAL ``strands.Agent`` is constructed with a REAL free-tier model;
  3. the agent executes and the deterministic local typed read-only tool
     ``atlas_stage1_lookup`` is actually called THROUGH Strands;
  4. the result is validated with Atlas types and a no-secrets run record is
     printed (provider, model, tool, stop reason, tool-call evidence).

Credentials are read from the environment and ``.env.local`` (key names are
printed, values never are). No connectors, delivery, MCP, or background jobs.

Run:
    uv run --no-sync python scripts/atlas_stage1_smoke.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from nanobot.atlas.stage1 import (  # noqa: E402
    _DEMO_KEY,
    atlas_stage1_lookup,
    validate_stage1_result,
)

ENV_FILE = REPO_ROOT / ".env.local"


def load_env_file(path: Path) -> list[str]:
    """Load KEY=VALUE lines into os.environ; return the key NAMES loaded.

    Values are never logged, returned, or echoed anywhere.
    """
    loaded: list[str] = []
    if not path.exists():
        return loaded
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
            loaded.append(key)
    return loaded


def _secret_env(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def build_model() -> tuple[str, str, object]:
    """Build the free-tier model handle. Groq first; Gemini explicit alternative.

    Returns (provider, model_id, strands model). Raises RuntimeError with a
    bounded message when the selected provider has no credential.
    """
    from strands.models.openai import OpenAIModel  # official Strands OpenAI-compatible model

    provider = (os.getenv("ATLAS_MODEL_PROVIDER", "groq") or "groq").strip().lower()
    # Default verified live against Groq /v1/models on 2026-09-10:
    # llama-3.3-70b-versatile was removed; gpt-oss-120b is the current free
    # tool-calling chat model.
    model_id = os.getenv("ATLAS_MODEL_ID", "").strip() or (
        "openai/gpt-oss-120b" if provider == "groq" else "gemini-2.0-flash"
    )

    if provider == "groq":
        api_key = _secret_env("GROQ_API_KEY", "ATLAS_GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("not_configured: groq selected but GROQ_API_KEY is not set")
        model = OpenAIModel(
            client_args={
                "api_key": api_key,
                "base_url": os.getenv("ATLAS_GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
                "timeout": 30.0,
                "max_retries": 1,
            },
            model_id=model_id,
            params={"max_tokens": 1024, "temperature": 0.2},
        )
        return "groq", model_id, model

    if provider == "gemini":
        api_key = _secret_env("GEMINI_API_KEY", "ATLAS_GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "not_configured: gemini selected but GEMINI_API_KEY is not set"
            )
        from strands.models.gemini import GeminiModel

        model = GeminiModel(model_id=model_id, client_args={"api_key": api_key})
        return "gemini", model_id, model

    raise RuntimeError(f"not_configured: unknown ATLAS_MODEL_PROVIDER {provider!r}")


def _bounded_error(exc: BaseException) -> str:
    """Bounded, secret-free error text: exception type + short message."""
    text = f"{type(exc).__name__}: {exc}"
    cleaned = text.replace(os.getenv("GROQ_API_KEY", "\x00"), "[redacted]")
    cleaned = cleaned.replace(os.getenv("GEMINI_API_KEY", "\x00"), "[redacted]")
    return cleaned[:400]


async def run_stage1() -> int:
    loaded_names = load_env_file(ENV_FILE)
    print(f"[env] loaded key names from .env.local: {sorted(loaded_names)}")

    try:
        import strands  # noqa: F401 - the Stage 1 import gate

        provider, model_id, model = build_model()
    except Exception as exc:  # noqa: BLE001
        print(f"[fail] {_bounded_error(exc)}")
        return 1

    print(f"[model] provider={provider} model={model_id} (no secrets)")

    from strands import Agent
    from strands import tool as strands_tool  # official decorator -> tool_spec

    # The ONE deterministic local typed read-only tool, wrapped with the
    # official Strands decorator (plain functions are not valid tool specs).
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

    print("[run] invoking real Strands Agent (async)...")
    try:
        result = await agent.invoke_async(
            f"Look up the local Atlas record for key {_DEMO_KEY}."
        )
    except Exception as exc:  # noqa: BLE001 - provider SDKs raise many types
        print(f"[fail] model call failed: {_bounded_error(exc)}")
        return 1

    try:
        record = validate_stage1_result(
            atlas_stage1_lookup(_DEMO_KEY),
            result,
            provider=provider,
            model_id=model_id,
            user_id=os.getenv("ATLAS_DEMO_USER_ID", "stage1-demo"),
        )
    except ValueError as exc:
        print(f"[fail] {exc}")
        return 1

    print("[record] " + record.to_json())
    stop_reason = str(getattr(result, "stop_reason", ""))
    print(f"[stop_reason] {stop_reason}")
    answer = str(getattr(getattr(result, "message", None), "content", "") )[:400]
    print(f"[answer-preview] {answer}")

    if not record.agent_executed or not record.tool_call_executed:
        print("[fail] Stage 1 exit criteria NOT met (no real tool call through Strands)")
        return 1

    print("[pass] Stage 1: real Strands Agent executed; tool called through Strands; "
          "result validated with Atlas types")
    return 0


def _make_console_unicode_safe() -> None:
    """Windows consoles default to legacy codepages; model text is UTF-8.

    Reconfigure stdout/stderr so streamed model text (any Unicode) prints with
    replacement instead of raising UnicodeEncodeError inside the agent loop.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


def main() -> int:
    _make_console_unicode_safe()
    try:
        return asyncio.run(run_stage1())
    except KeyboardInterrupt:  # pragma: no cover
        print("[fail] interrupted")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
