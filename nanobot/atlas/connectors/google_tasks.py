"""Real Google Tasks connector (read path) for the Atlas Task Start slice.

Implements :class:`~nanobot.atlas.connectors.base.TaskConnector`'s read half
against the live Google Tasks REST API using the repository's existing HTTP
stack (httpx). Write operations (``apply_task_action``) are deliberately not
implemented in this slice: task creation/update arrives only with the later
approval-gate stage.

Behavior contract (per stage requirements):
- credentials come only from environment variables (never arguments/logs);
- consent is checked immediately before every provider call;
- provider IDs, links, and timestamps are preserved via ``ProviderRef``;
- provider errors normalize into the explicit ``ConnectorStatus`` taxonomy;
- bounded timeout and a single retry with backoff on transient failures;
- responses normalize into ``TaskItem`` evidence in ``ConnectorResult``.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from nanobot.atlas.connectors.base import ConnectorContext
from nanobot.atlas.contracts import (
    ApprovalRequest,
    ConnectorCapability,
    ConnectorErrorInfo,
    ConnectorResult,
    ConnectorStatus,
    DraftAction,
    EvidenceItem,
    ProviderRef,
    TaskItem,
    utc_now,
)
from nanobot.atlas.policy import ConsentState, evaluate_consent

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_TASKS_LIST_URL = "https://tasks.googleapis.com/tasks/v1/lists/{list_id}/tasks"
_DEFAULT_TIMEOUT = 15.0
_MAX_ATTEMPTS = 2
# Per-user connector request window (quota guard shared across Atlas calls).
_WINDOW_SECONDS = 60.0
_WINDOW_MAX = 10


class GoogleTasksConnector:
    """Read-only Google Tasks connector (Task Start demo path)."""

    def __init__(self, *, client: httpx.AsyncClient | None = None) -> None:
        self._client = client
        self._access_token: str | None = None
        self._token_expires_at: float = 0.0
        self._window_requests: list[float] = []

    @property
    def name(self) -> str:
        return "google_tasks"

    def capabilities(self) -> frozenset[ConnectorCapability]:
        return frozenset({ConnectorCapability.READ_USER_DATA})

    # -- env-bound credentials ------------------------------------------------

    @staticmethod
    def _credentials() -> dict[str, str]:
        import os

        return {
            var: os.getenv(var, "").strip()
            for var in (
                "ATLAS_GOOGLE_CLIENT_ID",
                "ATLAS_GOOGLE_CLIENT_SECRET",
                "ATLAS_GOOGLE_REFRESH_TOKEN",
            )
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

    # -- consent gate -------------------------------------------------------------

    def _consent_error(self, ctx: ConnectorContext) -> ConnectorErrorInfo | None:
        """Rule: consent re-checked immediately before provider access."""
        if not isinstance(ctx.consent, ConsentState):
            return ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                      message="no server-stored consent for google_tasks")
        verdict = evaluate_consent(ctx.atlas_context, ctx.consent)
        if not verdict.allowed:
            return ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                      message=f"consent gate: {verdict.reason_code}")
        return None

    # -- OAuth ------------------------------------------------------------------

    async def _get_access_token(self) -> str | None:
        """Exchange the refresh token for an access token (cached until expiry)."""
        if self._access_token and time.monotonic() < self._token_expires_at - 30:
            return self._access_token
        creds = self._credentials()
        if not all(creds.values()):
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
    def _normalize_task(row: dict[str, Any], user_id: str) -> TaskItem | None:
        task_id = row.get("id")
        title = (row.get("title") or "").strip()
        if not task_id or not title:
            return None  # malformed rows are skipped and reported upstream
        from datetime import datetime

        due_raw = row.get("due")  # RFC 3339 e.g. 2026-09-12T10:00:00.000Z
        due_at = None
        if due_raw:
            try:
                due_at = datetime.fromisoformat(str(due_raw).replace("Z", "+00:00"))
            except ValueError:
                due_at = None
        return TaskItem(
            user_id=user_id,
            title=title[:512],
            notes=(row.get("notes") or None),
            due_at=due_at,
            completed=(row.get("status") == "completed"),
            task_list_id=None,  # filled by caller (list-level id)
            provider_ref=ProviderRef(
                provider="google_tasks",
                provider_id=str(task_id)[:512],
                url=f"https://tasks.google.com/task/{task_id}",
                provider_timestamp=str(row.get("updated"))[:64] if row.get("updated") else None,
            ),
        )

    # -- health / read -----------------------------------------------------------

    async def health_check(self) -> ConnectorResult:
        if not self.is_configured():
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.NOT_CONFIGURED,
                error=ConnectorErrorInfo(status=ConnectorStatus.NOT_CONFIGURED,
                                         message="Google Tasks credentials not set"),
            )
        token = await self._get_access_token()
        if token is None:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.OAUTH_EXPIRED,
                error=ConnectorErrorInfo(status=ConnectorStatus.OAUTH_EXPIRED,
                                         message="refresh token exchange failed"),
            )
        return ConnectorResult(connector=self.name, status=ConnectorStatus.OK)

    async def list_tasks(
        self, ctx: ConnectorContext, *, list_id: str = "@default", show_completed: bool = False
    ) -> ConnectorResult:
        consent_err = self._consent_error(ctx)
        if consent_err is not None:
            return ConnectorResult(connector=self.name, status=consent_err.status,
                                   error=consent_err)
        rate_err = self._check_local_rate_window()
        if rate_err is not None:
            return ConnectorResult(connector=self.name, status=rate_err.status, error=rate_err)
        token = await self._get_access_token()
        if token is None:
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.OAUTH_EXPIRED,
                error=ConnectorErrorInfo(status=ConnectorStatus.OAUTH_EXPIRED,
                                         message="refresh token exchange failed"),
            )

        url = _TASKS_LIST_URL.format(list_id=list_id)
        headers = {"Authorization": f"Bearer {token}"}
        params: dict[str, str] = {"maxResults": "50"}
        if not show_completed:
            params["showCompleted"] = "false"
            params["showHidden"] = "false"

        client = self._client or httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT)
        own_client = self._client is None
        try:
            for attempt in range(_MAX_ATTEMPTS):
                try:
                    response = await client.get(url, headers=headers, params=params)
                except httpx.TimeoutException:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.UNAVAILABLE,
                        error=ConnectorErrorInfo(status=ConnectorStatus.UNAVAILABLE,
                                                 message="google tasks timeout"),
                    )
                except httpx.HTTPError:
                    if attempt < _MAX_ATTEMPTS - 1:
                        await asyncio.sleep(0.5 * (attempt + 1))
                        continue
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.UNAVAILABLE,
                        error=ConnectorErrorInfo(status=ConnectorStatus.UNAVAILABLE,
                                                 message="google tasks unreachable"),
                    )

                if response.status_code == 401:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.UNAUTHORIZED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                                 http_status=401, message="token rejected"),
                    )
                if response.status_code == 403:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.UNAUTHORIZED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                                 http_status=403,
                                                 message="scope/permission denied"),
                    )
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.RATE_LIMITED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.RATE_LIMITED,
                                                 http_status=429,
                                                 message="google tasks quota"),
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
                                                 message="google tasks returned an error"),
                    )

                try:
                    body = response.json()
                except ValueError:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.MALFORMED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.MALFORMED,
                                                 message="non-JSON google tasks response"),
                    )
                rows = body.get("items")
                if not isinstance(rows, list):
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.MALFORMED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.MALFORMED,
                                                 message="missing items array"),
                    )

                items: list[EvidenceItem] = []
                skipped = 0
                for row in rows:
                    if not isinstance(row, dict):
                        skipped += 1
                        continue
                    row = dict(row)
                    row.setdefault("_list_id", list_id)
                    task = self._normalize_task(row, ctx.user_id)
                    if task is None:
                        skipped += 1
                        continue
                    task = task.model_copy(update={"task_list_id": list_id})
                    items.append(
                        EvidenceItem(
                            source="google_tasks",
                            source_url=task.provider_ref.url,
                            kind="task",
                            payload=task.model_dump(mode="json", exclude_none=True),
                            content=f"{task.title}"
                                    + (f" (due {task.due_at.isoformat()})" if task.due_at else ""),
                            freshness_seconds=900,  # task lists change; 15-min window
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

    async def apply_task_action(
        self, ctx: ConnectorContext, approval: ApprovalRequest, draft: DraftAction
    ) -> ConnectorResult:
        """Not implemented in this slice by design (no external writes yet)."""
        return ConnectorResult(
            connector=self.name, status=ConnectorStatus.PROVIDER_ERROR,
            error=ConnectorErrorInfo(
                status=ConnectorStatus.PROVIDER_ERROR,
                message="task writes are approval-gated and arrive in a later stage",
            ),
        )


__all__ = ["GoogleTasksConnector", "TaskItem", "utc_now"]
