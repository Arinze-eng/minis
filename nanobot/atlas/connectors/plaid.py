"""Real Plaid Sandbox connector (read-only) for the Money Guard slice.

Implements :class:`~nanobot.atlas.connectors.base.FinancialDataConnector`
against the live Plaid Sandbox host using the repository's existing HTTP stack
(httpx). Write operations (transfers, payments, disputes, account changes) are
deliberately not implemented: rule 10 forbids financial mutations in the MVP,
and the Money Guard demo is read-only by contract.

Behavior contract (mirrors the Google Tasks connector):
- credentials come only from environment variables (never arguments/logs);
- consent is checked immediately before every provider call;
- provider IDs and timestamps are preserved via ``ProviderRef``;
- provider errors normalize into the explicit ``ConnectorStatus`` taxonomy;
- bounded timeout and a single retry with backoff on transient failures;
- responses normalize into ``TransactionItem`` evidence in ``ConnectorResult``
  with ``is_sandbox=True`` (sandbox data is always labeled as such).
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Any, cast

import httpx

from nanobot.atlas.connectors.base import ConnectorContext
from nanobot.atlas.connectors.credentials import read_secret
from nanobot.atlas.contracts import (
    ApprovalRequest,
    ConnectorCapability,
    ConnectorErrorInfo,
    ConnectorResult,
    ConnectorStatus,
    DraftAction,
    EvidenceItem,
    ProviderRef,
    TransactionItem,
    utc_now,
)
from nanobot.atlas.policy import ConsentState, evaluate_consent

_SANDBOX_URL = "https://sandbox.plaid.com/transactions/get"
_PRODUCTION_URL = "https://production.plaid.com/transactions/get"
_DEFAULT_TIMEOUT = 15.0
_MAX_ATTEMPTS = 2
# Per-user connector request window (quota guard shared across Atlas calls).
_WINDOW_SECONDS = 60.0
_WINDOW_MAX = 10
# Read a bounded window; Money Guard only needs recent history.
_MAX_ROWS = 100


class PlaidConnector:
    """Read-only Plaid Sandbox transactions connector (Money Guard demo path)."""

    def __init__(self, *, client: httpx.AsyncClient | None = None) -> None:
        self._client = client
        self._window_requests: list[float] = []

    @property
    def name(self) -> str:
        return "plaid"

    def capabilities(self) -> frozenset[ConnectorCapability]:
        return frozenset({ConnectorCapability.READ_USER_DATA})

    # -- env-bound credentials ------------------------------------------------

    @staticmethod
    def _credentials() -> dict[str, str]:
        # Placeholder values are rejected at the source, so they can never
        # reach a Plaid request (security rule 6).
        return {
            "client_id": read_secret("ATLAS_PLAID_CLIENT_ID", "PLAID_CLIENT_ID"),
            "secret": read_secret("ATLAS_PLAID_SECRET", "PLAID_SECRET"),
            "access_token": read_secret("ATLAS_PLAID_ACCESS_TOKEN", "PLAID_ACCESS_TOKEN"),
        }

    @classmethod
    def is_configured(cls) -> bool:
        return all(cls._credentials().values())

    # -- quota guard ------------------------------------------------------------

    def _check_local_rate_window(self) -> ConnectorErrorInfo | None:
        now = time.monotonic()
        self._window_requests = [t for t in self._window_requests if now - t < _WINDOW_SECONDS]
        if len(self._window_requests) >= _WINDOW_MAX:
            return ConnectorErrorInfo(
                status=ConnectorStatus.RATE_LIMITED,
                message="local connector rate window exhausted",
                retry_after_seconds=int(_WINDOW_SECONDS),
            )
        self._window_requests.append(now)
        return None

    # -- consent gate -----------------------------------------------------------

    def _consent_error(self, ctx: ConnectorContext) -> ConnectorErrorInfo | None:
        """Rule: consent re-checked immediately before provider access."""
        if not isinstance(ctx.consent, ConsentState):
            return ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                      message="no server-stored consent for plaid")
        verdict = evaluate_consent(ctx.atlas_context, ctx.consent)
        if not verdict.allowed:
            return ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                      message=f"consent gate: {verdict.reason_code}")
        return None

    # -- normalization ----------------------------------------------------------

    @staticmethod
    def _parse_amount(value: Any) -> float | None:
        try:
            amount = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
        return amount if amount == amount else None  # reject NaN

    @staticmethod
    def _parse_posted_at(value: Any) -> datetime | None:
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed

    @classmethod
    def _normalize_transaction(
        cls, row: dict[str, Any], user_id: str, account_names: dict[str, str]
    ) -> TransactionItem | None:
        """Normalize one Plaid transaction row; malformed rows return None."""
        provider_id = str(row.get("transaction_id") or "").strip()
        name = (row.get("name") or "").strip()
        amount = cls._parse_amount(row.get("amount"))
        if not provider_id or not name or amount is None:
            return None
        posted_at = cls._parse_posted_at(row.get("date"))
        account_id = str(row.get("account_id") or "").strip()
        account_name: str | None = None
        if account_id:
            resolved = account_names.get(account_id, "")
            account_name = resolved[:128] if resolved else None
        return TransactionItem(
            user_id=user_id,
            # Sandbox host only: this connector never reads production Plaid.
            is_sandbox=True,
            amount=abs(amount),
            currency=(row.get("iso_currency_code") or "USD").upper()[:3],
            merchant=name[:256],
            posted_at=posted_at,
            account_name=account_name,
            provider_ref=ProviderRef(
                provider="plaid",
                provider_id=provider_id[:512],
                provider_timestamp=str(row.get("datetime"))[:64] if row.get("datetime") else None,
            ),
        )

    # -- health / read -----------------------------------------------------------

    async def health_check(self) -> ConnectorResult:
        if not self.is_configured():
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.NOT_CONFIGURED,
                error=ConnectorErrorInfo(status=ConnectorStatus.NOT_CONFIGURED,
                                         message="Plaid credentials not set"),
            )
        return ConnectorResult(connector=self.name, status=ConnectorStatus.OK)

    async def list_transactions(
        self, ctx: ConnectorContext, *, days: int = 30
    ) -> ConnectorResult:
        """Fetch recent transactions via POST /transactions/get (read-only).

        ``days`` is bounded to [1, 180] to keep the window small.
        """
        consent_err = self._consent_error(ctx)
        if consent_err is not None:
            return ConnectorResult(connector=self.name, status=consent_err.status,
                                   error=consent_err)
        rate_err = self._check_local_rate_window()
        if rate_err is not None:
            return ConnectorResult(connector=self.name, status=rate_err.status, error=rate_err)

        creds = self._credentials()
        if not all(creds.values()):
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.NOT_CONFIGURED,
                error=ConnectorErrorInfo(status=ConnectorStatus.NOT_CONFIGURED,
                                         message="Plaid credentials not set"),
            )
        window_days = min(max(days, 1), 180)
        end_date = utc_now().date()
        start_date = end_date - _timedelta_days(window_days)
        body = {
            "client_id": creds["client_id"],
            "secret": creds["secret"],
            "access_token": creds["access_token"],
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "options": {"count": _MAX_ROWS, "offset": 0},
        }

        client = self._client or httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT)
        own_client = self._client is None
        try:
            for attempt in range(_MAX_ATTEMPTS):
                try:
                    response = await client.post(_SANDBOX_URL, json=body)
                except httpx.TimeoutException:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.UNAVAILABLE,
                        error=ConnectorErrorInfo(status=ConnectorStatus.UNAVAILABLE,
                                                 message="plaid timeout"),
                    )
                except httpx.HTTPError:
                    if attempt < _MAX_ATTEMPTS - 1:
                        await asyncio.sleep(0.5 * (attempt + 1))
                        continue
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.UNAVAILABLE,
                        error=ConnectorErrorInfo(status=ConnectorStatus.UNAVAILABLE,
                                                 message="plaid unreachable"),
                    )

                if response.status_code == 400:
                    # Plaid signals auth/session problems via INVALID_* errors.
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.UNAUTHORIZED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                                 http_status=400,
                                                 message="plaid rejected credentials or item"),
                    )
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.RATE_LIMITED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.RATE_LIMITED,
                                                 http_status=429, message="plaid quota"),
                        retry_after_seconds=int(retry_after) if retry_after and retry_after.isdigit() else None,
                    )
                if response.status_code >= 500 and attempt < _MAX_ATTEMPTS - 1:
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue
                if response.status_code >= 400:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.PROVIDER_ERROR,
                        error=ConnectorErrorInfo(status=ConnectorStatus.PROVIDER_ERROR,
                                                 http_status=response.status_code,
                                                 message="plaid returned an error"),
                    )

                try:
                    payload = response.json()
                except ValueError:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.MALFORMED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.MALFORMED,
                                                 message="non-JSON plaid response"),
                    )
                rows = cast("list[Any] | None", payload.get("transactions"))
                if not isinstance(rows, list):
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.MALFORMED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.MALFORMED,
                                                 message="missing transactions array"),
                    )
                accounts = payload.get("accounts")
                account_names: dict[str, str] = {}
                if isinstance(accounts, list):
                    for account_raw in cast("list[Any]", accounts):
                        if not isinstance(account_raw, dict):
                            continue
                        account = cast("dict[str, Any]", account_raw)
                        account_id = str(account.get("account_id") or "").strip()
                        if account_id:
                            account_names[account_id] = str(account.get("name") or "")[:128]

                items: list[EvidenceItem] = []
                skipped = 0
                for row in rows[:_MAX_ROWS]:
                    if not isinstance(row, dict):
                        skipped += 1
                        continue
                    txn = self._normalize_transaction(
                        cast("dict[str, Any]", row), ctx.user_id, account_names
                    )
                    if txn is None:
                        skipped += 1
                        continue
                    due_text = (
                        f" on {txn.posted_at.date().isoformat()}" if txn.posted_at else ""
                    )
                    items.append(
                        EvidenceItem(
                            source="plaid",
                            kind="transaction",
                            payload=txn.model_dump(mode="json", exclude_none=True),
                            content=(
                                f"{txn.merchant} {txn.amount:.2f} {txn.currency}{due_text}"
                                " [SANDBOX]"
                            ),
                            # Bank statements change rarely; 6-hour evidence window.
                            freshness_seconds=21600,
                            uncertainty=0.0,
                        )
                    )
                result = ConnectorResult(connector=self.name, status=ConnectorStatus.OK,
                                         items=items)
                if skipped:
                    result.trace = result.trace.model_copy(
                        update={"reason_code": f"skipped_malformed_rows:{skipped}"}
                    )
                return result
        finally:
            if own_client:
                await client.aclose()
        # Unreachable: loop always returns.
        return ConnectorResult(
            connector=self.name, status=ConnectorStatus.UNAVAILABLE,
            error=ConnectorErrorInfo(status=ConnectorStatus.UNAVAILABLE, message="exhausted"),
        )

    async def apply_financial_action(
        self, ctx: ConnectorContext, approval: ApprovalRequest, draft: DraftAction
    ) -> ConnectorResult:
        """Deliberately unimplemented: no financial mutations in the MVP (rule 10)."""
        return ConnectorResult(
            connector=self.name, status=ConnectorStatus.PROVIDER_ERROR,
            error=ConnectorErrorInfo(
                status=ConnectorStatus.PROVIDER_ERROR,
                message="financial writes are forbidden in the Money Guard MVP",
            ),
        )


def _timedelta_days(days: int):
    from datetime import timedelta

    return timedelta(days=days)


__all__ = ["PlaidConnector", "TransactionItem", "utc_now"]
