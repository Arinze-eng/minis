"""Typed connector interfaces for real Atlas providers.

Each interface is a narrow Protocol with one or two operations so adapters stay
small and replaceable. Contracts:

- Adapters never receive user identity from caller imagination: the
  authenticated ``user_id`` travels inside :class:`ConnectorContext`, which is
  constructed by the server from the verified Atlas context.
- Every operation returns :class:`~nanobot.atlas.contracts.ConnectorResult`;
  expected provider conditions (quota, auth expiry, downtime, malformed data)
  are statuses, not exceptions.
- Adapters normalize provider responses into Atlas contracts
  (:class:`~nanobot.atlas.contracts.ProductOffering`,
  :class:`~nanobot.atlas.contracts.TaskItem`,
  :class:`~nanobot.atlas.contracts.TransactionItem`) and preserve provider IDs,
  URLs, and timestamps via :class:`~nanobot.atlas.contracts.ProviderRef`.
- Credentials are resolved from the environment by the adapter; they are never
  accepted as tool arguments, never logged, and never persisted in Atlas
  records.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from nanobot.atlas.contracts import (
    ApprovalDelivery,
    ApprovalRequest,
    ConnectorResult,
    DraftAction,
)
from nanobot.atlas.policy import ConsentState


@runtime_checkable
class AtlasConnector(Protocol):
    """Base protocol every Atlas connector satisfies."""

    @property
    def name(self) -> str:
        """Stable connector name, e.g. ``"serpapi"``, ``"google_tasks"``."""
        ...

    def capabilities(self) -> frozenset[Any]:
        """ConnectorCapability values this connector declares."""
        ...

    async def health_check(self) -> ConnectorResult:
        """Cheap read-only liveness/auth probe (smoke-test entry point)."""
        ...


@runtime_checkable
class ProductResearchConnector(AtlasConnector, Protocol):
    """Read-only shopping/product research (SerpApi or approved equivalent)."""

    async def search_products(
        self, ctx: ConnectorContext, query: str, *, limit: int = 5
    ) -> ConnectorResult:
        """Return real product listings normalized to product evidence.

        Read-only by contract: no purchase, no cart mutation.
        """
        ...


@runtime_checkable
class TaskConnector(AtlasConnector, Protocol):
    """Task/deadline data (Google Tasks or approved equivalent)."""

    async def list_tasks(self, ctx: ConnectorContext) -> ConnectorResult:
        """Read existing tasks and deadlines (read-only)."""
        ...

    async def apply_task_action(
        self, ctx: ConnectorContext, approval: ApprovalRequest, draft: DraftAction
    ) -> ConnectorResult:
        """Create/update one task after policy approval.

        The adapter re-verifies the approval binding (user, action type,
        payload hash, nonce, expiry, idempotency key) before touching the
        provider, and addresses the provider task ID from ``draft.payload``
        when updating.
        """
        ...


@runtime_checkable
class MessagingConnector(AtlasConnector, Protocol):
    """Outbound delivery of notifications and approval requests (Telegram)."""

    async def deliver_notification(
        self, ctx: ConnectorContext, text: str
    ) -> ConnectorResult:
        """Deliver an Atlas notification to the authenticated user.

        The destination identity is the server-derived one from ``ctx`` —
        never an address supplied by the model or the payload.
        """
        ...

    async def deliver_approval(
        self, ctx: ConnectorContext, approval: ApprovalRequest
    ) -> ConnectorResult:
        """Deliver an approval request with a bound callback
        (:class:`~nanobot.atlas.contracts.ApprovalDelivery`).

        The callback must present user ID, action type, nonce, payload hash,
        and a non-expired timestamp, all re-validated server-side on receipt.
        """
        ...


@runtime_checkable
class FinancialDataConnector(AtlasConnector, Protocol):
    """Read-only financial data (Plaid Sandbox or approved read-only provider)."""

    async def list_transactions(
        self, ctx: ConnectorContext, *, days: int = 30
    ) -> ConnectorResult:
        """Return normalized read-only transactions.

        Sandbox data must be labeled ``is_sandbox=True`` when production bank
        data is not available. No transfers, payments, cancellations, or
        account mutations exist on this interface by construction.
        """
        ...


@runtime_checkable
class MailDraftConnector(AtlasConnector, Protocol):
    """Gmail draft creation after OAuth + scope verification (no auto-send)."""

    async def create_draft(
        self, ctx: ConnectorContext, approval: ApprovalRequest, draft: DraftAction
    ) -> ConnectorResult:
        """Create (never send) a draft after policy approval verification.

        Sending is out of scope for this interface until a separate, exact
        approval payload contract exists.
        """
        ...


class ConnectorContext:
    """Server-constructed per-call context for connector operations.

    Built by the server from the verified
    :class:`~nanobot.atlas.contracts.AuthenticatedAtlasContext` plus the
    relevant :class:`~nanobot.atlas.policy.ConsentState`. Connectors receive
    consent state (to double-check scope before any write) but never construct
    it.
    """

    def __init__(
        self,
        *,
        user_id: str,
        atlas_context: Any,
        consent: ConsentState | None,
        trace_id: str,
        timeout_seconds: float = 15.0,
        chat_id: str | None = None,
    ) -> None:
        self.user_id = user_id
        self.atlas_context = atlas_context
        self.consent = consent
        self.trace_id = trace_id
        self.timeout_seconds = timeout_seconds
        # Server-derived delivery target (e.g. Telegram chat). Never taken
        # from model output or request payloads.
        self.chat_id = chat_id

    def __repr__(self) -> str:  # pragma: no cover - trivial
        return (
            f"ConnectorContext(user_id={self.user_id!r}, trace_id={self.trace_id!r}, "
            f"timeout_seconds={self.timeout_seconds!r})"
        )


__all__ = [
    "AtlasConnector",
    "ConnectorContext",
    "FinancialDataConnector",
    "MailDraftConnector",
    "MessagingConnector",
    "ProductResearchConnector",
    "TaskConnector",
    "ApprovalDelivery",
]
