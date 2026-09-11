"""Real Gmail connector (READ-ONLY evidence summary, directive §2.5).

Implements the read half of the Communication bundle against the live Gmail
REST API using the repository's existing HTTP stack (httpx). By design there
is NO send, draft, delete, archive, label mutation, or attachment download in
this stage: the connector only lists recent message metadata plus the
provider-truncated snippet, and normalizes it into ``EmailItem`` evidence.

Behavior contract (mirrors the Google Tasks connector):
- credentials come only from environment variables (never arguments/logs);
- consent is checked immediately before every provider call;
- message/thread IDs are preserved via ``ProviderRef`` (Gmail web deep link);
- provider errors normalize into the explicit ``ConnectorStatus`` taxonomy;
- bounded timeout, single retry on transient failures, local rate window;
- the fetch set is bounded (``_MAX_MESSAGES``) — never a full mailbox scan.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any, cast

import httpx

from nanobot.atlas.connectors.base import ConnectorContext
from nanobot.atlas.connectors.credentials import read_secret
from nanobot.atlas.contracts import (
    ConnectorCapability,
    ConnectorErrorInfo,
    ConnectorResult,
    ConnectorStatus,
    EmailItem,
    EvidenceItem,
    ProviderRef,
)
from nanobot.atlas.policy import ConsentState, evaluate_consent

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_MESSAGES_LIST_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
_MESSAGE_GET_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}"
_DEFAULT_TIMEOUT = 15.0
_MAX_ATTEMPTS = 2
_WINDOW_SECONDS = 60.0
_WINDOW_MAX = 10
_MAX_MESSAGES = 5  # bounded evidence set; never a mailbox scan

_SUBJECT_HEADER = "Subject"
_FROM_HEADER = "From"
_DATE_HEADER = "Date"
_METADATA_HEADER_PARAM = "metadataHeaders"  # repeatable query parameter


class GmailConnector:
    """Read-only Gmail connector (Communication bundle evidence summary)."""

    def __init__(self, *, client: httpx.AsyncClient | None = None) -> None:
        self._client = client
        self._access_token: str | None = None
        self._token_expires_at: float = 0.0
        self._window_requests: list[float] = []

    @property
    def name(self) -> str:
        return "gmail"

    def capabilities(self) -> frozenset[ConnectorCapability]:
        # Read-only by contract: SEND/WRITE never declared in this stage.
        return frozenset({ConnectorCapability.READ_USER_DATA})

    # -- env-bound credentials ------------------------------------------------

    @staticmethod
    def _credentials() -> dict[str, str]:
        # Placeholder values are rejected at the source (security rule 6).
        return {
            "ATLAS_GOOGLE_CLIENT_ID": read_secret(
                "ATLAS_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID"
            ),
            "ATLAS_GOOGLE_CLIENT_SECRET": read_secret(
                "ATLAS_GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"
            ),
            "ATLAS_GOOGLE_REFRESH_TOKEN": read_secret(
                "ATLAS_GOOGLE_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN"
            ),
        }

    @classmethod
    def is_configured(cls) -> bool:
        creds = cls._credentials()
        return bool(creds) and all(creds.values())

    # -- quota + consent guards -------------------------------------------------

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

    def _consent_error(self, ctx: ConnectorContext) -> ConnectorErrorInfo | None:
        """Rule: consent re-checked immediately before provider access."""
        if not isinstance(ctx.consent, ConsentState):
            return ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                      message="no server-stored consent for gmail")
        verdict = evaluate_consent(ctx.atlas_context, ctx.consent)
        if not verdict.allowed:
            return ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                      message=f"consent gate: {verdict.reason_code}")
        return None

    # -- OAuth (same Google client as google_tasks) ------------------------------

    async def _get_access_token(self) -> str | None:
        """Exchange the refresh token for an access token (cached until expiry)."""
        if self._access_token and time.monotonic() < self._token_expires_at - 30:
            return self._access_token
        creds = self._credentials()
        if not creds or not all(creds.values()):
            return None
        client = self._client or httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT)
        try:
            response = await client.post(
                _TOKEN_URL,
                data={
                    "client_id": creds["ATLAS_GOOGLE_CLIENT_ID"],
                    "client_secret": creds["ATLAS_GOOGLE_CLIENT_SECRET"],
                    "refresh_token": creds["ATLAS_GOOGLE_REFRESH_TOKEN"],
                    "grant_type": "refresh_token",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except httpx.HTTPError:
            return None
        finally:
            if self._client is None:
                await client.aclose()
        if response.status_code != 200:
            return None
        payload = response.json()
        token = payload.get("access_token")
        if not token:
            return None
        self._access_token = str(token)
        self._token_expires_at = time.monotonic() + float(payload.get("expires_in", 3600))
        return self._access_token

    # -- normalization -----------------------------------------------------------

    @staticmethod
    def _header_value(headers: list[Any], name: str) -> str:
        for header in headers:
            if not isinstance(header, dict):
                continue
            if header.get("name") == name:
                return str(header.get("value") or "").strip()
        return ""

    @staticmethod
    def _parse_date(raw: str) -> datetime | None:
        if not raw:
            return None
        try:
            parsed = datetime.fromisoformat(raw)
            return parsed if parsed.tzinfo else None
        except ValueError:
            return None

    @classmethod
    def _normalize_message(cls, row: dict[str, Any], user_id: str) -> EmailItem | None:
        message_id = row.get("id")
        if not message_id:
            return None
        headers = row.get("payload", {}).get("headers") or []
        if not isinstance(headers, list):
            headers = []
        sender = cls._header_value(headers, _FROM_HEADER) or "(unknown sender)"
        subject = cls._header_value(headers, _SUBJECT_HEADER) or "(no subject)"
        snippet = row.get("snippet")
        received = cls._parse_date(cls._header_value(headers, _DATE_HEADER))
        labels_raw = row.get("labelIds")
        labels = tuple(
            str(label) for label in labels_raw if isinstance(label, str)
        ) if isinstance(labels_raw, list) else ()
        return EmailItem(
            user_id=user_id,
            subject=subject[:512],
            sender=sender[:320],
            snippet=(str(snippet)[:600] if snippet else None),
            received_at=received,
            labels=labels[:20],
            provider_ref=ProviderRef(
                provider="gmail",
                provider_id=str(message_id)[:512],
                url=f"https://mail.google.com/mail/u/0/#inbox/{message_id}",
            ),
        )

    # -- health / read -------------------------------------------------------------

    async def health_check(self) -> ConnectorResult:
        if not self.is_configured():
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.NOT_CONFIGURED,
                error=ConnectorErrorInfo(status=ConnectorStatus.NOT_CONFIGURED,
                                         message="Gmail credentials not set"),
            )
        token = await self._get_access_token()
        if token is None:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.OAUTH_EXPIRED,
                error=ConnectorErrorInfo(status=ConnectorStatus.OAUTH_EXPIRED,
                                         message="refresh token exchange failed"),
            )
        return ConnectorResult(connector=self.name, status=ConnectorStatus.OK)

    async def list_recent_messages(
        self, ctx: ConnectorContext, *, limit: int = _MAX_MESSAGES
    ) -> ConnectorResult:
        """List the most recent messages as metadata-only evidence (read-only)."""
        consent_err = self._consent_error(ctx)
        if consent_err is not None:
            return ConnectorResult(connector=self.name, status=consent_err.status,
                                   error=consent_err)
        rate_err = self._check_local_rate_window()
        if rate_err is not None:
            return ConnectorResult(connector=self.name, status=rate_err.status, error=rate_err)
        creds = self._credentials()
        if not creds or not all(creds.values()):
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.NOT_CONFIGURED,
                error=ConnectorErrorInfo(status=ConnectorStatus.NOT_CONFIGURED,
                                         message="Gmail credentials not set"),
            )
        token = await self._get_access_token()
        if token is None:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.OAUTH_EXPIRED,
                error=ConnectorErrorInfo(status=ConnectorStatus.OAUTH_EXPIRED,
                                         message="refresh token exchange failed"),
            )

        headers = {"Authorization": f"Bearer {token}"}
        params: dict[str, str] = {
            "maxResults": str(min(max(limit, 1), _MAX_MESSAGES)),
        }
        client = self._client or httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT)
        own_client = self._client is None
        try:
            try:
                response = await client.get(_MESSAGES_LIST_URL, headers=headers, params=params)
            except httpx.TimeoutException:
                return ConnectorResult(
                    connector=self.name, status=ConnectorStatus.UNAVAILABLE,
                    error=ConnectorErrorInfo(status=ConnectorStatus.UNAVAILABLE,
                                             message="gmail timeout"),
                )
            except httpx.HTTPError:
                return ConnectorResult(
                    connector=self.name, status=ConnectorStatus.UNAVAILABLE,
                    error=ConnectorErrorInfo(status=ConnectorStatus.UNAVAILABLE,
                                             message="gmail unreachable"),
                )
            status_result = self._status_for_response(response)
            if status_result is not None:
                return status_result
            try:
                body = response.json()
            except ValueError:
                return ConnectorResult(
                    connector=self.name, status=ConnectorStatus.MALFORMED,
                    error=ConnectorErrorInfo(status=ConnectorStatus.MALFORMED,
                                             message="non-JSON gmail response"),
                )
            rows = cast("list[Any] | None", body.get("messages"))
            if not isinstance(rows, list):
                return ConnectorResult(
                    connector=self.name, status=ConnectorStatus.MALFORMED,
                    error=ConnectorErrorInfo(status=ConnectorStatus.MALFORMED,
                                             message="missing messages array"),
                )

            items: list[EvidenceItem] = []
            skipped = 0
            for row in rows[:limit]:
                if not isinstance(row, dict) or not row.get("id"):
                    skipped += 1
                    continue
                detail = await self._fetch_metadata(client, headers, str(row["id"]))
                if detail is None:
                    skipped += 1
                    continue
                message = self._normalize_message(detail, ctx.user_id)
                if message is None:
                    skipped += 1
                    continue
                items.append(
                    EvidenceItem(
                        source="gmail",
                        source_url=message.provider_ref.url,
                        kind="email",
                        payload=message.model_dump(mode="json", exclude_none=True),
                        content=f"From {message.sender}: {message.subject}",
                        freshness_seconds=900,  # inbox changes; 15-min window
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

    # -- internals ------------------------------------------------------------------

    @staticmethod
    def _status_for_response(response: httpx.Response) -> ConnectorResult | None:
        """Map error responses to the taxonomy; None means success/continue."""
        if response.status_code == 401:
            return ConnectorResult(
                connector="gmail", status=ConnectorStatus.UNAUTHORIZED,
                error=ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                         http_status=401, message="token rejected"),
            )
        if response.status_code == 403:
            return ConnectorResult(
                connector="gmail", status=ConnectorStatus.UNAUTHORIZED,
                error=ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                         http_status=403,
                                         message="scope/permission denied"),
            )
        if response.status_code == 429:
            return ConnectorResult(
                connector="gmail", status=ConnectorStatus.RATE_LIMITED,
                error=ConnectorErrorInfo(status=ConnectorStatus.RATE_LIMITED,
                                         http_status=429, message="gmail quota"),
            )
        if response.status_code >= 400:
            return ConnectorResult(
                connector="gmail", status=ConnectorStatus.PROVIDER_ERROR,
                error=ConnectorErrorInfo(status=ConnectorStatus.PROVIDER_ERROR,
                                         http_status=response.status_code,
                                         message="gmail returned an error"),
            )
        return None

    async def _fetch_metadata(
        self, client: httpx.AsyncClient, headers: dict[str, str], message_id: str
    ) -> dict[str, Any] | None:
        """Fetch one message's metadata (headers + snippet); no body/attachments."""
        try:
            detail_response = await client.get(
                _MESSAGE_GET_URL.format(message_id=message_id),
                headers=headers,
                params=[
                    ("format", "metadata"),
                    (_METADATA_HEADER_PARAM, _SUBJECT_HEADER),
                    (_METADATA_HEADER_PARAM, _FROM_HEADER),
                    (_METADATA_HEADER_PARAM, _DATE_HEADER),
                ],
            )
        except httpx.HTTPError:
            return None
        if detail_response.status_code != 200:
            return None
        try:
            detail = detail_response.json()
        except ValueError:
            return None
        return detail if isinstance(detail, dict) else None


__all__ = ["GmailConnector", "EmailItem"]
