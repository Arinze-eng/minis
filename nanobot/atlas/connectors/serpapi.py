"""Real SerpApi connector (read-only product/search research).

Implements :class:`~nanobot.atlas.connectors.base.ProductResearchConnector`
against the live SerpApi Google Search/Shopping endpoint. Free plan (~100-250
searches/month, VERIFY LIVE at signup); read-only by contract — no purchase,
no cart mutation.

Behavior contract:
- API key only from environment variables;
- consent checked immediately before every provider call;
- product URL, source, price, and timestamps preserved via ``ProviderRef``;
- errors normalize to the explicit ``ConnectorStatus`` taxonomy;
- bounded timeout, one retry on transient failures, local rate window;
- results normalize into ``ProductOffering`` evidence in ``ConnectorResult``.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, cast

import httpx

from nanobot.atlas.connectors.base import ConnectorContext
from nanobot.atlas.connectors.credentials import read_secret
from nanobot.atlas.contracts import (
    ConnectorCapability,
    ConnectorErrorInfo,
    ConnectorResult,
    ConnectorStatus,
    EvidenceItem,
    ProductOffering,
    ProviderRef,
    utc_now,
)
from nanobot.atlas.policy import ConsentState, evaluate_consent

_SEARCH_URL = "https://serpapi.com/search"
_DEFAULT_TIMEOUT = 15.0
_MAX_ATTEMPTS = 2
_WINDOW_SECONDS = 60.0
_WINDOW_MAX = 10


class SerpApiConnector:
    """Read-only SerpApi search/shopping connector."""

    def __init__(self, *, client: httpx.AsyncClient | None = None) -> None:
        self._client = client
        self._window_requests: list[float] = []

    @property
    def name(self) -> str:
        return "serpapi"

    def capabilities(self) -> frozenset[ConnectorCapability]:
        return frozenset({ConnectorCapability.READ_PUBLIC_DATA})

    @staticmethod
    def is_configured() -> bool:
        return bool(read_secret("ATLAS_SERPAPI_API_KEY", "SERPAPI_API_KEY"))

    # -- quota + consent guards -----------------------------------------------

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
        if not isinstance(ctx.consent, ConsentState):
            return ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                      message="no server-stored consent for serpapi")
        verdict = evaluate_consent(ctx.atlas_context, ctx.consent)
        if not verdict.allowed:
            return ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                      message=f"consent gate: {verdict.reason_code}")
        return None

    # -- health / search ---------------------------------------------------------

    async def health_check(self) -> ConnectorResult:
        if not self.is_configured():
            return ConnectorResult(
                connector=self.name, status=ConnectorStatus.NOT_CONFIGURED,
                error=ConnectorErrorInfo(status=ConnectorStatus.NOT_CONFIGURED,
                                         message="ATLAS_SERPAPI_API_KEY not set"),
            )
        return ConnectorResult(connector=self.name, status=ConnectorStatus.OK)

    async def search_products(
        self, ctx: ConnectorContext, query: str, *, limit: int = 5
    ) -> ConnectorResult:
        consent_err = self._consent_error(ctx)
        if consent_err is not None:
            return ConnectorResult(connector=self.name, status=consent_err.status,
                                   error=consent_err)
        rate_err = self._check_local_rate_window()
        if rate_err is not None:
            return ConnectorResult(connector=self.name, status=rate_err.status, error=rate_err)

        api_key = read_secret("ATLAS_SERPAPI_API_KEY", "SERPAPI_API_KEY")
        params = {
            "engine": "google",
            "q": query[:400],
            "api_key": api_key,
            "num": str(min(max(limit, 1), 10)),
        }
        client = self._client or httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT)
        own_client = self._client is None
        try:
            for attempt in range(_MAX_ATTEMPTS):
                try:
                    response = await client.get(_SEARCH_URL, params=params)
                except httpx.TimeoutException:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.UNAVAILABLE,
                        error=ConnectorErrorInfo(status=ConnectorStatus.UNAVAILABLE,
                                                 message="serpapi timeout"),
                    )
                except httpx.HTTPError:
                    if attempt < _MAX_ATTEMPTS - 1:
                        await asyncio.sleep(0.5 * (attempt + 1))
                        continue
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.UNAVAILABLE,
                        error=ConnectorErrorInfo(status=ConnectorStatus.UNAVAILABLE,
                                                 message="serpapi unreachable"),
                    )

                if response.status_code == 401:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.UNAUTHORIZED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED,
                                                 http_status=401, message="api key rejected"),
                    )
                if response.status_code == 429:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.RATE_LIMITED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.RATE_LIMITED,
                                                 http_status=429, message="serpapi quota"),
                    )
                if response.status_code >= 500 and attempt < _MAX_ATTEMPTS - 1:
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue
                if response.status_code >= 400:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.PROVIDER_ERROR,
                        error=ConnectorErrorInfo(status=ConnectorStatus.PROVIDER_ERROR,
                                                 http_status=response.status_code,
                                                 message="serpapi returned an error"),
                    )
                try:
                    body = response.json()
                except ValueError:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.MALFORMED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.MALFORMED,
                                                 message="non-JSON serpapi response"),
                    )
                if isinstance(body.get("error"), str):
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.PROVIDER_ERROR,
                        error=ConnectorErrorInfo(status=ConnectorStatus.PROVIDER_ERROR,
                                                 message=body["error"][:500]),
                    )

                # Prefer shopping results (structured), fall back to organic.
                source_key = "shopping_results"
                raw = cast("list[Any] | None", body.get("shopping_results"))
                if not isinstance(raw, list) or not raw:
                    raw = cast("list[Any]", body.get("organic_results") or [])
                    source_key = "organic_results"
                rows = [
                    cast("dict[str, Any]", r) for r in raw if isinstance(r, dict)
                ][: max(limit, 1) * 2]

                items: list[EvidenceItem] = []
                for row in rows:
                    offering = self._normalize_offering(row, ctx.user_id, source_key)
                    if offering is None:
                        continue
                    items.append(
                        EvidenceItem(
                            source="serpapi",
                            source_url=offering.provider_ref.url,
                            kind="product",
                            payload=offering.model_dump(mode="json", exclude_none=True),
                            content=f"{offering.title}"
                                    + (f" — {offering.price}" if offering.price else ""),
                            freshness_seconds=1800,  # prices go stale fast (30 min)
                            uncertainty=0.2,
                        )
                    )
                    if len(items) >= max(limit, 1):
                        break

                if not items:
                    return ConnectorResult(
                        connector=self.name, status=ConnectorStatus.MALFORMED,
                        error=ConnectorErrorInfo(status=ConnectorStatus.MALFORMED,
                                                 message="no usable results rows"),
                    )
                return ConnectorResult(connector=self.name, status=ConnectorStatus.OK,
                                       items=items)
        finally:
            if own_client:
                await client.aclose()
        return ConnectorResult(
            connector=self.name, status=ConnectorStatus.UNAVAILABLE,
            error=ConnectorErrorInfo(status=ConnectorStatus.UNAVAILABLE, message="exhausted"),
        )

    # -- normalization --------------------------------------------------------------

    @staticmethod
    def _normalize_offering(
        row: dict[str, Any], user_id: str, source_key: str
    ) -> ProductOffering | None:
        title = (row.get("title") or row.get("name") or "").strip()
        link = (row.get("link") or row.get("product_link") or "").strip()
        if not title or not link:
            return None
        price = row.get("price") or row.get("extracted_price")
        price_value = row.get("extracted_price")
        price_str: str | None
        if isinstance(price, str) and price.strip():
            price_str = price.strip()[:64]
        elif isinstance(price_value, (int, float)):
            price_str = f"{price_value:.2f}"
        else:
            price_str = None
        return ProductOffering(
            user_id=user_id,
            title=title[:512],
            price=price_str,
            price_value=float(price_value) if isinstance(price_value, (int, float)) else None,
            currency=(row.get("currency") or None) if isinstance(row.get("currency"), str) else None,
            merchant=(row.get("source") or row.get("seller") or None),
            rating=row.get("rating") if isinstance(row.get("rating"), (int, float)) else None,
            provider_ref=ProviderRef(
                provider=f"serpapi:{source_key}",
                provider_id=str(row.get("product_id") or row.get("position") or title)[:512],
                url=link[:2048],
                provider_timestamp=str(row.get("date"))[:64] if row.get("date") else None,
            ),
        )


__all__ = ["SerpApiConnector", "utc_now"]
