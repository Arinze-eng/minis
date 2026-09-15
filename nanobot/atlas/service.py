"""Atlas edge service (directive §3 integration flow).

The single extension point between the existing nanobot runtime (channels,
WebUI, API) and Atlas. Flow per request:

    channel or trigger
      -> AtlasRequest (server-verified identity, bounded fields)
      -> AuthenticatedAtlasContext
      -> consent + capability policy (chain gate, deterministic)
      -> chain selector (one Strands Agent, bounded tools)
      -> connector/tool calls -> normalized evidence
      -> recommendation (no side effects)
      -> optional channel delivery (explicit send flag only)

Preservation rules:
- The nanobot AgentLoop/AgentRunner are untouched; this adapter is invoked
  from channel handlers or cron triggers that already own verified identity.
- Delivery identity (chat id) is server-derived from the channel linkage —
  never from model output and never from the request payload.
- External delivery requires an explicit send flag AND connector consent;
  without both, results are returned to the caller only.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from typing import Any

from nanobot.atlas.chain import AtlasChain, AtlasChainError, ChainInput
from nanobot.atlas.contracts import AuthenticatedAtlasContext, ConnectorResult, ConnectorStatus
from nanobot.atlas.model_factory import create_atlas_model
from nanobot.atlas.store import AtlasStore, LocalAtlasStore

# scenario -> (connector registry name, required capability family)
_SCENARIO_CONNECTORS: dict[str, str] = {
    "task_start": "google_tasks",
    "money_guard": "plaid",
    "shopping_research": "serpapi",
    "email_summary": "gmail",
    # wardrobe_research uses the store-backed adapter (no external provider).
    "wardrobe_research": "wardrobe_store",
}

# Public read-only view for CLIs/diagnostics.
SCENARIO_CONNECTORS: dict[str, str] = dict(_SCENARIO_CONNECTORS)


@dataclass(frozen=True)
class AtlasRequest:
    """One bounded Atlas request from a channel/trigger.

    ``user_id`` MUST be the server-verified principal (channel identity
    linkage or Supabase token subject). Client-supplied identifiers are
    ignored by policy; adapters must never accept them as identity.
    """

    user_id: str
    scenario: str
    query: str
    # Explicit opt-in for external delivery (rule: no implicit sends).
    send_flag: bool = False
    # Server-derived delivery target from the channel linkage (never payload).
    chat_id: str | None = None


@dataclass
class AtlasResponse:
    """Typed service outcome delivered back to the interaction surface."""

    scenario: str
    status: ConnectorStatus
    reason_code: str
    connector: str
    recommendation_text: str | None = None
    evidence_count: int = 0
    delivered: bool = False
    delivery_status: str | None = None
    provider_info: dict[str, str] = field(default_factory=dict)


class AtlasService:
    """Edge adapter owning request routing, consent lookup, and delivery."""

    def __init__(self, store: AtlasStore | None = None, *, env: dict[str, str] | None = None) -> None:
        self._store = store if store is not None else LocalAtlasStore()
        self._env = env

    # -- connector resolution ------------------------------------------------

    def _connector_for(self, scenario: str) -> Any | None:
        """Resolve the scenario's connector, or None when not configured.

        External connectors are enabled only by their env flag + credentials
        (see ``registry.is_connector_enabled``); wardrobe uses the store.
        """
        name = _SCENARIO_CONNECTORS.get(scenario)
        if name is None:
            return None
        if name == "wardrobe_store":
            from nanobot.atlas.wardrobe import WardrobeStoreConnector

            return WardrobeStoreConnector(self._store)
        from nanobot.atlas.connectors.registry import is_connector_enabled

        if not is_connector_enabled(name, env=self._env):
            return None
        if name == "google_tasks":
            from nanobot.atlas.connectors.google_tasks import GoogleTasksConnector

            return GoogleTasksConnector()
        if name == "gmail":
            from nanobot.atlas.connectors.gmail import GmailConnector

            return GmailConnector()
        if name == "plaid":
            from nanobot.atlas.connectors.plaid import PlaidConnector

            return PlaidConnector()
        if name == "serpapi":
            from nanobot.atlas.connectors.serpapi import SerpApiConnector

            return SerpApiConnector()
        return None

    # -- request handling ------------------------------------------------------

    async def handle_request(self, request: AtlasRequest) -> AtlasResponse:
        connector_name = _SCENARIO_CONNECTORS.get(request.scenario, "none")
        connector = self._connector_for(request.scenario)
        if connector is None:
            return AtlasResponse(
                scenario=request.scenario,
                status=ConnectorStatus.NOT_CONFIGURED,
                reason_code="connector_disabled",
                connector=connector_name,
            )

        # Server-stored consent only: the chain's policy gate re-validates it
        # (expiry/revocation/scope) before any connector access.
        consent = self._store.get_consent(request.user_id, connector.name)
        if consent is None:
            return AtlasResponse(
                scenario=request.scenario,
                status=ConnectorStatus.UNAUTHORIZED,
                reason_code="consent_missing",
                connector=connector.name,
            )


        try:
            handle = create_atlas_model(env=self._env)
        except Exception:  # noqa: BLE001 - model factory raises its own error type
            handle = None
        if handle is None:
            return AtlasResponse(
                scenario=request.scenario,
                status=ConnectorStatus.NOT_CONFIGURED,
                reason_code="model_unconfigured",
                connector=connector.name,
            )
        # The chain's policy gate reads the verified context from the handle.
        # ModelHandle is frozen, so the context is attached via replace().
        handle = dataclasses.replace(
            handle,
            atlas_context=self._verified_context(request.user_id, connector.name),
        )

        chain = AtlasChain(connector=connector, model_handle=handle, consent=consent)
        try:
            result = await chain.run(ChainInput(
                user_id=request.user_id,
                scenario=request.scenario,
                query=request.query,
                consent=consent,
                chat_id=request.chat_id,
            ))
        except AtlasChainError as exc:
            status = (
                ConnectorStatus.UNAUTHORIZED if exc.reason_code == "policy_denied"
                else ConnectorStatus.PROVIDER_ERROR
            )
            return AtlasResponse(
                scenario=request.scenario, status=status,
                reason_code=exc.reason_code, connector=connector.name,
                provider_info=handle.describe(),
            )

        response = AtlasResponse(
            scenario=request.scenario,
            status=result.status,
            reason_code=result.reason_code,
            connector=connector.name,
            recommendation_text=(
                f"{result.recommendation.title}: {result.recommendation.rationale}"
                if result.recommendation else None
            ),
            evidence_count=len(result.evidence),
            provider_info=result.provider_info,
        )
        if request.send_flag and request.chat_id and response.recommendation_text:
            response = await self._deliver(request, response)
        return response

    # -- verified identity -----------------------------------------------------

    @staticmethod
    def _verified_context(user_id: str, connector_name: str) -> Any:
        """Verified context carrying the READ scope family the connector needs.

        Scopes derive ONLY from the server-side scenario→connector map — never
        from the request payload (client-supplied authorization is ignored).
        ``SEND_COMMUNICATION`` is intentionally excluded here: delivery consent
        is validated separately in ``_deliver``.
        """
        from nanobot.atlas.contracts import ConsentScope

        scope = (
            ConsentScope.READ_PUBLIC if connector_name == "serpapi"
            else ConsentScope.READ_PROFILE
        )  # gmail joins google_tasks/plaid/wardrobe on READ_PROFILE
        return AuthenticatedAtlasContext(
            user_id=user_id, auth_source="channel_identity", scopes=frozenset({scope})
        )

    # -- delivery (§2.5: explicit flag + trusted destination) --------------------

    async def _deliver(self, request: AtlasRequest, response: AtlasResponse) -> AtlasResponse:
        from nanobot.atlas.connectors.registry import is_connector_enabled
        from nanobot.atlas.connectors.telegram_delivery import TelegramDeliveryConnector
        from nanobot.atlas.contracts import ConnectorCapability

        if not is_connector_enabled("telegram", env=self._env):
            response.delivery_status = "telegram_disabled"
            return response
        delivery_consent = self._store.get_consent(request.user_id, "telegram")
        if delivery_consent is None:
            response.delivery_status = "consent_missing"
            return response

        from nanobot.atlas.connectors.base import ConnectorContext
        from nanobot.atlas.contracts import AuthenticatedAtlasContext

        telegram = TelegramDeliveryConnector()
        # Server-derived destination carried in the typed context field.
        ctx = ConnectorContext(
            user_id=request.user_id,
            atlas_context=AuthenticatedAtlasContext(
                user_id=request.user_id, auth_source="channel_identity"
            ),
            consent=delivery_consent,
            trace_id="atlas-service",
            chat_id=request.chat_id,
        )
        # Capability check: the connector must declare SEND and the consent
        # record must match the telegram connector exactly.
        if ConnectorCapability.SEND_COMMUNICATION not in telegram.capabilities():
            response.delivery_status = "capability_missing"
            return response
        result: ConnectorResult = await telegram.deliver_notification(
            ctx, response.recommendation_text or ""
        )
        response.delivered = result.status is ConnectorStatus.OK
        response.delivery_status = result.status.value
        return response


__all__ = ["AtlasRequest", "AtlasResponse", "AtlasService", "SCENARIO_CONNECTORS"]
