"""Provider-neutral Atlas model factory for Strands-backed orchestration.

Builds a Strands ``Model`` from environment configuration without embedding
provider logic in Atlas contracts, policy, or connectors. Free providers only:

- ``groq``   : OpenAI-compatible endpoint through ``strands.models.openai.OpenAIModel``
               (free tier, no credit card, ~30 RPM / 6k TPM — VERIFY LIVE);
- ``gemini`` : native ``strands.models.gemini.GeminiModel`` (Google AI Studio free tier).

Guarantees:
- credentials are read only from environment variables;
- ``describe()`` exposes provider/model names without secrets;
- request/token budgets are enforced per run (cheap, deterministic guard);
- rate limits (429) and provider outages map to explicit Atlas states;
- there is NO paid fallback: an unavailable provider raises a bounded error
  rather than silently switching providers.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Literal

from nanobot.atlas.contracts import ConnectorStatus


class AtlasModelUnavailableError(RuntimeError):
    """Bounded error when no free model provider is configured/available."""

    def __init__(self, status: ConnectorStatus, detail: str) -> None:
        super().__init__(f"{status.value}: {detail}")
        self.status = status
        self.detail = detail[:500]


# Backward-compatible alias (early-stage import sites).
AtlasModelUnavailable = AtlasModelUnavailableError


@dataclass(frozen=True)
class ModelBudget:
    """Per-run budget guard enforced by the chain (not by the provider)."""

    max_model_requests: int = 4
    max_tokens: int = 8_000

    @classmethod
    def from_env(cls) -> "ModelBudget":
        def _int(var: str, default: int) -> int:
            raw = os.getenv(var, "").strip()
            if not raw.isdigit():
                return default
            return max(1, int(raw))

        return cls(
            max_model_requests=_int("ATLAS_MAX_MODEL_REQUESTS_PER_RUN", 4),
            max_tokens=_int("ATLAS_MAX_TOKENS_PER_RUN", 8_000),
        )


@dataclass(frozen=True)
class ModelHandle:
    """A configured Strands model plus redacted metadata.

    ``atlas_context`` carries the server-verified authenticated context so the
    chain's policy gate can run without re-resolving identity. It is optional
    here only because the factory can be used for pure model smoke tests.
    """

    provider: Literal["groq", "gemini"]
    model_id: str
    model: Any  # strands Model; typed loosely so strands stays an optional extra
    budget: ModelBudget
    atlas_context: Any = None  # AuthenticatedAtlasContext when chain-bound

    def describe(self) -> dict[str, str]:
        """Redacted provider/model info — never contains credentials."""
        return {"provider": self.provider, "model": self.model_id}


def _env(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def _build_groq(api_key: str, model_id: str, timeout: float) -> Any:
    from strands.models.openai import OpenAIModel

    return OpenAIModel(
        client_args={
            "api_key": api_key,
            "base_url": os.getenv("ATLAS_GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
            "timeout": timeout,
            "max_retries": 1,
        },
        model_id=model_id,
        params={"max_tokens": 1024, "temperature": 0.2},
    )


def _build_gemini(api_key: str, model_id: str) -> Any:
    from strands.models.gemini import GeminiModel

    return GeminiModel(
        model_id=model_id,
        client_args={"api_key": api_key},
    )


def _env_lookup(env: dict[str, str] | None) -> Any:
    """Return an getenv-like lookup honoring an explicit env dict (tests)."""
    if env is None:
        return os.getenv
    return lambda key, default="": env.get(key, default)


def create_atlas_model(
    *,
    provider: str | None = None,
    env: dict[str, str] | None = None,
) -> ModelHandle:
    """Build the configured free model handle; raises :class:`AtlasModelUnavailableError`
    (status ``not_configured``) when the requested provider has no credentials."""
    lookup = _env_lookup(env)
    chosen = (provider or lookup("ATLAS_MODEL_PROVIDER", "")).strip().lower() or "groq"
    budget = ModelBudget.from_env()
    timeout_raw = str(lookup("ATLAS_MODEL_TIMEOUT_SECONDS", "20")).strip()
    timeout = float(timeout_raw) if timeout_raw.replace(".", "", 1).isdigit() else 20.0

    if chosen == "groq":
        api_key = lookup("GROQ_API_KEY", "") or lookup("ATLAS_GROQ_API_KEY", "")
        if not api_key:
            raise AtlasModelUnavailableError(
                ConnectorStatus.NOT_CONFIGURED,
                "groq selected but GROQ_API_KEY/ATLAS_GROQ_API_KEY is not set",
            )
        model_id = lookup("ATLAS_MODEL_ID", "") or "llama-3.3-70b-versatile"
        return ModelHandle(
            provider="groq", model_id=model_id,
            model=_build_groq(api_key, model_id, timeout), budget=budget,
        )

    if chosen == "gemini":
        api_key = lookup("GEMINI_API_KEY", "") or lookup("ATLAS_GEMINI_API_KEY", "")
        if not api_key:
            raise AtlasModelUnavailableError(
                ConnectorStatus.NOT_CONFIGURED,
                "gemini selected but GEMINI_API_KEY/ATLAS_GEMINI_API_KEY is not set",
            )
        model_id = lookup("ATLAS_MODEL_ID", "") or "gemini-2.0-flash"
        return ModelHandle(
            provider="gemini", model_id=model_id,
            model=_build_gemini(api_key, model_id), budget=budget,
        )

    raise AtlasModelUnavailableError(
        ConnectorStatus.NOT_CONFIGURED,
        f"unknown ATLAS_MODEL_PROVIDER {chosen!r} (supported: groq, gemini)",
    )


def describe_model_configuration() -> dict[str, str]:
    """Redacted view of which provider WOULD be used (for diagnostics/UX)."""
    try:
        return create_atlas_model().describe()
    except AtlasModelUnavailableError as exc:
        return {"provider": "unconfigured", "model": "", "reason": exc.status.value}


__all__ = [
    "AtlasModelUnavailable",
    "AtlasModelUnavailableError",
    "ModelBudget",
    "ModelHandle",
    "create_atlas_model",
    "describe_model_configuration",
]
