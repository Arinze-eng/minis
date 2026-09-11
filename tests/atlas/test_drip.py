"""CI-safe tests for the Drip Advice engine (directive §2.6).

Covers: one-at-a-time selection, ownership scoping, snooze/dismiss/correction
suppression, quiet hours, cooldown, dedup binding, and deterministic ranking.
No network, no model.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from nanobot.atlas.contracts import DripAdviceItem
from nanobot.atlas.drip import (
    QuietHours,
    bind_delivery,
    build_feedback_record,
    is_suppressed,
    select_advice,
)

USER = "user-drip"
NOW = datetime(2026, 9, 11, 14, 0, tzinfo=timezone.utc)


def item(
    headline: str, *, uncertainty: float = 0.3, domains: list[str] | None = None,
    user: str = USER, cooldown: int = 3600, created: datetime | None = None,
) -> DripAdviceItem:
    return DripAdviceItem(
        user_id=user,
        headline=headline,
        body=f"Body for {headline}",
        domains=domains or ["drip"],  # type: ignore[arg-type]
        uncertainty=uncertainty,
        cooldown_seconds=cooldown,
        created_at=created or NOW,
    )


# ---------------------------------------------------------------------------
# Selection basics
# ---------------------------------------------------------------------------


def test_selects_single_lowest_uncertainty_item() -> None:
    a = item("A", uncertainty=0.6)
    b = item("B", uncertainty=0.1)
    c = item("C", uncertainty=0.3)
    decision = select_advice([a, b, c], {}, user_id=USER, now=NOW)
    assert decision.deliver is True
    assert decision.item is not None and decision.item.headline == "B"


def test_ownership_scoped_and_other_users_ignored() -> None:
    other = item("Other user item", user="someone-else")
    decision = select_advice([other], {}, user_id=USER, now=NOW)
    assert decision.deliver is False
    assert decision.reason_code == "no_eligible_advice"


def test_ranking_tiebreaks_by_created_then_id() -> None:
    a = item("A", uncertainty=0.3, created=NOW - timedelta(hours=2))
    b = item("B", uncertainty=0.3, created=NOW - timedelta(hours=1))
    decision = select_advice([b, a], {}, user_id=USER, now=NOW)
    assert decision.item is not None and decision.item.headline == "A"


# ---------------------------------------------------------------------------
# Feedback suppression
# ---------------------------------------------------------------------------


def test_dismissed_item_never_returns() -> None:
    a = item("A")
    feedbacks = {a.item_id: build_feedback_record(a.item_id, USER, "dismissed", now=NOW)}
    decision = select_advice([a], feedbacks, user_id=USER, now=NOW)
    assert decision.deliver is False


def test_corrected_item_suppressed() -> None:
    a = item("A")
    feedbacks = {
        a.item_id: build_feedback_record(
            a.item_id, USER, "corrected", correction="I already did this", now=NOW
        )
    }
    assert feedbacks[a.item_id].correction == "I already did this"
    decision = select_advice([a], feedbacks, user_id=USER, now=NOW)
    assert decision.deliver is False


def test_snoozed_item_waits_then_returns() -> None:
    a = item("A")
    feedbacks = {
        a.item_id: build_feedback_record(
            a.item_id, USER, "snoozed", snooze_seconds=3600, now=NOW
        )
    }
    too_soon = select_advice([a], feedbacks, user_id=USER, now=NOW + timedelta(minutes=30))
    assert too_soon.deliver is False
    later = select_advice([a], feedbacks, user_id=USER, now=NOW + timedelta(hours=2))
    assert later.deliver is True


def test_suppression_helper_states() -> None:
    none_fb = build_feedback_record("x", USER, "none", now=NOW)
    assert is_suppressed(none_fb, NOW) is False
    snooze_no_expiry = build_feedback_record("x", USER, "snoozed", now=NOW)
    assert snooze_no_expiry.snoozed_until is None
    assert is_suppressed(snooze_no_expiry, NOW) is True


# ---------------------------------------------------------------------------
# Quiet hours + cooldown
# ---------------------------------------------------------------------------


def test_quiet_hours_block_delivery() -> None:
    late_night = datetime(2026, 9, 11, 23, 30, tzinfo=timezone.utc)
    decision = select_advice(
        [item("A")], {}, user_id=USER, now=late_night, quiet_hours=QuietHours()
    )
    assert decision.deliver is False
    assert decision.reason_code == "quiet_hours"


def test_quiet_hours_overnight_window_boundary() -> None:
    just_before = datetime(2026, 9, 11, 21, 59, tzinfo=timezone.utc)
    just_after = datetime(2026, 9, 11, 22, 0, tzinfo=timezone.utc)
    a = [item("A")]
    assert select_advice(a, {}, user_id=USER, now=just_before,
                         quiet_hours=QuietHours()).deliver is True
    assert select_advice(a, {}, user_id=USER, now=just_after,
                         quiet_hours=QuietHours()).deliver is False


def test_cooldown_per_domain() -> None:
    a = item("A", domains=["money"], cooldown=3600)
    last = {"money": NOW - timedelta(minutes=30)}
    too_soon = select_advice([a], {}, user_id=USER, now=NOW, last_delivered_at=last)
    assert too_soon.deliver is False
    later = select_advice(
        [a], {}, user_id=USER, now=NOW,
        last_delivered_at={"money": NOW - timedelta(hours=2)},
    )
    assert later.deliver is True


def test_dedup_binding_is_stable_and_content_bound() -> None:
    a = item("A")
    bound = bind_delivery(a)
    assert bound.delivery_idempotency_key
    assert bound.delivery_idempotency_key == bind_delivery(a).delivery_idempotency_key
    other = item("A", created=NOW)  # same headline, same body -> same key
    assert bind_delivery(other).delivery_idempotency_key == bound.delivery_idempotency_key
    different = item("B")
    assert bind_delivery(different).delivery_idempotency_key != bound.delivery_idempotency_key
