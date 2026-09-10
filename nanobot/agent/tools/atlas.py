"""Atlas tool: the minimal, policy-gated Atlas surface exposed to the model.

This wrapper is deliberately narrow. It:

- accepts identity ONLY from the verified Atlas request context bound in
  ``RequestContext.attributes["atlas_context"]`` (server-derived; the model can
  never supply it — no tool parameter carries identity);
- invokes a read-only fixture operation through the deterministic policy gate;
- returns typed, redacted results.

It cannot reach shell, filesystem, browser, MCP, trading, Novita, VPS, Upstash,
or educational tools: this module imports nothing from those tool modules and
holds no reference to any ToolRegistry, so there is no path from Atlas to any
other capability.

Registration follows the repository's pkgutil discovery
(``agent/tools/loader.py``): a ``Tool`` subclass with the ``@tool_parameters``
decorator. ``config_key = "atlas"`` means ``tools.atlas`` config could later
gate ``enabled()`` without schema changes; the fixture operation is always
safe so the tool is enabled by default.
"""

from __future__ import annotations

import json
from typing import Any

from nanobot.agent.tools.base import Tool, ToolResult, tool_parameters
from nanobot.agent.tools.context import ToolContext, current_request_context
from nanobot.atlas.contracts import (
    AuthenticatedAtlasContext,
    ConnectorCapability,
    EvidenceItem,
)
from nanobot.atlas.policy import ConsentState, evaluate_read_operation
from nanobot.atlas.store import AtlasStore, LocalAtlasStore

# The fixture connector is read-only and public-data only, so the consent
# requirement for the demo path is exactly this pair.
_FIXTURE_CAPABILITY = ConnectorCapability.READ_PUBLIC_DATA
_FIXTURE_DECLARED_CAPABILITIES = frozenset({_FIXTURE_CAPABILITY})

_ATLAS_CONTEXT_KEY = "atlas_context"
_CONSENT_STATE_KEY = "atlas_consent"


@tool_parameters(
    {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "What to look up via the Atlas read-only fixture.",
                "minLength": 1,
                "maxLength": 512,
            },
        },
        "required": ["query"],
        "additionalProperties": False,
    }
)
class AtlasTool(Tool):
    """Read-only Atlas fixture operation behind the deterministic policy gate."""

    config_key = "atlas"

    def __init__(self, store: AtlasStore | None = None) -> None:
        # Store is injectable for tests; production wiring would pass the
        # store via create(). The default keeps the local, user-scoped store.
        self._store: AtlasStore = store if store is not None else LocalAtlasStore()

    @property
    def name(self) -> str:
        return "atlas"

    @property
    def description(self) -> str:
        return (
            "Run a read-only Atlas fixture lookup. Results are evidence records "
            "with provenance and freshness; authorization is decided by policy, "
            "not by this conversation."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        # The @tool_parameters decorator injects the schema; kept for clarity.
        return type(self)._parameters  # pyright: ignore[reportAttributeAccessIssue]

    @property
    def read_only(self) -> bool:
        return True

    @classmethod
    def create(cls, ctx: ToolContext) -> AtlasTool:
        # tools.atlas config may carry a custom root later; keep the default.
        return cls()

    def _resolve_context(self) -> AuthenticatedAtlasContext:
        """Fetch the server-derived Atlas context; never trust tool args.

        The context is placed in ``RequestContext.attributes`` by the server
        after authentication (Supabase token verification or channel identity
        linkage). If it is absent, there is no authenticated principal and the
        operation is denied.
        """
        request_ctx = current_request_context()
        if request_ctx is None:
            raise PermissionError("atlas_context_missing: no authenticated request context")
        atlas_ctx = request_ctx.attributes.get(_ATLAS_CONTEXT_KEY)
        if not isinstance(atlas_ctx, AuthenticatedAtlasContext):
            raise PermissionError("atlas_context_missing: request is not Atlas-authenticated")
        return atlas_ctx

    def _resolve_consent(self) -> ConsentState:
        """Fetch the server-stored consent record for the fixture connector."""
        request_ctx = current_request_context()
        consent = request_ctx.attributes.get(_CONSENT_STATE_KEY) if request_ctx else None
        if isinstance(consent, ConsentState):
            return consent
        # No server-stored consent means consent_missing for this request.
        raise PermissionError("atlas_consent_missing: no server-stored consent for atlas fixture")

    async def execute(self, **kwargs: Any) -> Any:
        """Run the policy-gated read-only fixture operation.

        Denials raise ``PermissionError`` with a bounded reason code; the
        runner converts tool exceptions to error tool results, so no raw
        policy internals leak into the conversation.
        """
        try:
            atlas_ctx = self._resolve_context()
            consent = self._resolve_consent()
        except PermissionError as exc:
            return ToolResult.error(str(exc))

        query = kwargs.get("query")
        if not isinstance(query, str) or not query.strip():
            return ToolResult.error("query must be a non-empty string")

        # Deterministic policy decision (pure function, no model involvement).
        decision = evaluate_read_operation(
            atlas_ctx,
            capability=_FIXTURE_CAPABILITY,
            consent=consent,
            declared_capabilities=_FIXTURE_DECLARED_CAPABILITIES,
            evidence=[],
        )
        if not decision.allowed:
            return ToolResult.error(f"atlas_policy_denied: {decision.reason_code}")

        # Read-only fixture "operation": build evidence from the query with
        # deterministic provenance. No network, no side effects, no other
        # tool reach.
        evidence = EvidenceItem(
            source="atlas_fixture",
            content=f"fixture result for: {query[:512]}",
            freshness_seconds=3600,
            uncertainty=0.0,
            state="fresh",
        )

        return ToolResult(
            json.dumps(
                {
                    "status": "ok",
                    "reason_code": decision.reason_code,
                    "trace_id": decision.trace.trace_id,
                    "evidence": evidence.model_dump(mode="json", exclude_none=True),
                },
                ensure_ascii=False,
            )
        )
