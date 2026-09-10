"""No-network Stage 1 validation: deterministic tool + typed run record.

Covers the Atlas side of Stage 1 without Strands or credentials:
- the local tool is deterministic, bounded, and read-only;
- tool output round-trips through the Atlas EvidenceItem contract;
- the Stage 1 run record carries no secrets and validates real-run inputs.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from nanobot.atlas.contracts import EvidenceItem
from nanobot.atlas.stage1 import (
    _DEMO_KEY,
    AtlasStage1RunRecord,
    atlas_stage1_lookup,
    deterministic_preview,
    stable_tool_fields,
    validate_stage1_result,
)


class TestDeterministicTool:
    def test_hit_is_deterministic_and_typed(self) -> None:
        first = atlas_stage1_lookup(_DEMO_KEY)
        second = atlas_stage1_lookup(_DEMO_KEY)
        # Deterministic in CONTENT: the stable subset is identical across calls
        # (per-call envelope ids/timestamps legitimately differ).
        assert stable_tool_fields(first) == stable_tool_fields(second)
        raw = json.loads(first)
        item = EvidenceItem.model_validate(raw)  # round-trips through Atlas types
        assert item.source == "atlas_stage1_local"
        assert item.payload is not None
        assert item.payload["found"] is True
        assert item.payload["key"] == _DEMO_KEY
        assert item.uncertainty == 0.0
        assert item.state == "fresh"

    def test_miss_is_deterministic_and_well_formed(self) -> None:
        first = atlas_stage1_lookup("missing-key")
        second = atlas_stage1_lookup("missing-key")
        assert stable_tool_fields(first) == stable_tool_fields(second)
        raw = json.loads(first)
        item = EvidenceItem.model_validate(raw)
        assert item.payload["found"] is False

    def test_bounded_key_format_enforced(self) -> None:
        for bad in ("", "x" * 65, "has space", "semi;colon", None, 123):
            with pytest.raises(ValueError):
                atlas_stage1_lookup(bad)  # type: ignore[arg-type]

    def test_key_length_boundaries(self) -> None:
        assert json.loads(atlas_stage1_lookup("a"))  # min length ok
        assert json.loads(atlas_stage1_lookup("k" * 64))  # max length ok

    def test_preview_is_deterministic_and_redacted(self) -> None:
        assert deterministic_preview(_DEMO_KEY) == deterministic_preview(_DEMO_KEY)
        assert len(deterministic_preview(_DEMO_KEY)) == 16
        assert _DEMO_KEY not in deterministic_preview(_DEMO_KEY)


class TestRunRecord:
    def test_record_has_no_secrets_fields(self) -> None:
        record = AtlasStage1RunRecord(
            provider="groq",
            model_id="llama-3.3-70b-versatile",
            tool_name="atlas_stage1_lookup",
            stop_reason="end_turn",
            tool_call_executed=True,
            tool_call_count=1,
            atlas_validated=True,
            deterministic_preview=deterministic_preview(_DEMO_KEY),
        )
        data = json.loads(record.to_json())
        # Identifiers/metrics only — no credential-ish keys anywhere.
        forbidden = {"api_key", "key", "token", "secret", "password", "messages", "prompt"}
        assert not forbidden & set(data)
        assert data["provider"] == "groq"
        assert data["model"] == "llama-3.3-70b-versatile"
        assert data["tool"] == "atlas_stage1_lookup"
        assert data["stop_reason"] == "end_turn"
        assert data["tool_call_executed"] is True
        assert record.run_id  # generated when empty

    def test_validate_rejects_invalid_tool_output(self) -> None:
        agent = SimpleNamespace(stop_reason="end_turn", metrics=None)
        with pytest.raises(ValueError, match="atlas_validation_failed"):
            validate_stage1_result(
                "not json", agent, provider="groq", model_id="m"
            )

    def test_validate_rejects_empty_stop_reason(self) -> None:
        with pytest.raises(ValueError, match="stop_reason"):
            validate_stage1_result(
                atlas_stage1_lookup(_DEMO_KEY),
                SimpleNamespace(stop_reason="", metrics=None),
                provider="groq",
                model_id="m",
            )

    def test_validate_rejects_unknown_provider(self) -> None:
        with pytest.raises(ValueError, match="unsupported provider"):
            validate_stage1_result(
                atlas_stage1_lookup(_DEMO_KEY),
                SimpleNamespace(stop_reason="end_turn", metrics=None),
                provider="openai-paid",
                model_id="m",
            )

    def test_validate_accepts_real_shape_with_metrics(self) -> None:
        metrics = SimpleNamespace(
            tool_metrics={
                "atlas_stage1_lookup": SimpleNamespace(
                    call_count=1, error_count=0, total_time=0.05
                )
            }
        )
        record = validate_stage1_result(
            atlas_stage1_lookup(_DEMO_KEY),
            SimpleNamespace(stop_reason="end_turn", metrics=metrics),
            provider="groq",
            model_id="llama-3.3-70b-versatile",
            user_id="stage1-demo",
        )
        assert record.tool_call_executed is True
        assert record.tool_call_count == 1
        assert record.tool_error_count == 0
        assert record.tool_total_time_ms == 50
        assert record.atlas_validated is True
        assert record.agent_executed is True
        assert record.user_id_hash  # hashed, never the raw id
        assert "stage1-demo" not in record.to_json()
