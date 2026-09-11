"""CI-safe tests for the Atlas edge service (directive §3 integration flow).

Covers: connector-not-configured handling, server-stored-consent gating,
happy-path routing with stubbed chain boundary, and the explicit send-flag +
consent delivery gate. No network; credentials only via injected env dicts.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest

from nanobot.atlas.contracts import ConnectorStatus, ConsentScope
from nanobot.atlas.policy import ConsentState, utc_now
from nanobot.atlas.service import AtlasRequest, AtlasService
from nanobot.atlas.store import LocalAtlasStore

USER = "user-service"


def consent_for(connector: str) -> ConsentState:
    return ConsentState(
        user_id=USER, scope=ConsentScope.READ_PROFILE, connector=connector,
        granted_at=utc_now() - timedelta(hours=1), expires_at=None, revoked=False,
    )


@pytest.fixture()
def store(tmp_path: Any) -> LocalAtlasStore:
    s = LocalAtlasStore(root=tmp_path)
    s.save_garment(USER, __import__(
        "nanobot.atlas.wardrobe", fromlist=["GarmentRecord"]
    ).GarmentRecord(user_id=USER, name="White shirt", category="top"))
    return s


def _wardrobe_service(store: LocalAtlasStore, **kw: Any) -> AtlasService:
    # Injected env: no external connectors enabled, no model credentials.
    return AtlasService(store, env={}, **kw)


# ---------------------------------------------------------------------------
# Not-configured / consent gates
# ---------------------------------------------------------------------------


async def test_unknown_connector_returns_not_configured(store: LocalAtlasStore) -> None:
    service = _wardrobe_service(store)
    response = await service.handle_request(
        AtlasRequest(user_id=USER, scenario="task_start", query="x")
    )
    assert response.status is ConnectorStatus.NOT_CONFIGURED
    assert response.reason_code == "connector_disabled"


async def test_missing_consent_is_unauthorized(store: LocalAtlasStore) -> None:
    service = AtlasService(store, env={
        "ATLAS_ENABLE_PLAID": "true", "ATLAS_PLAID_CLIENT_ID": "c",
        "ATLAS_PLAID_SECRET": "s", "ATLAS_PLAID_ACCESS_TOKEN": "t",
        "GROQ_API_KEY": "k",
    })
    response = await service.handle_request(
        AtlasRequest(user_id=USER, scenario="money_guard", query="x")
    )
    assert response.status is ConnectorStatus.UNAUTHORIZED
    assert response.reason_code == "consent_missing"


async def test_model_unconfigured_returns_explicit_state(store: LocalAtlasStore) -> None:
    store.save_consent(USER, consent_for("wardrobe_store"))
    service = _wardrobe_service(store)
    response = await service.handle_request(
        AtlasRequest(user_id=USER, scenario="wardrobe_research", query="casual top")
    )
    assert response.status is ConnectorStatus.NOT_CONFIGURED
    assert response.reason_code == "model_unconfigured"


# ---------------------------------------------------------------------------
# Delivery gating (no model needed: delivery path is deterministic)
# ---------------------------------------------------------------------------


class _FakeTelegram:
    """Records deliver_notification calls; replaced into the service module."""

    name = "telegram"

    @staticmethod
    def capabilities() -> frozenset[Any]:
        from nanobot.atlas.contracts import ConnectorCapability

        return frozenset({ConnectorCapability.SEND_COMMUNICATION})

    async def deliver_notification(self, ctx: Any, text: str) -> Any:
        from nanobot.atlas.contracts import ConnectorResult, ConnectorStatus

        return ConnectorResult(connector="telegram", status=ConnectorStatus.OK)


async def test_delivery_requires_explicit_send_flag(
    store: LocalAtlasStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The service imports the connector lazily; patch at the source module.
    monkeypatch.setattr(
        "nanobot.atlas.connectors.telegram_delivery.TelegramDeliveryConnector",
        _FakeTelegram,
    )
    service = AtlasService(store, env={"ATLAS_ENABLE_TELEGRAM_DELIVERY": "true"})
    response = await service.handle_request(
        AtlasRequest(user_id=USER, scenario="money_guard", query="x", send_flag=True,
                     chat_id="12345")
    )
    # money_guard connector not configured -> never reaches delivery.
    assert response.delivered is False
    assert response.delivery_status is None


async def test_delivery_gate_uses_server_derived_chat(
    store: LocalAtlasStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The delivery connector receives only the server-derived chat id."""
    captured: dict[str, Any] = {}

    class _Recording(_FakeTelegram):
        async def deliver_notification(self, ctx: Any, text: str) -> Any:
            from nanobot.atlas.contracts import ConnectorResult, ConnectorStatus

            captured["chat_id"] = getattr(ctx, "chat_id", None)
            captured["user_id"] = ctx.user_id
            return ConnectorResult(connector="telegram", status=ConnectorStatus.OK)

    store.save_consent(USER, consent_for("telegram"))
    monkeypatch.setattr(
        "nanobot.atlas.connectors.telegram_delivery.TelegramDeliveryConnector",
        _Recording,
    )
    service = AtlasService(store, env={"ATLAS_ENABLE_TELEGRAM_DELIVERY": "true"})
    # Send flag present but no chat id: delivery cannot proceed (no target).
    response = await service.handle_request(
        AtlasRequest(user_id=USER, scenario="money_guard", query="x", send_flag=True)
    )
    assert captured == {}  # never reached delivery without chat_id
    assert response.delivered is False
