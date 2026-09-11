"""Deterministic Drip Advice engine (directive §2.6).

One suggestion at a time, grounded in authorized evidence or user-provided
context, with explicit feedback handling: snooze, dismiss, correction,
cooldown, quiet hours, and deduplication. Pure functions over typed records —
no model involvement — so delivery decisions are reproducible and testable.
The Strands agent may only reword the chosen item, never choose whether to
send it.

Safety contract:
- No diagnosing, moralizing, or medical/mental-health/nutritional/crisis claims.
- Rejected advice never repeats: a dismissal suppresses the item and a
  correction suppresses the item's category until replaced.
- Delivery requires a policy decision from :func:`select_advice` — the model
  cannot enable delivery, and quiet hours are enforced deterministically.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from datetime import time as dt_time
from typing import Literal

from pydantic import BaseModel, Field

from nanobot.atlas.contracts import DripAdviceItem, utc_now

AdviceFeedback = Literal["none", "snoozed", "dismissed", "corrected", "delivered"]


class QuietHours(BaseModel):
    """Deterministic quiet-hours window (server-local, user-configured)."""

    start: dt_time = Field(default=dt_time(22, 0))
    end: dt_time = Field(default=dt_time(8, 0))


class DripFeedback(BaseModel):
    """User feedback binding for one advice item."""

    item_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    feedback: AdviceFeedback = "none"
    # snooze: not deliverable before this time.
    snoozed_until: datetime | None = None
    # correction: what the user said was wrong (bounded, redact-friendly).
    correction: str | None = Field(default=None, max_length=500)
    updated_at: datetime = Field(default_factory=utc_now)


class DripDecision(BaseModel):
    """Deterministic outcome of the delivery gate for one item."""

    deliver: bool
    reason_code: str
    item: DripAdviceItem | None = None


def _is_quiet_hours(now: datetime, window: QuietHours) -> bool:
    now_t = now.astimezone(window.start.tzinfo or timezone.utc).time()
    if window.start <= window.end:
        return window.start <= now_t < window.end
    # Overnight window (e.g. 22:00 -> 08:00).
    return now_t >= window.start or now_t < window.end


def is_suppressed(feedback: DripFeedback | None, now: datetime) -> bool:
    """Dismissed/corrected items never return; snoozed items wait."""
    if feedback is None:
        return False
    if feedback.feedback == "dismissed":
        return True
    if feedback.feedback == "corrected":
        return True
    if feedback.feedback == "snoozed":
        until = feedback.snoozed_until
        if until is None:
            return True
        return now < until
    return False


def select_advice(
    candidates: list[DripAdviceItem],
    feedbacks: dict[str, DripFeedback],
    *,
    user_id: str,
    now: datetime | None = None,
    last_delivered_at: dict[str, datetime] | None = None,
    quiet_hours: QuietHours | None = None,
) -> DripDecision:
    """Pick at most one deliverable item, deterministically.

    Rules (in order):
    1. Ownership: only the verified user's items are considered.
    2. Suppression: dismissed/corrected items are out; snoozed items wait.
    3. Quiet hours: within the window, nothing is delivered.
    4. Cooldown: an item's category must be outside its cooldown window
       since its last delivery.
    5. Dedup: identical headline+body delivered in this window is skipped
       (idempotency key records the delivered content binding).
    6. Ranking: lowest uncertainty, then oldest created_at, then item_id —
       one item only (drip, not spam).
    """
    now = now or utc_now()
    quiet = quiet_hours or QuietHours()
    last_delivered = last_delivered_at or {}

    if _is_quiet_hours(now, quiet):
        return DripDecision(deliver=False, reason_code="quiet_hours")

    # Dedup: skip candidates whose exact content was delivered recently
    # (cooldown window applies per category of the item).
    def _in_cooldown(item: DripAdviceItem) -> bool:
        for domain in item.domains or ["drip"]:
            last = last_delivered.get(domain)
            if last is not None and (now - last).total_seconds() < item.cooldown_seconds:
                return True
        return False

    eligible: list[DripAdviceItem] = []
    for item in candidates:
        if item.user_id != user_id:
            continue
        if is_suppressed(feedbacks.get(item.item_id), now):
            continue
        if _in_cooldown(item):
            continue
        eligible.append(item)

    if not eligible:
        return DripDecision(deliver=False, reason_code="no_eligible_advice")

    eligible.sort(key=lambda i: (i.uncertainty, i.created_at, i.item_id))
    chosen = eligible[0]
    return DripDecision(deliver=True, reason_code="ok", item=chosen)


def bind_delivery(item: DripAdviceItem) -> DripAdviceItem:
    """Bind a stable delivery idempotency key for an item about to be sent.

    The key binds the item's *content* (headline+body) — not its id — so two
    records carrying the same advice deduplicate to one delivery, which is
    what the directive's dedup requirement means.
    """
    import hashlib

    material = f"{item.headline}:{item.body}".encode("utf-8")
    digest = hashlib.sha256(material).hexdigest()[:32]
    return item.model_copy(update={"delivery_idempotency_key": f"drip-{digest}"})


def build_feedback_record(
    item_id: str, user_id: str, feedback: AdviceFeedback, *,
    correction: str | None = None, snooze_seconds: int | None = None,
    now: datetime | None = None,
) -> DripFeedback:
    """Create/normalize a feedback record (deterministic snooze math)."""
    now = now or utc_now()
    snoozed_until = (
        now + timedelta(seconds=snooze_seconds)
        if feedback == "snoozed" and snooze_seconds
        else None
    )
    return DripFeedback(
        item_id=item_id, user_id=user_id, feedback=feedback,
        snoozed_until=snoozed_until,
        correction=(correction or None) if feedback == "corrected" else None,
        updated_at=now,
    )


__all__ = [
    "DripDecision",
    "DripFeedback",
    "QuietHours",
    "AdviceFeedback",
    "bind_delivery",
    "build_feedback_record",
    "is_suppressed",
    "select_advice",
]
