"""Deterministic Wardrobe Help rules (directive §2.3).

Pure functions over user-provided :class:`GarmentRecord` inputs — no external
fashion API, no model involvement — so outfit/care/packing outputs are
reproducible and unit-testable. The Strands agent only summarizes this output.

Safety contract:
- Only attributes the user explicitly provided are used. Nothing here infers
  attractiveness, age, gender, ethnicity, body value, health, or identity.
- Outputs are plans/drafts only; nothing is ever purchased (rule 10).
- Garment records belong to the verified user; records for other users are
  ignored by the deterministic layer as defense in depth.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from nanobot.atlas.contracts import new_id, utc_now

# Formality scale (user-entered): 0 loungewear, 1 casual, 2 smart, 3 formal.
Formality = int  # bounded 0..3
# Warmth scale (user-entered): 0 coolest .. 3 warmest.
Warmth = int  # bounded 0..3

GarmentCategory = Literal["top", "bottom", "outerwear", "shoes", "accessory"]
GarmentCondition = Literal["new", "good", "worn", "repair_needed"]


class GarmentRecord(BaseModel):
    """One user-entered garment (hackathon scope: local/user data only)."""

    # UUID-based: timestamp-only IDs collide under coarse OS clock granularity.
    garment_id: str = Field(default_factory=lambda: f"g_{new_id()}")
    user_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=128)
    category: GarmentCategory
    formality: Formality = Field(ge=0, le=3, default=1)
    warmth: Warmth = Field(ge=0, le=3, default=1)
    color: str | None = Field(default=None, max_length=32)
    condition: GarmentCondition = "good"


class OutfitConstraint(BaseModel):
    """User-provided occasion/weather constraints for one outfit request."""

    occasion_formality: Formality = Field(ge=0, le=3, default=1)
    required_warmth: Warmth = Field(ge=0, le=3, default=1)
    max_warmth: Warmth | None = Field(default=None, ge=0, le=3)  # e.g. indoors/heat
    include_outerwear: bool = True


def _eligible(garments: list[GarmentRecord], user_id: str) -> list[GarmentRecord]:
    """User-scoped, non-repair garments (repair-needed items are excluded)."""
    return [
        g for g in garments
        if g.user_id == user_id and g.condition != "repair_needed"
    ]


def _pick(
    candidates: list[GarmentRecord], constraint: OutfitConstraint
) -> GarmentRecord | None:
    """Deterministic pick: lowest formality that meets the occasion, then warmth."""
    fitting = [
        g for g in candidates
        if g.formality >= constraint.occasion_formality
        and g.warmth >= constraint.required_warmth
        and (constraint.max_warmth is None or g.warmth <= constraint.max_warmth)
    ]
    return min(fitting, key=lambda g: (g.formality, g.warmth, g.name)) if fitting else None


class OutfitPlan(BaseModel):
    """One bounded outfit plan with per-slot evidence references."""

    user_id: str = Field(min_length=1)
    slots: dict[str, str] = Field(default_factory=dict)  # category -> garment_id
    missing: list[str] = Field(default_factory=list)  # categories with no match
    notes: list[str] = Field(default_factory=list)
    created_at: Any = Field(default_factory=utc_now)


def recommend_outfit(
    garments: list[GarmentRecord], user_id: str, constraint: OutfitConstraint
) -> OutfitPlan:
    """Build one outfit deterministically from user-provided garments."""
    plan = OutfitPlan(user_id=user_id)
    pool = _eligible(garments, user_id)
    wanted: list[GarmentCategory] = ["top", "bottom", "shoes"]
    if constraint.include_outerwear:
        wanted.append("outerwear")
    for category in wanted:
        choice = _pick([g for g in pool if g.category == category], constraint)
        if choice is None:
            plan.missing.append(category)
        else:
            plan.slots[category] = choice.garment_id
    if plan.missing:
        plan.notes.append(
            "No suitable garment found for: " + ", ".join(plan.missing)
        )
    return plan


def care_plan(garment: GarmentRecord) -> list[str]:
    """Deterministic, condition-based care/repair steps (advice only)."""
    if garment.condition == "repair_needed":
        return [
            f"Inspect the {garment.name} and identify the damage (seam, button, sole).",
            "Choose repair: simple fix at home or take to a tailor/cobbler.",
            "Do not wear it until repaired to avoid worsening the damage.",
        ]
    if garment.condition == "worn":
        return [
            f"Wash the {garment.name} per its care label.",
            "Check for thinning fabric or loose threads at the next wear.",
            "Plan a replacement only if it fails again this month.",
        ]
    return [
        f"Store the {garment.name} clean and dry.",
        "Follow the care label; no action needed right now.",
    ]


def packing_list(
    garments: list[GarmentRecord], user_id: str, *, days: int, required_warmth: Warmth
) -> dict[str, Any]:
    """Bounded deterministic packing list (caps avoid over-packing)."""
    pool = _eligible(garments, user_id)
    bounded_days = min(max(days, 1), 14)
    per_category: dict[str, int] = {"top": bounded_days + 1, "bottom": (bounded_days + 1) // 2,
                                    "shoes": 2, "outerwear": 1 if required_warmth >= 2 else 0}
    # Every category key is always present (empty list = nothing to pack),
    # so consumers get a predictable shape.
    items: dict[str, list[str]] = {category: [] for category in per_category}
    for category, cap in per_category.items():
        if cap == 0:
            continue
        fitting = [g for g in pool if g.category == category
                   and g.warmth >= required_warmth]
        fitting.sort(key=lambda g: (g.warmth, g.name))
        items[category] = [g.garment_id for g in fitting[:cap]]
        if not items[category]:
            items["missing"] = items.get("missing", []) + [category]
    return {
        "kind": "wardrobe_packing_list",
        "days": bounded_days,
        "items": items,
        "note": "Counts are caps based on user-entered garments; nothing was purchased.",
    }


def parse_constraints(query: str) -> OutfitConstraint:
    """Deterministic keyword -> constraint mapping (no model involvement).

    Only the user's own words set the constraint; defaults are neutral.
    """
    q = (query or "").lower()
    if "formal" in q or "wedding" in q or "interview" in q:
        formality = 3
    elif "office" in q or "work" in q or "smart" in q:
        formality = 2
    elif "home" in q or "lounge" in q or "sleep" in q:
        formality = 0
    else:
        formality = 1
    if "freez" in q or "snow" in q:
        warmth = 3
    elif "cold" in q or "chilly" in q or "rain" in q:
        warmth = 2
    elif "hot" in q or "heat" in q or "summer" in q:
        warmth = 0
    else:
        warmth = 1
    return OutfitConstraint(
        occasion_formality=formality,
        required_warmth=warmth,
        include_outerwear=warmth >= 2,
    )


class WardrobeStoreConnector:
    """Store-backed wardrobe adapter (user-entered data; no external API).

    Satisfies the chain's connector surface (``name``/``capabilities``) so the
    policy gate treats user-entered garment reads like any other read.
    """

    def __init__(self, store: Any) -> None:
        self._store = store

    @property
    def name(self) -> str:
        return "wardrobe_store"

    def capabilities(self) -> frozenset[Any]:
        from nanobot.atlas.contracts import ConnectorCapability

        return frozenset({ConnectorCapability.READ_USER_DATA})

    def list_garments(self, user_id: str) -> list[GarmentRecord]:
        return list(self._store.list_garments(user_id))


__all__ = [
    "GarmentRecord",
    "OutfitConstraint",
    "OutfitPlan",
    "WardrobeStoreConnector",
    "care_plan",
    "packing_list",
    "parse_constraints",
    "recommend_outfit",
]
