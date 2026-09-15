"""Deterministic Money Guard rules (directive §2.1).

Pure functions over normalized :class:`TransactionItem` records — no model
involvement and no network access — so recurring/suspicious charge findings
are reproducible and unit-testable. The Strands agent only summarizes the
output of these rules; it never classifies charges itself.

MVP detections:
- ``recurring``: same merchant, >= 3 similar amounts, consistent 6-45 day cadence;
- ``price_change``: recurring merchant whose most recent amount differs from
  the established typical amount.

Every finding carries source references, confidence, and evidence IDs so the
recommendation layer can explain source, date, amount, confidence, and
freshness. Nothing here executes, drafts, or authorizes anything.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from nanobot.atlas.contracts import TransactionItem, utc_now

# Cadence window (days) within which a charge series is considered recurring.
_MIN_CADENCE_DAYS = 6
_MAX_CADENCE_DAYS = 45
# Distinct occurrences required before a merchant counts as recurring.
_MIN_OCCURRENCES = 3
# Relative tolerance when comparing amounts within one merchant series.
_AMOUNT_TOLERANCE = 0.15
# Findings with confidence below this are not surfaced as review candidates.
_MIN_CONFIDENCE = 0.5


class MoneyFinding(BaseModel):
    """One deterministic Money Guard finding, ready for recommendation."""

    finding_id: str = Field(default_factory=lambda: f"mf_{utc_now().strftime('%Y%m%d%H%M%S%f')}")
    user_id: str = Field(min_length=1)
    merchant: str = Field(min_length=1, max_length=256)
    detection: str  # "recurring" | "price_change"
    typical_amount: float
    latest_amount: float
    currency: str = Field(min_length=3, max_length=3, default="USD")
    occurrences: int = Field(ge=_MIN_OCCURRENCES)
    cadence_days: int | None = None  # median gap when derivable
    last_seen: datetime | None = None
    # 0.0..1.0 — deterministic from occurrence count / cadence regularity.
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_ids: list[str] = Field(default_factory=list)
    # Verbatim provider refs (transaction ids) backing this finding.
    source_transaction_ids: list[str] = Field(default_factory=list)
    summary: str = Field(min_length=1, max_length=1000)


def _amounts_similar(a: float, b: float) -> bool:
    if b == 0:
        return a == 0
    return abs(a - b) / abs(b) <= _AMOUNT_TOLERANCE


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def _group_by_merchant(
    transactions: list[TransactionItem], user_id: str
) -> dict[str, list[TransactionItem]]:
    """Group transactions by lowercase merchant name for one user, oldest first."""
    groups: dict[str, list[Any]] = defaultdict(list)
    for txn in transactions:
        if txn.user_id != user_id or not txn.merchant:
            continue
        groups[txn.merchant.strip().lower()].append(txn)
    for series in groups.values():
        series.sort(key=lambda t: t.posted_at or datetime.min.replace(tzinfo=timezone.utc))
    return dict(groups)


def _series_confidence(occurrences: int, gaps: list[float]) -> float:
    """Deterministic confidence: more occurrences and a regular cadence score higher."""
    base = min(occurrences / 6.0, 1.0) * 0.6  # up to 0.6 from count
    if gaps:
        med = _median(gaps)
        spread = (max(gaps) - min(gaps)) / med if med > 0 else 1.0
        regularity = max(0.0, 1.0 - min(spread, 1.0))
    else:
        regularity = 0.0
    return round(min(base + regularity * 0.4, 1.0), 2)


def detect_recurring_charges(
    transactions: list[TransactionItem], user_id: str
) -> list[MoneyFinding]:
    """Detect recurring and price-changed charges with deterministic rules.

    A merchant qualifies when it has >= 3 occurrences whose amounts match
    within tolerance and whose gaps all fall inside the 6-45 day cadence
    window. If the latest amount then breaks tolerance with the typical
    amount, the finding is upgraded to ``price_change``.
    """
    findings: list[MoneyFinding] = []
    for merchant_key, series in _group_by_merchant(transactions, user_id).items():
        if len(series) < _MIN_OCCURRENCES:
            continue
        stamped: list[tuple[datetime, TransactionItem]] = [
            (t.posted_at, t) for t in series if t.posted_at is not None
        ]
        if len(stamped) < _MIN_OCCURRENCES:
            continue
        stamps = [ts for ts, _ in stamped]
        dated = [t for _, t in stamped]
        gaps = [
            (stamps[i] - stamps[i - 1]).total_seconds() / 86400.0
            for i in range(1, len(stamps))
        ]
        if gaps and (min(gaps) < _MIN_CADENCE_DAYS or max(gaps) > _MAX_CADENCE_DAYS):
            continue
        typical = _median([abs(t.amount) for t in dated])
        similar = [t for t in dated if _amounts_similar(abs(t.amount), typical)]
        if len(similar) < _MIN_OCCURRENCES:
            continue
        latest = dated[-1]
        detection = "recurring"
        latest_amount = abs(latest.amount)
        if not _amounts_similar(latest_amount, typical):
            detection = "price_change"
        gap_days = int(round(_median(gaps))) if gaps else None
        confidence = _series_confidence(len(similar), gaps)
        if confidence < _MIN_CONFIDENCE:
            continue
        display_name = latest.merchant or merchant_key
        if detection == "price_change":
            summary = (
                f"{display_name} charged {latest_amount:.2f} {latest.currency} "
                f"(typically {typical:.2f}); recurring series of {len(similar)} charges"
            )
        else:
            summary = (
                f"{display_name} recurs roughly every {gap_days} days at "
                f"~{typical:.2f} {latest.currency} ({len(similar)} charges observed)"
            )
        findings.append(
            MoneyFinding(
                user_id=user_id,
                merchant=display_name[:256],
                detection=detection,
                typical_amount=typical,
                latest_amount=latest_amount,
                currency=latest.currency,
                occurrences=len(similar),
                cadence_days=gap_days,
                last_seen=latest.posted_at,
                confidence=confidence,
                evidence_ids=[
                    t.provider_ref.provider_id for t in similar[:20]
                ],
                source_transaction_ids=[t.transaction_id for t in similar[:20]],
                summary=summary[:1000],
            )
        )
    # Highest impact first (largest typical amount), deterministic tie-break.
    findings.sort(key=lambda f: (-f.typical_amount, f.merchant))
    return findings


def review_card(findings: list[MoneyFinding], *, max_items: int = 5) -> dict[str, Any]:
    """Render a bounded, evidence-backed review card (no actions attached)."""
    return {
        "kind": "money_guard_review",
        "items": [
            {
                "merchant": f.merchant,
                "detection": f.detection,
                "typical_amount": f.typical_amount,
                "latest_amount": f.latest_amount,
                "currency": f.currency,
                "occurrences": f.occurrences,
                "cadence_days": f.cadence_days,
                "confidence": f.confidence,
                "summary": f.summary,
            }
            for f in findings[:max_items]
        ],
        "sandbox_note": (
            "Data is Plaid Sandbox / deterministic fixtures; nothing was "
            "charged, cancelled, or disputed."
        ),
    }


__all__ = ["MoneyFinding", "detect_recurring_charges", "review_card"]
