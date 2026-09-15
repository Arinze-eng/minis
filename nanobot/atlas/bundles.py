"""Explicit capability bundles (directive §5).

Each bundle is a bounded declaration of what its operations may READ, DRAFT,
and WRITE/EXECUTE. Bundles are data, not prompts: the chain selector and
policy layer consult them, and the model can never widen them. Every entry
names its capability level so "every tool declares its capability before
registration" (§7 rule 3) is checkable deterministically.

Write/execute entries in the MVP are empty except where an approval-gated
path is explicitly planned; every blocked area names the reason.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from nanobot.atlas.contracts import ConnectorCapability


@dataclass(frozen=True)
class BundleOp:
    """One operation inside a bundle."""

    op: str  # bounded verb, e.g. "list_tasks"
    capability: ConnectorCapability
    # None = never implemented (blocked); str = the gate that must pass.
    approval_gate: str | None = None
    blocked_reason: str | None = None


@dataclass(frozen=True)
class CapabilityBundle:
    """A bounded bundle exposed to exactly one chain scenario."""

    name: str
    scenario: str
    connector: str  # registry connector name (or "wardrobe_store")
    read: tuple[BundleOp, ...] = field(default_factory=tuple)
    draft: tuple[BundleOp, ...] = field(default_factory=tuple)
    write: tuple[BundleOp, ...] = field(default_factory=tuple)


_TASK_START = CapabilityBundle(
    name="task_start",
    scenario="task_start",
    connector="google_tasks",
    read=(
        BundleOp("list_tasks", ConnectorCapability.READ_USER_DATA),
        BundleOp("read_local_task_notes", ConnectorCapability.READ_USER_DATA),
        BundleOp("read_case_state", ConnectorCapability.READ_USER_DATA),
    ),
    draft=(
        BundleOp("draft_first_step_plan", ConnectorCapability.READ_USER_DATA),
        BundleOp("draft_reminder_text", ConnectorCapability.READ_USER_DATA),
        BundleOp("draft_task_update", ConnectorCapability.WRITE_USER_DATA,
                 approval_gate="approval_gate_stage"),
    ),
    write=(  # blocked in the first demo by design
        BundleOp("mutate_task", ConnectorCapability.WRITE_USER_DATA,
                 blocked_reason="task writes arrive only with the approval-gate stage"),
    ),
)

_MONEY_GUARD = CapabilityBundle(
    name="money_guard",
    scenario="money_guard",
    connector="plaid",
    read=(
        BundleOp("list_transactions", ConnectorCapability.READ_USER_DATA),
        BundleOp("detect_recurring_charges", ConnectorCapability.READ_USER_DATA),
    ),
    draft=(
        BundleOp("draft_evidence_card", ConnectorCapability.READ_USER_DATA),
        BundleOp("draft_savings_comparison", ConnectorCapability.READ_USER_DATA),
        BundleOp("draft_review_guide", ConnectorCapability.READ_USER_DATA),
    ),
    write=(  # rule 10: no financial mutations, ever, in the MVP
        BundleOp("pay_or_transfer", ConnectorCapability.EXECUTE_FINANCIAL,
                 blocked_reason="no purchases, payments, transfers, or disputes (rule 10)"),
        BundleOp("cancel_subscription", ConnectorCapability.EXECUTE_ACTION,
                 blocked_reason="account mutations are forbidden in the MVP"),
    ),
)

_WARDROBE = CapabilityBundle(
    name="wardrobe",
    scenario="wardrobe_research",
    connector="wardrobe_store",
    read=(
        BundleOp("list_garments", ConnectorCapability.READ_USER_DATA),
        BundleOp("read_user_constraints", ConnectorCapability.READ_USER_DATA),
    ),
    draft=(
        BundleOp("draft_outfit_plan", ConnectorCapability.READ_USER_DATA),
        BundleOp("draft_care_plan", ConnectorCapability.READ_USER_DATA),
        BundleOp("draft_packing_list", ConnectorCapability.READ_USER_DATA),
    ),
    write=(
        BundleOp("purchase_clothing", ConnectorCapability.EXECUTE_ACTION,
                 blocked_reason="purchases are never automatic (rule 10)"),
    ),
)

_RESEARCH = CapabilityBundle(
    name="research",
    scenario="shopping_research",
    connector="serpapi",
    read=(
        BundleOp("search_products", ConnectorCapability.READ_PUBLIC_DATA),
        BundleOp("read_source_metadata", ConnectorCapability.READ_PUBLIC_DATA),
    ),
    draft=(
        BundleOp("draft_evidence_brief", ConnectorCapability.READ_PUBLIC_DATA),
        BundleOp("draft_comparison", ConnectorCapability.READ_PUBLIC_DATA),
    ),
    write=(
        BundleOp("checkout", ConnectorCapability.EXECUTE_ACTION,
                 blocked_reason="no purchase or checkout, ever"),
    ),
)

_COMMUNICATION = CapabilityBundle(
    name="communication",
    scenario="task_start",  # delivery rides on scenario results
    connector="telegram",
    read=(BundleOp("read_approved_context", ConnectorCapability.READ_USER_DATA),),
    draft=(
        BundleOp("draft_telegram_card", ConnectorCapability.READ_USER_DATA),
        BundleOp("draft_reminder", ConnectorCapability.READ_USER_DATA),
    ),
    write=(
        BundleOp("send_telegram", ConnectorCapability.SEND_COMMUNICATION,
                 approval_gate="explicit_send_flag_and_consent"),
    ),
)

_EMAIL_SUMMARY = CapabilityBundle(
    name="email_summary",
    scenario="email_summary",
    connector="gmail",
    read=(
        BundleOp("list_recent_messages", ConnectorCapability.READ_USER_DATA),
        BundleOp("read_message_metadata", ConnectorCapability.READ_USER_DATA),
    ),
    draft=(
        BundleOp("draft_evidence_summary", ConnectorCapability.READ_USER_DATA),
        BundleOp("draft_reminder", ConnectorCapability.READ_USER_DATA),
    ),
    write=(  # §2.5 MVP: no send, draft, delete, archive, label, attachment download
        BundleOp("send_email", ConnectorCapability.WRITE_USER_DATA,
                 blocked_reason="gmail send/draft is blocked in the MVP (read-only)"),
        BundleOp("mutate_message", ConnectorCapability.WRITE_USER_DATA,
                 blocked_reason="delete/archive/label mutations are blocked (read-only)"),
        BundleOp("download_attachment", ConnectorCapability.WRITE_USER_DATA,
                 blocked_reason="attachment download is blocked (metadata only)"),
    ),
)

_VERIFICATION = CapabilityBundle(
    name="verification",
    scenario="task_start",
    connector="none",
    read=(
        BundleOp("read_case_state", ConnectorCapability.READ_USER_DATA),
        BundleOp("refresh_provider_evidence", ConnectorCapability.READ_USER_DATA),
        BundleOp("read_user_feedback", ConnectorCapability.READ_USER_DATA),
    ),
    draft=(
        BundleOp("draft_follow_up_plan", ConnectorCapability.READ_USER_DATA),
        BundleOp("draft_outcome_explanation", ConnectorCapability.READ_USER_DATA),
    ),
    write=(
        BundleOp("low_risk_follow_up", ConnectorCapability.EXECUTE_ACTION,
                 approval_gate="explicit_consent_and_idempotency"),
    ),
)

BUNDLES: dict[str, CapabilityBundle] = {
    b.name: b
    for b in (_TASK_START, _MONEY_GUARD, _WARDROBE, _RESEARCH,
              _EMAIL_SUMMARY, _COMMUNICATION, _VERIFICATION)
}


def bundle_for_scenario(scenario: str) -> CapabilityBundle | None:
    """Return the single bundle authorized for a scenario (deny-by-default)."""
    for bundle in BUNDLES.values():
        if bundle.scenario == scenario:
            return bundle
    return None


def assert_no_blocked_op_executable(bundle: CapabilityBundle) -> None:
    """Deterministic invariant: blocked ops can never carry an approval gate.

    A blocked operation is blocked outright; if both a blocked reason and an
    approval gate were present, the declaration itself is contradictory and
    must fail fast rather than silently allow a forbidden write.
    """
    for op in (*bundle.read, *bundle.draft, *bundle.write):
        if op.blocked_reason is not None and op.approval_gate is not None:
            raise ValueError(
                f"bundle {bundle.name} op {op.op} is both blocked and gated"
            )
        if op.capability in (ConnectorCapability.EXECUTE_ACTION,
                             ConnectorCapability.EXECUTE_FINANCIAL):
            if op.approval_gate is None and op.blocked_reason is None:
                raise ValueError(
                    f"bundle {bundle.name} op {op.op} executes without a gate"
                )


for _bundle in BUNDLES.values():
    assert_no_blocked_op_executable(_bundle)


__all__ = [
    "BUNDLES",
    "BundleOp",
    "CapabilityBundle",
    "assert_no_blocked_op_executable",
    "bundle_for_scenario",
]
