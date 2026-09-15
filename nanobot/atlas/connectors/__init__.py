"""Atlas real-connector interfaces.

Typed adapter interfaces for real providers (SerpApi, Google Tasks, Telegram
delivery, Plaid read-only, Gmail compose). Adapters normalize provider
responses into Atlas contracts, preserve provider identity via
:class:`~nanobot.atlas.contracts.ProviderRef`, and report every outcome with
the explicit :class:`~nanobot.atlas.contracts.ConnectorStatus` taxonomy.

Fixture implementations of these interfaces exist only for unit tests,
offline development, deterministic failure testing, and provider-unavailable
fallback — never as the primary product experience.
"""

from nanobot.atlas.connectors.base import (
    AtlasConnector,
    ConnectorContext,
    FinancialDataConnector,
    MailDraftConnector,
    MessagingConnector,
    ProductResearchConnector,
    TaskConnector,
)
from nanobot.atlas.connectors.registry import (
    OAUTH_NOTES,
    SPECS,
    ConnectorSpec,
    configured_connectors,
    connector_config_from_env,
    is_connector_enabled,
    resolve_connector_spec,
)

__all__ = [
    "AtlasConnector",
    "ConnectorContext",
    "ConnectorSpec",
    "FinancialDataConnector",
    "MailDraftConnector",
    "MessagingConnector",
    "OAUTH_NOTES",
    "ProductResearchConnector",
    "SPECS",
    "TaskConnector",
    "configured_connectors",
    "connector_config_from_env",
    "is_connector_enabled",
    "resolve_connector_spec",
]
