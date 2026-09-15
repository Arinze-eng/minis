"""Deterministic cross-domain resolution (directive §2.7).

Combines evidence from at most two domains into one practical next step.
Pure functions — no model involvement — so combination rules are testable
and the two-domain cap is enforced deterministically (the model cannot
request a third domain).

MVP combination pairs (each produces one evidence-backed next step):
- tasks + shopping  -> purchase-free comparison and one decision step;
- money  + tasks    -> recurring-charge review checklist;
- wardrobe + research -> practical outfit/repair plan with research links.

Anything spanning three or more domains is rejected by policy, not trimmed.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from nanobot.atlas.contracts import EvidenceItem, new_id, utc_now

Domain = Literal["money", "tasks", "wardrobe", "drip", "general"]

# The only allowed domain pairs (order-independent), each with its rule name.
_ALLOWED_PAIRS: frozenset[frozenset[str]] = frozenset({
    frozenset({"tasks", "shopping"}),
    frozenset({"money", "tasks"}),
    frozenset({"wardrobe", "research"}),
})


class CrossDomainInput(BaseModel):
    """A bounded cross-domain resolution request."""

    user_id: str = Field(min_length=1)
    # Source connectors feeding the case, e.g. ["google_tasks", "serpapi"].
    sources: list[str] = Field(min_length=1, max_length=2)
    # Domain of each source's evidence (must match sources' length).
    domains: list[str] = Field(min_length=2, max_length=2)
    purpose: str = Field(min_length=1, max_length=128)
    evidence: list[EvidenceItem] = Field(default_factory=list, max_length=20)


class CrossDomainStep(BaseModel):
    """One practical next step across at most two domains."""

    step_id: str = Field(default_factory=new_id)
    user_id: str = Field(min_length=1)
    rule: str = Field(min_length=1, max_length=64)
    domains: list[str] = Field(min_length=2, max_length=2)
    next_action: str = Field(min_length=1, max_length=512)
    rationale: str = Field(min_length=1, max_length=1000)
    evidence_ids: list[str] = Field(default_factory=list)
    # Drafts never execute; any write stays behind the approval gate.
    approval_required: bool = False
    created_at: Any = Field(default_factory=utc_now)


def resolve_cross_domain(data: CrossDomainInput) -> CrossDomainStep:
    """Resolve one bounded cross-domain step or raise ValueError.

    Raises:
        ValueError: on unknown pairs, >2 domains, mismatched domains/sources,
            or purposes outside the allowed rule table (deterministic cap).
    """
    if len(set(data.domains)) != 2:
        raise ValueError("cross_domain requires exactly two distinct domains")
    if len(data.sources) != len(data.domains):
        raise ValueError("sources and domains must be aligned")
    pair = frozenset(data.domains)
    if pair not in _ALLOWED_PAIRS:
        raise ValueError(f"domain pair {sorted(pair)} is not allowed in the MVP")

    evidence_ids = [e.evidence_id for e in data.evidence[:10]]
    if pair == frozenset({"tasks", "shopping"}):
        rule = "task_product_comparison"
        next_action = (
            "Compare the researched options against the task's deadline and pick "
            "one — nothing is purchased; buying stays with you."
        )
        rationale = (
            "Overdue or avoided task combined with read-only product research: "
            "one decision step, evidence attached, purchase blocked."
        )
    elif pair == frozenset({"money", "tasks"}):
        rule = "charge_review_checklist"
        next_action = (
            "Review the flagged recurring charge against your task list and note "
            "keep/cancel — no cancellation or dispute is executed."
        )
        rationale = (
            "Recurring-charge finding combined with task context: one review "
            "checklist step, all financial mutations blocked."
        )
    else:
        rule = "wardrobe_research_plan"
        next_action = (
            "Use the researched reference to pick the repair or outfit step from "
            "your wardrobe plan — no purchase is made."
        )
        rationale = (
            "Wardrobe constraint combined with authorized research: one "
            "practical outfit/repair step with source links."
        )

    return CrossDomainStep(
        user_id=data.user_id,
        rule=rule,
        domains=sorted(data.domains),
        next_action=next_action,
        rationale=rationale,
        evidence_ids=evidence_ids,
        approval_required=False,  # resolution only drafts; writes need the gate
    )


def cross_domain_card(step: CrossDomainStep) -> dict[str, Any]:
    """Render a bounded delivery card for the resolved step."""
    return {
        "kind": "atlas_cross_domain",
        "rule": step.rule,
        "domains": step.domains,
        "next_action": step.next_action,
        "rationale": step.rationale,
        "evidence_count": len(step.evidence_ids),
        "approval_required": step.approval_required,
    }


__all__ = ["CrossDomainInput", "CrossDomainStep", "cross_domain_card", "resolve_cross_domain"]
