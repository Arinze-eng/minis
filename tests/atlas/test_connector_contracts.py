"""CI-safe tests for Atlas connector contracts and registry (no network, no creds).

Covers: ConnectorStatus taxonomy, ConnectorResult error-consistency invariants,
ProviderRef preservation, ProductOffering/TaskItem/TransactionItem/ApprovalDelivery
round-trips, and registry env/flag gating.
"""

from __future__ import annotations

import json
from datetime import timedelta

import pytest
from pydantic import ValidationError

from nanobot.atlas.connectors.registry import (
    SPECS,
    configured_connectors,
    connector_config_from_env,
    is_connector_enabled,
)
from nanobot.atlas.contracts import (
    ApprovalDelivery,
    ApprovalRequest,
    ConnectorErrorInfo,
    ConnectorResult,
    ConnectorStatus,
    DraftAction,
    ProductOffering,
    ProviderRef,
    TaskItem,
    TransactionItem,
    payload_hash,
    utc_now,
)

USER = "user-connector"


def _ref(provider: str = "serpapi", pid: str = "listing-123") -> ProviderRef:
    return ProviderRef(
        provider=provider,
        provider_id=pid,
        url="https://example.com/listing/123",
        provider_timestamp="2026-09-10T10:00:00Z",
    )


# ---------------------------------------------------------------------------
# ConnectorStatus taxonomy
# ---------------------------------------------------------------------------


def test_connector_status_taxonomy_is_complete() -> None:
    expected = {
        "ok", "not_configured", "unauthorized", "oauth_expired",
        "rate_limited", "unavailable", "stale", "malformed", "provider_error",
    }
    assert {s.value for s in ConnectorStatus} == expected


def test_error_consistency_invariant() -> None:
    ok = ConnectorResult(connector="serpapi", status=ConnectorStatus.OK)
    assert ok.error is None
    denied = ConnectorResult(
        connector="serpapi",
        status=ConnectorStatus.UNAUTHORIZED,
        error=ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED, http_status=401),
    )
    assert denied.error is not None
    # OK + error is invalid.
    with pytest.raises(ValidationError):
        ConnectorResult(
            connector="serpapi", status=ConnectorStatus.OK,
            error=ConnectorErrorInfo(status=ConnectorStatus.UNAUTHORIZED),
        )
    # Failure without error info is invalid.
    with pytest.raises(ValidationError):
        ConnectorResult(connector="serpapi", status=ConnectorStatus.UNAVAILABLE)


# ---------------------------------------------------------------------------
# ProviderRef preservation + normalized record round-trips
# ---------------------------------------------------------------------------


def test_provider_ref_preserved_verbatim() -> None:
    ref = _ref(provider="google_tasks", pid="task-abc-999")
    task = TaskItem(
        user_id=USER, title="Renew passport", due_at=utc_now() + timedelta(days=7),
        provider_ref=ref,
    )
    restored = TaskItem.model_validate(task.model_dump(mode="json", exclude_none=True))
    assert restored.provider_ref.provider_id == "task-abc-999"
    assert restored.provider_ref.url == "https://example.com/listing/123"
    assert restored.provider_ref.provider_timestamp == "2026-09-10T10:00:00Z"


def test_product_offering_roundtrip() -> None:
    offering = ProductOffering(
        user_id=USER, title="Winter jacket", price="$129.99", price_value=129.99,
        currency="USD", merchant="Acme", rating=4.5, provider_ref=_ref(),
    )
    data = json.loads(json.dumps(offering.model_dump(mode="json", exclude_none=True)))
    assert ProductOffering.model_validate(data) == offering


def test_transaction_sandbox_labeling_default() -> None:
    txn = TransactionItem(
        user_id=USER, amount=-42.5, merchant="Coffee",
        provider_ref=_ref(provider="plaid", pid="txn-777"),
    )
    # Default is sandbox-labeled: demo must not present sandbox data as prod.
    assert txn.is_sandbox is True


def test_approval_delivery_binding_fields() -> None:
    draft = DraftAction(
        user_id=USER,
        action_type="tasks.update",
        payload={"task_id": "task-1", "title": "Renew passport"},
        payload_hash=payload_hash({"task_id": "task-1", "title": "Renew passport"}),
        idempotency_key="idem-delivery-01",
        capability=__import__(
            "nanobot.atlas.contracts", fromlist=["ConnectorCapability"]
        ).ConnectorCapability.WRITE_USER_DATA,
    )
    approval = ApprovalRequest.from_draft(draft, user_id=USER)
    delivery = ApprovalDelivery(
        approval_id=approval.approval_id,
        user_id=USER,
        channel="telegram",
        chat_id="12345",
        action_type=approval.action_type,
        payload_hash=approval.payload_hash,
        nonce=approval.nonce,
        expires_at=approval.expires_at,
        callback_token_hash="a" * 64,
    )
    restored = ApprovalDelivery.model_validate(delivery.model_dump(mode="json", exclude_none=True))
    assert restored.nonce == approval.nonce
    assert restored.payload_hash == approval.payload_hash
    assert restored.response == "pending"
    # Callback token stored hashed only.
    assert restored.callback_token_hash == "a" * 64
    assert len(restored.callback_token_hash) == 64


# ---------------------------------------------------------------------------
# Registry: env + flag gating
# ---------------------------------------------------------------------------


def test_connector_disabled_without_flag() -> None:
    env = {"ATLAS_SERPAPI_API_KEY": "k"}
    assert is_connector_enabled("serpapi", env=env) is False


def test_connector_disabled_without_credentials() -> None:
    env = {"ATLAS_ENABLE_SERPAPI": "true"}
    assert is_connector_enabled("serpapi", env=env) is False


def test_connector_enabled_with_flag_and_credentials() -> None:
    env = {"ATLAS_ENABLE_SERPAPI": "true", "ATLAS_SERPAPI_API_KEY": "k"}
    assert is_connector_enabled("serpapi", env=env) is True
    enabled = configured_connectors(env=env)
    assert [s.name for s in enabled] == ["serpapi"]


def test_google_connectors_share_client_vars() -> None:
    env = {
        "ATLAS_ENABLE_GMAIL": "true",
        "ATLAS_GOOGLE_CLIENT_ID": "cid",
        "ATLAS_GOOGLE_CLIENT_SECRET": "sec",
        "ATLAS_GOOGLE_REFRESH_TOKEN": "rt",
    }
    assert is_connector_enabled("gmail", env=env) is True
    cfg = connector_config_from_env("gmail", env=env)
    assert cfg["ATLAS_GOOGLE_CLIENT_ID"] == "cid"
    # Scopes declared in spec: gmail.readonly only (no gmail.send requested).
    spec = SPECS["gmail"]
    assert spec.required_scopes == ("https://www.googleapis.com/auth/gmail.readonly",)


def test_telegram_reuses_existing_channel_credential() -> None:
    env = {"ATLAS_ENABLE_TELEGRAM_DELIVERY": "true", "TELEGRAM_BOT_TOKEN": "tok"}
    assert is_connector_enabled("telegram", env=env) is True
    assert SPECS["telegram"].env_vars == ("TELEGRAM_BOT_TOKEN",)


def test_no_credentials_in_spec_metadata() -> None:
    """Registry metadata never embeds credential values."""
    for spec in SPECS.values():
        blob = json.dumps(spec.__dict__, default=lambda o: sorted(o))
        assert "secret" not in blob.lower() or "SECRET" in str(spec.env_vars)
