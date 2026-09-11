"""CI-safe tests for capability bundles (directive §5).

Covers: bundle coverage of scenarios, read/draft/write separation, the
blocked-op invariants (blocked ops can never be gated; execute ops must be
either blocked or gated), and deny-by-default scenario lookup.
"""

from __future__ import annotations

import pytest

from nanobot.atlas.bundles import (
    BUNDLES,
    BundleOp,
    CapabilityBundle,
    assert_no_blocked_op_executable,
    bundle_for_scenario,
)
from nanobot.atlas.contracts import ConnectorCapability

EXPECTED_SCENARIOS = {"task_start", "money_guard", "wardrobe_research",
                      "shopping_research"}


def test_all_product_scenarios_have_bundles() -> None:
    covered = {b.scenario for b in BUNDLES.values()}
    assert EXPECTED_SCENARIOS <= covered


def test_money_guard_blocks_all_financial_writes() -> None:
    bundle = BUNDLES["money_guard"]
    blocked = {op.op for op in bundle.write}
    assert "pay_or_transfer" in blocked
    assert "cancel_subscription" in blocked
    for op in bundle.write:
        assert op.approval_gate is None, "financial writes are never gated, only blocked"
        assert op.blocked_reason


def test_wardrobe_and_research_block_purchase() -> None:
    for name in ("wardrobe", "research"):
        bundle = BUNDLES[name]
        assert any(op.blocked_reason for op in bundle.write)


def test_telegram_send_is_gated_not_blocked() -> None:
    send = next(op for op in BUNDLES["communication"].write if op.op == "send_telegram")
    assert send.approval_gate == "explicit_send_flag_and_consent"
    assert send.capability is ConnectorCapability.SEND_COMMUNICATION


def test_every_op_declares_capability() -> None:
    for bundle in BUNDLES.values():
        for op in (*bundle.read, *bundle.draft, *bundle.write):
            assert isinstance(op.capability, ConnectorCapability)


def test_invariant_rejects_contradictory_declaration() -> None:
    bad = CapabilityBundle(
        name="bad", scenario="task_start", connector="x",
        write=(BundleOp("doit", ConnectorCapability.EXECUTE_ACTION,
                        approval_gate="g", blocked_reason="b"),),
    )
    with pytest.raises(ValueError, match="both blocked and gated"):
        assert_no_blocked_op_executable(bad)


def test_invariant_rejects_ungated_execution() -> None:
    bad = CapabilityBundle(
        name="bad", scenario="task_start", connector="x",
        write=(BundleOp("doit", ConnectorCapability.EXECUTE_ACTION),),
    )
    with pytest.raises(ValueError, match="without a gate"):
        assert_no_blocked_op_executable(bad)


def test_scenario_lookup_is_deny_by_default() -> None:
    assert bundle_for_scenario("money_guard") is not None
    assert bundle_for_scenario("nonexistent_scenario") is None
