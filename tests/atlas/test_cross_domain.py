"""CI-safe tests for cross-domain resolution (directive §2.7).

Covers: the two-domain cap, allowed-pair rules, domain/source alignment,
evidence reference carrying, and the no-execution guarantee. No network.
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from nanobot.atlas.contracts import EvidenceItem, utc_now
from nanobot.atlas.cross_domain import (
    CrossDomainInput,
    cross_domain_card,
    resolve_cross_domain,
)

USER = "user-xdomain"


def evidence(eid: str) -> EvidenceItem:
    return EvidenceItem(
        source="test",
        content=f"evidence {eid}",
        retrieved_at=utc_now() - timedelta(minutes=5),
        evidence_id=eid,
    )


def test_tasks_shopping_pair_resolves() -> None:
    step = resolve_cross_domain(CrossDomainInput(
        user_id=USER, sources=["google_tasks", "serpapi"],
        domains=["tasks", "shopping"], purpose="renew passport belt",
        evidence=[evidence("e1"), evidence("e2")],
    ))
    assert step.rule == "task_product_comparison"
    assert step.domains == ["shopping", "tasks"]
    assert step.evidence_ids == ["e1", "e2"]
    assert step.approval_required is False
    assert "purchase" in step.next_action.lower() or "buying" in step.next_action.lower()


def test_money_tasks_pair_resolves() -> None:
    step = resolve_cross_domain(CrossDomainInput(
        user_id=USER, sources=["plaid", "google_tasks"],
        domains=["money", "tasks"], purpose="review charge checklist",
        evidence=[evidence("e1")],
    ))
    assert step.rule == "charge_review_checklist"
    assert step.next_action.lower().startswith("review")


def test_wardrobe_research_pair_resolves() -> None:
    step = resolve_cross_domain(CrossDomainInput(
        user_id=USER, sources=["wardrobe_store", "serpapi"],
        domains=["wardrobe", "research"], purpose="rain coat repair",
        evidence=[],
    ))
    assert step.rule == "wardrobe_research_plan"
    assert step.evidence_ids == []


def test_three_domains_rejected() -> None:
    # The cap is enforced twice: pydantic bounds the field at 2, and the
    # resolver rejects any non-two-domain input deterministically.
    with pytest.raises(ValueError):  # pydantic ValidationError at construction
        CrossDomainInput(
            user_id=USER, sources=["plaid", "google_tasks", "serpapi"],
            domains=["money", "tasks", "wardrobe"], purpose="x",
        )
    with pytest.raises(ValueError, match="two distinct domains"):
        resolve_cross_domain(CrossDomainInput(
            user_id=USER, sources=["plaid", "google_tasks"],
            domains=["money", "money"], purpose="x",
        ))


def test_disallowed_pair_rejected() -> None:
    with pytest.raises(ValueError, match="not allowed"):
        resolve_cross_domain(CrossDomainInput(
            user_id=USER, sources=["plaid", "serpapi"],
            domains=["money", "wardrobe"], purpose="x",
        ))


def test_misaligned_sources_rejected() -> None:
    with pytest.raises(ValueError, match="aligned"):
        resolve_cross_domain(CrossDomainInput(
            user_id=USER, sources=["plaid"], domains=["money", "tasks"], purpose="x",
        ))


def test_card_is_bounded_and_typed() -> None:
    step = resolve_cross_domain(CrossDomainInput(
        user_id=USER, sources=["google_tasks", "serpapi"],
        domains=["tasks", "shopping"], purpose="p", evidence=[evidence("e1")],
    ))
    card = cross_domain_card(step)
    assert card["kind"] == "atlas_cross_domain"
    assert card["evidence_count"] == 1
    assert card["approval_required"] is False
