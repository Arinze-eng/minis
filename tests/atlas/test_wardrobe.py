"""CI-safe tests for the Wardrobe Help slice (directive §2.3).

Covers: deterministic outfit/care/packing rules over user-entered garments,
constraint parsing, store persistence, and the wardrobe_research chain path
(stubbed model). No network, no external fashion API.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest

from nanobot.atlas.chain import AtlasChain, AtlasChainError, ChainInput
from nanobot.atlas.contracts import (
    AuthenticatedAtlasContext,
    ConnectorCapability,
    ConnectorStatus,
    ConsentScope,
)
from nanobot.atlas.model_factory import ModelBudget
from nanobot.atlas.policy import ConsentState, utc_now
from nanobot.atlas.store import LocalAtlasStore
from nanobot.atlas.wardrobe import (
    GarmentRecord,
    OutfitConstraint,
    WardrobeStoreConnector,
    care_plan,
    packing_list,
    parse_constraints,
    recommend_outfit,
)

USER = "user-wardrobe"


def make_ctx() -> AuthenticatedAtlasContext:
    return AuthenticatedAtlasContext(
        user_id=USER, scopes=frozenset({ConsentScope.READ_PROFILE})
    )


def make_consent() -> ConsentState:
    return ConsentState(
        user_id=USER, scope=ConsentScope.READ_PROFILE, connector="wardrobe_store",
        granted_at=utc_now() - timedelta(hours=1), expires_at=None, revoked=False,
    )


def garment(
    name: str, category: str, *, formality: int = 1, warmth: int = 1,
    condition: str = "good",
) -> GarmentRecord:
    return GarmentRecord(
        user_id=USER, name=name,
        category=category,  # type: ignore[arg-type]
        formality=formality, warmth=warmth, condition=condition,  # type: ignore[arg-type]
    )


BASE_WARDROBE = [
    garment("Grey tee", "top", formality=0, warmth=0),
    garment("White shirt", "top", formality=2, warmth=1),
    garment("Wool blazer", "top", formality=3, warmth=2),
    garment("Jeans", "bottom", formality=1, warmth=1),
    garment("Chinos", "bottom", formality=2, warmth=1),
    garment("Sneakers", "shoes", formality=1, warmth=1),
    garment("Oxfords", "shoes", formality=3, warmth=1),
    garment("Rain coat", "outerwear", formality=1, warmth=2),
]


# ---------------------------------------------------------------------------
# Deterministic rules
# ---------------------------------------------------------------------------


def test_outfit_meets_occasion_and_warmth() -> None:
    constraint = OutfitConstraint(occasion_formality=2, required_warmth=1,
                                  include_outerwear=False)
    plan = recommend_outfit(BASE_WARDROBE, USER, constraint)
    assert plan.missing == []
    by_id = {g.garment_id: g for g in BASE_WARDROBE}
    assert by_id[plan.slots["top"]].name == "White shirt"  # lowest formality >= 2
    assert by_id[plan.slots["bottom"]].name == "Chinos"
    assert by_id[plan.slots["shoes"]].name == "Oxfords"  # only formality >= 2 shoes


def test_outfit_outerwear_when_cold() -> None:
    constraint = OutfitConstraint(occasion_formality=1, required_warmth=2,
                                  include_outerwear=True)
    plan = recommend_outfit(BASE_WARDROBE, USER, constraint)
    assert "outerwear" in plan.slots
    by_id = {g.garment_id: g for g in BASE_WARDROBE}
    assert by_id[plan.slots["outerwear"]].name == "Rain coat"


def test_missing_category_reported() -> None:
    constraint = OutfitConstraint(occasion_formality=3, required_warmth=3)
    plan = recommend_outfit(
        [garment("Tee", "top", formality=0, warmth=0)], USER, constraint
    )
    assert set(plan.missing) == {"top", "bottom", "shoes", "outerwear"}
    assert plan.notes


def test_repair_needed_garments_excluded_and_user_scoped() -> None:
    wardrobe = [
        garment("Torn shirt", "top", condition="repair_needed"),
        garment("Ok shirt", "top"),
        garment("Other's jeans", "bottom"),
    ]
    wardrobe[2] = wardrobe[2].model_copy(update={"user_id": "someone-else"})
    plan = recommend_outfit(
        wardrobe, USER, OutfitConstraint(occasion_formality=1, required_warmth=1)
    )
    by_id = {g.garment_id: g for g in wardrobe}
    if "top" in plan.slots:
        assert by_id[plan.slots["top"]].name == "Ok shirt"
    assert "bottom" in plan.missing  # other user's garment never used


def test_constraint_parse_keywords() -> None:
    formal_cold = parse_constraints("formal wedding, freezing outside")
    assert formal_cold.occasion_formality == 3
    assert formal_cold.required_warmth == 3
    assert formal_cold.include_outerwear is True
    hot_casual = parse_constraints("casual summer day")
    assert hot_casual.required_warmth == 0
    assert hot_casual.include_outerwear is False


def test_care_plan_by_condition() -> None:
    torn = garment("Torn shirt", "top", condition="repair_needed")
    torn_steps = care_plan(torn)
    assert "inspect" in torn_steps[0].lower()
    assert any("repair" in step.lower() for step in torn_steps)
    worn = garment("Old jeans", "bottom", condition="worn")
    assert "wash" in care_plan(worn)[0].lower()
    good = garment("New tee", "top", condition="good")
    assert "store" in care_plan(good)[0].lower()


def test_packing_list_is_bounded() -> None:
    packing = packing_list(BASE_WARDROBE, USER, days=30, required_warmth=1)
    assert packing["days"] == 14  # capped
    tops = packing["items"]["top"]
    assert len(tops) <= 15
    assert packing["items"]["outerwear"] == []  # warmth 1 < 2


# ---------------------------------------------------------------------------
# Store persistence
# ---------------------------------------------------------------------------


def test_store_garments_roundtrip(tmp_path: Any) -> None:
    store = LocalAtlasStore(root=tmp_path)
    store.save_garment(USER, BASE_WARDROBE[0])
    store.save_garment(USER, BASE_WARDROBE[1])
    store.save_garment(USER, BASE_WARDROBE[0])  # upsert same id
    loaded = store.list_garments(USER)
    assert len(loaded) == 2
    assert {g.name for g in loaded} == {"Grey tee", "White shirt"}
    assert store.list_garments("other-user") == []


# ---------------------------------------------------------------------------
# Chain wiring (stubbed model, real deterministic rules)
# ---------------------------------------------------------------------------


class _StubModelHandle:
    provider = "groq"
    model_id = "stub"

    def __init__(self) -> None:
        self.model = None
        self.budget = ModelBudget(max_model_requests=4)
        self.atlas_context = make_ctx()

    def describe(self) -> dict[str, str]:
        return {"provider": self.provider, "model": self.model_id}


class _StubAgentResult:
    structured_output = type(
        "S", (), {"title": "Wear the white shirt", "rationale": "matches office formality",
                  "next_action": "review_outfit"}
    )()


@pytest.mark.asyncio
async def test_chain_wardrobe_happy_path(monkeypatch: pytest.MonkeyPatch,
                                         tmp_path: Any) -> None:
    store = LocalAtlasStore(root=tmp_path)
    for g in BASE_WARDROBE:
        store.save_garment(USER, g)
    connector = WardrobeStoreConnector(store)
    chain = AtlasChain(connector=connector, model_handle=_StubModelHandle(),
                       consent=make_consent())

    captured: dict[str, Any] = {}

    class _StubAgent:
        def __init__(self, **kwargs: Any) -> None:
            assert "tools" in kwargs and len(kwargs["tools"]) == 1
            captured.update(kwargs)

        async def invoke_async(self, prompt: str) -> _StubAgentResult:
            tool_fn = captured["tools"][0]
            data = json.loads(await tool_fn("office outfit, cold day"))
            assert data["status"] == "ok"
            assert data["items"], "expected deterministic wardrobe evidence"
            return _StubAgentResult()

    import json  # local to avoid shadowing module-level import style

    import nanobot.atlas.chain as chain_mod

    monkeypatch.setattr(chain_mod, "_wrap_tool", lambda fn: fn)
    monkeypatch.setattr(chain_mod, "_agent_class", lambda: _StubAgent)

    result = await chain.run(
        ChainInput(user_id=USER, scenario="wardrobe_research",
                   query="office outfit, cold day", consent=make_consent())
    )
    assert result.status is ConnectorStatus.OK
    assert result.recommendation is not None
    assert result.approval_required is False
    assert "wardrobe_store" in result.evidence[0].source


@pytest.mark.asyncio
async def test_chain_wardrobe_requires_consent(tmp_path: Any) -> None:
    chain = AtlasChain(
        connector=WardrobeStoreConnector(LocalAtlasStore(root=tmp_path)),
        model_handle=_StubModelHandle(), consent=None,
    )
    with pytest.raises(AtlasChainError) as exc:
        await chain.run(ChainInput(user_id=USER, scenario="wardrobe_research",
                                   query="x", consent=None))
    assert exc.value.reason_code == "policy_denied"


def test_wardrobe_connector_declares_read_capability() -> None:
    connector = WardrobeStoreConnector(store=None)
    assert ConnectorCapability.READ_USER_DATA in connector.capabilities()
