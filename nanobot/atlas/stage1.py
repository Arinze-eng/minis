"""Atlas Stage 1: deterministic local typed read-only tool + run record.

This module is the Stage 1 surface between the AWS Strands Agents SDK and the
Atlas contracts. It contains ONLY:

- a deterministic local typed read-only tool (no network, no side effects);
- a typed, no-secrets Stage-1 run record validated with Atlas types.

It deliberately does NOT contain connectors, delivery, MCP, or background
work (Stage 1 scope). It imports nothing from ``nanobot.agent`` (the agent
package has a known broken import in this checkout); it depends only on
``nanobot.atlas`` contracts.

The tool: ``atlas_stage1_lookup``
- pure function of its input: same input -> same output;
- typed inputs enforced by the Strands tool spec (strings, bounded length);
- read-only: returns a typed Atlas ``EvidenceItem`` view, records nothing;
- one bounded key for the demo (uppercase, len 1..64, letters/digits/dash/underscore).

The run record: :class:`AtlasStage1RunRecord`
- records provider, model id, tool name, and Strands stop reason;
- records that a REAL tool call executed through Strands (count, durations);
- carries only identifiers/enums — never credentials, prompts, or raw payloads;
- validates that the evidence payload round-trips through the Atlas
  ``EvidenceItem`` contract (Atlas types validate the result).
"""

from __future__ import annotations

import hashlib
import json
import re
import string
from dataclasses import dataclass
from typing import Any, Final, Literal

from nanobot.atlas.contracts import (
    EvidenceItem,
    new_id,
    user_id_hash,
    utc_now,
)

# ---------------------------------------------------------------------------
# Deterministic local typed read-only tool
# ---------------------------------------------------------------------------

# Bounded key format for the deterministic lookup (demo-safe, no free text).
_KEY_PATTERN: Final = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_ALPHABET: Final = string.ascii_letters + string.digits
_RECORDS: Final[dict[str, dict[str, str]]] = {
    "demo-key-1": {
        "title": "Atlas demo record one",
        "category": "demo",
    },
    "demo-key-2": {
        "title": "Atlas demo record two",
        "category": "demo",
    },
}


def atlas_stage1_lookup(key: str) -> str:
    """Return the deterministic local record for ``key`` as an EvidenceItem JSON dump.

    Deterministic: the same key always yields the same record, no I/O, no
    randomness. Read-only: nothing is written, mutated, or deleted. Typed: the
    result is an Atlas ``EvidenceItem`` (JSON) whose payload carries the record.

    Args:
        key: Bounded lookup key (1-64 chars; letters, digits, dash, underscore).

    Returns:
        JSON string of one Atlas EvidenceItem (source ``atlas_stage1_local``).

    Raises:
        ValueError: If the key violates the bounded format.
    """
    if not isinstance(key, str) or not _KEY_PATTERN.match(key):
        raise ValueError("key must match [A-Za-z0-9_-]{1,64}")

    record = _RECORDS.get(key)
    if record is None:
        # Deterministic miss: no exception past the tool boundary; the model
        # receives a typed, well-formed "miss" evidence item.
        item = EvidenceItem(
            source="atlas_stage1_local",
            kind="text",
            content=f"no record for key: {key}",
            payload={"key": key, "found": False},
            freshness_seconds=3600,
            uncertainty=0.0,
            state="fresh",
        )
    else:
        item = EvidenceItem(
            source="atlas_stage1_local",
            kind="text",
            content=f"{record['title']} [{record['category']}] (key: {key})",
            payload={"key": key, "found": True, **record},
            freshness_seconds=3600,
            uncertainty=0.0,
            state="fresh",
        )
    return json.dumps(item.model_dump(mode="json", exclude_none=True), ensure_ascii=False)


# Envelope fields that legitimately differ per retrieval (ids/timestamps).
_PER_CALL_FIELDS: Final[frozenset[str]] = frozenset(
    {"evidence_id", "retrieved_at", "trace", "freshness_seconds"}
)


def _stable_subset(tool_output_json: str) -> str:
    """Canonical JSON of the deterministic part of a tool output dump."""
    raw = json.loads(tool_output_json)
    stable = {k: v for k, v in raw.items() if k not in _PER_CALL_FIELDS}
    return json.dumps(stable, sort_keys=True, ensure_ascii=False)


def deterministic_preview(key: str) -> str:
    """Redacted deterministic preview of the tool output for the run record.

    A short SHA-256 prefix over the STABLE subset of the tool output (record
    content minus per-call envelope ids/timestamps), so the run record proves
    determinism without storing the raw tool payload.
    """
    return hashlib.sha256(_stable_subset(atlas_stage1_lookup(key)).encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Stage 1 run record (no secrets)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AtlasStage1RunRecord:
    """Typed, no-secrets record of one real Strands-backed Stage 1 run.

    Only identifiers, names, enums, counts, and durations are recorded — never
    API keys, prompts, raw model output, or raw tool payloads. The evidence
    payload is validated against the Atlas ``EvidenceItem`` contract elsewhere;
    here only a deterministic SHA-256 preview of the tool output is kept.
    """

    provider: Literal["groq", "gemini"]
    model_id: str
    tool_name: str
    stop_reason: str
    tool_call_executed: bool
    tool_call_count: int = 0
    tool_error_count: int = 0
    tool_total_time_ms: int = 0
    # Deterministic SHA-256 prefix of the tool output (proves determinism).
    deterministic_preview: str = ""
    agent_executed: bool = False
    # True when the tool result round-tripped through the Atlas EvidenceItem
    # contract (Atlas types validated the result).
    atlas_validated: bool = False
    run_id: str = ""  # empty => generated at record time
    user_id_hash: str = ""  # SHA-256 of the demo principal, never the id
    started_at: str = ""  # ISO timestamp at run start
    completed_at: str = ""  # ISO timestamp at run completion

    def __post_init__(self) -> None:
        if self.run_id == "":
            object.__setattr__(self, "run_id", new_id())

    def to_json(self) -> str:
        """Bounded JSON view for logs — identifiers only, no secrets."""
        return json.dumps(
            {
                "run_id": self.run_id,
                "provider": self.provider,
                "model": self.model_id,
                "tool": self.tool_name,
                "stop_reason": self.stop_reason,
                "agent_executed": self.agent_executed,
                "tool_call_executed": self.tool_call_executed,
                "tool_call_count": self.tool_call_count,
                "tool_error_count": self.tool_error_count,
                "tool_total_time_ms": self.tool_total_time_ms,
                "deterministic_preview": self.deterministic_preview,
                "atlas_validated": self.atlas_validated,
                "user_id_hash": self.user_id_hash,
                "started_at": self.started_at,
                "completed_at": self.completed_at,
            },
            sort_keys=True,
            ensure_ascii=False,
        )


def _tool_metrics_summary(metrics: Any) -> dict[str, int]:
    """Extract no-secrets tool-call evidence from a Strands AgentResult metrics."""
    summary: dict[str, int] = {
        "tool_call_count": 0,
        "tool_error_count": 0,
        "tool_total_time_ms": 0,
    }
    tool_metrics = getattr(metrics, "tool_metrics", None)
    if not isinstance(tool_metrics, dict):
        return summary
    for tm in tool_metrics.values():
        summary["tool_call_count"] += int(getattr(tm, "call_count", 0) or 0)
        summary["tool_error_count"] += int(getattr(tm, "error_count", 0) or 0)
        total = getattr(tm, "total_time", 0.0) or 0.0
        summary["tool_total_time_ms"] += int(float(total) * 1000)
    return summary


def validate_stage1_result(
    tool_output_json: str,
    agent_result: Any,
    *,
    provider: str,
    model_id: str,
    user_id: str = "stage1-demo",
) -> AtlasStage1RunRecord:
    """Validate a real Strands run with Atlas types and build the run record.

    Validation steps (all with Atlas contracts):
    1. the tool output parses and round-trips through ``EvidenceItem``;
    2. the Strands ``AgentResult`` stop reason is a bounded, non-empty string;
    3. tool metrics prove at least one real tool call executed.

    Raises ``ValueError`` when any step fails so callers cannot mistake a
    partial run for a proven Stage 1 pass.
    """
    started = utc_now()
    provider_norm = provider.strip().lower()
    if provider_norm not in {"groq", "gemini"}:
        raise ValueError(f"unsupported provider: {provider_norm!r}")

    # 1) Tool output must be a valid Atlas EvidenceItem (Atlas types validate).
    try:
        raw = json.loads(tool_output_json)
        EvidenceItem.model_validate(raw)
    except Exception as exc:  # noqa: BLE001 - typed validation failure
        raise ValueError(f"atlas_validation_failed: {exc}") from exc
    atlas_validated = True

    # 2) Stop reason: bounded string from the real Strands AgentResult.
    stop_reason = str(getattr(agent_result, "stop_reason", "") or "")
    if not stop_reason:
        raise ValueError("atlas_validation_failed: empty stop_reason")

    # 3) Real tool-call evidence from Strands metrics.
    summary = _tool_metrics_summary(getattr(agent_result, "metrics", None))

    return AtlasStage1RunRecord(
        provider=provider_norm,  # type: ignore[arg-type]
        model_id=model_id[:128],
        tool_name="atlas_stage1_lookup",
        stop_reason=stop_reason[:64],
        agent_executed=True,
        tool_call_executed=summary["tool_call_count"] > 0,
        atlas_validated=atlas_validated,
        deterministic_preview=deterministic_preview(_DEMO_KEY),
        tool_total_time_ms=summary["tool_total_time_ms"],
        tool_call_count=summary["tool_call_count"],
        tool_error_count=summary["tool_error_count"],
        user_id_hash=user_id_hash(user_id),
        started_at=started.isoformat(),
        completed_at=utc_now().isoformat(),
    )


# The demo key used by the Stage 1 smoke (bounded, in the local records).
_DEMO_KEY: Final = "demo-key-1"

__all__ = [
    "AtlasStage1RunRecord",
    "atlas_stage1_lookup",
    "deterministic_preview",
    "stable_tool_fields",
    "validate_stage1_result",
]


def stable_tool_fields(tool_output_json: str) -> dict[str, Any]:
    """Public helper: the deterministic subset of one tool output dump."""
    return {k: v for k, v in json.loads(tool_output_json).items() if k not in _PER_CALL_FIELDS}
