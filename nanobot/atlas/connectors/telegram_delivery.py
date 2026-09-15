"""Telegram delivery connector for Atlas notifications and approval requests.

Implements :class:`~nanobot.atlas.connectors.base.MessagingConnector` using the
EXISTING nanobot Telegram channel credential (``TELEGRAM_BOT_TOKEN``) — no new
messaging runtime, no second bot. Delivery goes over the Bot API ``sendMessage``
endpoint with a bounded timeout; external sends happen only for real
notifications or policy-approved requests.

The demo card shows: the user's request, connector source, concise evidence,
the recommendation, freshness/sandbox labeling, provider-unavailable state when
relevant, and an approval-required marker when a follow-up action would have an
external side effect.
"""

from __future__ import annotations

from typing import Any

import httpx

from nanobot.atlas.connectors.base import ConnectorContext
from nanobot.atlas.connectors.credentials import read_secret
from nanobot.atlas.contracts import (
    ApprovalRequest,
    ConnectorCapability,
    ConnectorErrorInfo,
    ConnectorResult,
    ConnectorStatus,
    EvidenceItem,
    Recommendation,
)
from nanobot.atlas.policy import ConsentState, evaluate_consent

_SEND_URL = "https://api.telegram.org/bot{token}/sendMessage"
_GETME_URL = "https://api.telegram.org/bot{token}/getMe"
_DEFAULT_TIMEOUT = 15.0


class TelegramDeliveryConnector:
    """Delivers Atlas notifications/approvals to the authenticated user's chat."""

    def __init__(self, *, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    @property
    def name(self) -> str:
        return "telegram"

    def capabilities(self) -> frozenset[ConnectorCapability]:
        return frozenset({ConnectorCapability.SEND_COMMUNICATION})

    @staticmethod
    def _token() -> str:
        # Placeholders are rejected here so they can never be embedded in a
        # Telegram API URL or payload (security rule 6).
        return read_secret("TELEGRAM_BOT_TOKEN")

    @classmethod
    def is_configured(cls) -> bool:
        return bool(cls._token())

    # -- consent ------------------------------------------------------------------

    def _consent_error(self, ctx: ConnectorContext) -> ConnectorErrorInfo | None:
        if not isinstance(ctx.consent, ConsentState):
            return ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                      message="no server-stored consent for telegram delivery")
        verdict = evaluate_consent(ctx.atlas_context, ctx.consent)
        if not verdict.allowed:
            return ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                      message=f"consent gate: {verdict.reason_code}")
        return None

    # -- card formatting -------------------------------------------------------------

    @staticmethod
    def format_demo_card(
        *,
        user_request: str,
        connector: str,
        evidence: list[EvidenceItem],
        recommendation: Recommendation | None,
        provider_unavailable: bool = False,
        approval_required: bool = False,
        sandbox: bool = False,
    ) -> str:
        """Human-readable demo card (bounded length, no secrets)."""
        lines: list[str] = ["🧭 *Atlas*", ""]
        lines.append(f"_{(user_request or '')[:200]}_")
        lines.append("")
        lines.append(f"*Source:* {connector}")
        if provider_unavailable:
            lines.append("*State:* ⚠️ provider unavailable — showing cached/fallback only")
        for item in evidence[:3]:
            marker = "🟢" if item.state == "fresh" else "🟡" if item.state == "stale" else "🔴"
            label = " [SANDBOX]" if sandbox else ""
            lines.append(f"{marker} {item.content[:160]}{label}")
        if recommendation is not None:
            lines.append("")
            lines.append(f"*Recommendation:* {recommendation.title[:200]}")
            if recommendation.rationale:
                lines.append(recommendation.rationale[:400])
        if approval_required:
            lines.append("")
            lines.append("🔐 _Next action requires your approval — nothing was executed._")
        return "\n".join(lines)[:3800]

    # -- delivery -----------------------------------------------------------------

    async def health_check(self) -> ConnectorResult:
        token = self._token()
        if not token:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.NOT_CONFIGURED,
                error=ConnectorErrorInfo(status=ConnectorStatus.NOT_CONFIGURED,
                                         message="TELEGRAM_BOT_TOKEN not set"),
            )
        client = self._client or httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT)
        own = self._client is None
        try:
            response = await client.get(_GETME_URL.format(token=token))
        except httpx.HTTPError:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.UNAVAILABLE,
                error=ConnectorErrorInfo(status=ConnectorStatus.UNAVAILABLE,
                                         message="telegram unreachable"),
            )
        finally:
            if own:
                await client.aclose()
        if response.status_code == 401:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.UNAUTHORIZED,
                error=ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                         message="bot token rejected"),
            )
        try:
            body: dict[str, Any] = response.json()
        except ValueError:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.MALFORMED,
                error=ConnectorErrorInfo(status=ConnectorStatus.MALFORMED,
                                         message="non-JSON telegram response"),
            )
        if body.get("ok") is True:
            return ConnectorResult(connector=self.name, status=ConnectorStatus.OK)
        return ConnectorResult(
            connector=self.name, status=ConnectorStatus.PROVIDER_ERROR,
            error=ConnectorErrorInfo(status=ConnectorStatus.PROVIDER_ERROR,
                                     message=str(body.get("description", ""))[:500]),
        )

    async def deliver_notification(self, ctx: ConnectorContext, text: str) -> ConnectorResult:
        consent_err = self._consent_error(ctx)
        if consent_err is not None:
            return ConnectorResult(connector=self.name, status=consent_err.status,
                                   error=consent_err)
        token = self._token()
        if not token:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.NOT_CONFIGURED,
                error=ConnectorErrorInfo(status=ConnectorStatus.NOT_CONFIGURED,
                                         message="TELEGRAM_BOT_TOKEN not set"),
            )
        chat_id = str(getattr(ctx, "chat_id", "") or "")
        if not chat_id:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.PROVIDER_ERROR,
                error=ConnectorErrorInfo(status=ConnectorStatus.PROVIDER_ERROR,
                                         message="no server-derived chat id on context"),
            )
        client = self._client or httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT)
        own = self._client is None
        try:
            response = await client.post(
                _SEND_URL.format(token=token),
                json={"chat_id": chat_id, "text": text[:4000], "parse_mode": "Markdown"},
            )
        except httpx.HTTPError:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.UNAVAILABLE,
                error=ConnectorErrorInfo(status=ConnectorStatus.UNAVAILABLE,
                                         message="telegram unreachable"),
            )
        finally:
            if own:
                await client.aclose()
        if response.status_code == 401:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.UNAUTHORIZED,
                error=ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                         message="bot token rejected"),
            )
        if response.status_code == 429:
            retry_raw = response.headers.get("Retry-After", "")
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.RATE_LIMITED,
                error=ConnectorErrorInfo(status=ConnectorStatus.RATE_LIMITED, http_status=429,
                                         message="telegram flood limit"),
                retry_after_seconds=int(retry_raw) if retry_raw.isdigit() else None,
            )
        try:
            body: dict[str, Any] = response.json()
        except ValueError:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.MALFORMED,
                error=ConnectorErrorInfo(status=ConnectorStatus.MALFORMED,
                                         message="non-JSON telegram response"),
            )
        if body.get("ok") is True:
            return ConnectorResult(connector=self.name, status=ConnectorStatus.OK)
        return ConnectorResult(
            connector=self.name, status=ConnectorStatus.PROVIDER_ERROR,
            error=ConnectorErrorInfo(status=ConnectorStatus.PROVIDER_ERROR,
                                     message=str(body.get("description", ""))[:500]),
        )

    async def deliver_approval(
        self, ctx: ConnectorContext, approval: ApprovalRequest
    ) -> ConnectorResult:
        """Deliver an approval card. The approval binding fields are echoed so the
        callback can be re-validated server-side (user, action, nonce, hash, expiry)."""
        text = (
            "🔐 *Atlas approval request*\n"
            f"Action: `{approval.action_type}`\n"
            f"Expires: {approval.expires_at.isoformat()}\n"
            "_Approve/deny from the WebUI or reply with the approval code._"
        )
        return await self.deliver_notification(ctx, text)


__all__ = ["TelegramDeliveryConnector"]
