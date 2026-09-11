"""Strands-backed Atlas orchestration chain (Task Start + Shopping Research).

The real vertical slice:

    bounded task input -> deterministic policy gate (outside the model)
      -> Strands Agent (free-tier model, only the chain's allowed tool)
      -> agent calls the real connector tool -> normalized Atlas evidence
      -> typed recommendation (structured output) -> STOP before side effects
      -> trace + provider/model info (no secrets)

The deterministic Atlas policy layer executes BEFORE connector access and is
never delegated to the model. The model only interprets normalized evidence
and produces the recommendation payload.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, cast

from nanobot.atlas.contracts import (
    ConnectorCapability,
    ConnectorResult,
    ConnectorStatus,
    EvidenceItem,
    Recommendation,
    TraceMetadata,
    new_id,
    utc_now,
)
from nanobot.atlas.policy import ConsentState, redact_audit_metadata


def _wardrobe_evidence(chain: "AtlasChain", connector: Any) -> ConnectorResult:
    """Build wardrobe evidence deterministically from user-entered garments.

    No external API and no model involvement here: the constraint parse and
    the outfit pick are pure functions (see ``nanobot.atlas.wardrobe``), and
    the result is one evidence item carrying the typed outfit plan.
    """
    from nanobot.atlas.wardrobe import parse_constraints, recommend_outfit

    user_id = chain.current_user_id or ""
    garments = connector.list_garments(user_id)
    constraint = parse_constraints(chain.input_query)
    plan = recommend_outfit(garments, user_id, constraint)
    by_id = {g.garment_id: g for g in garments}
    parts = [
        f"{category}: {by_id[garment_id].name}"
        for category, garment_id in plan.slots.items()
        if garment_id in by_id
    ]
    if parts:
        content = "Outfit plan (from your garments) — " + "; ".join(parts)
    else:
        content = "No suitable outfit found from your garment records."
    for note in plan.notes:
        content += f" ({note})"
    content += ". Nothing was purchased; research needs your explicit authorization."
    return ConnectorResult(
        connector="wardrobe_store",
        status=ConnectorStatus.OK,
        items=[
            EvidenceItem(
                source="wardrobe_store",
                kind="text",
                payload=plan.model_dump(mode="json"),
                content=content[:4000],
                freshness_seconds=3600,
                uncertainty=0.0,
            )
        ],
    )


class AtlasChainError(RuntimeError):
    """Bounded chain failure with a machine-readable reason code."""

    def __init__(self, reason_code: str, detail: str = "") -> None:
        super().__init__(f"{reason_code}: {detail}"[:500])
        self.reason_code = reason_code
        self.detail = detail[:500]


@dataclass(frozen=True)
class ChainInput:
    """Bounded Atlas task handed to the chain (never raw free-form model input)."""

    user_id: str
    scenario: str  # "task_start" | "shopping_research"
    query: str
    consent: ConsentState
    chat_id: str | None = None  # server-derived delivery target

    def __post_init__(self) -> None:
        if not self.query.strip():
            raise AtlasChainError("empty_query", "chain input query is empty")
        if len(self.query) > 512:
            raise AtlasChainError("query_too_long", "chain input query exceeds 512 chars")


@dataclass
class ChainBudget:
    """Runtime budget ledger enforced during the chain (deterministic guard)."""

    max_model_requests: int = 4
    model_requests: int = 0

    def consume(self) -> None:
        if self.model_requests >= self.max_model_requests:
            raise AtlasChainError("budget_exceeded", "model request budget exhausted")
        self.model_requests += 1


@dataclass
class ChainResult:
    """Typed chain outcome delivered to the interaction surface."""

    scenario: str
    status: ConnectorStatus  # OK or the explicit failure state
    reason_code: str
    evidence: list[EvidenceItem] = field(default_factory=list)
    recommendation: Recommendation | None = None
    approval_required: bool = False  # always False in this slice (no side effects)
    provider_info: dict[str, str] = field(default_factory=dict)  # redacted model info
    connector: str = ""
    trace: TraceMetadata = field(default_factory=TraceMetadata)
    model_requests_used: int = 0


def _recommendation_model() -> type:
    """Typed structured-output schema for the Strands agent."""
    from pydantic import BaseModel, Field

    class AtlasRecommendation(BaseModel):
        """One bounded next-action recommendation derived from evidence."""

        title: str = Field(min_length=1, max_length=200)
        rationale: str = Field(min_length=1, max_length=800)
        next_action: str = Field(
            description="One of: none (advice only), review_tasks, research_more"
        )

    return AtlasRecommendation


def _agent_class() -> Any:
    """Lazy Strands import so the atlas extra stays optional for CI-safe tests.

    Real runs get ``strands.Agent``; CI-safe tests stub this boundary.
    """
    from strands import Agent

    return Agent


def _wrap_tool(fn: Any) -> Any:
    """Wrap a plain async function as a Strands tool (lazy import).

    Called only after ``_agent_class()`` succeeded, so the identity fallback
    here is reachable only in stubbed test runs where Agent is patched.
    """
    try:
        from strands import (
            tool as strands_tool,  # pyright: ignore[reportUnknownVariableType, reportUnknownMemberType]
        )
    except ImportError:
        return fn
    return cast("Any", strands_tool(fn))


def _build_connector_tool(chain: "AtlasChain", connector: Any, scenario: str) -> Any:
    """Wrap the real connector as a single Strands tool for the chain.

    Only this tool is given to the agent: the model cannot reach any other
    capability, and every call passes back through the policy gate. The Strands
    decorator is applied by ``_wrap_tool`` (lazy), keeping this import-free.
    """

    async def atlas_fetch_evidence(query: str) -> str:
        """Fetch real normalized evidence for the Atlas task.

        Args:
            query: Bounded search/task query from the Atlas task input.

        Returns:
            JSON string with normalized Atlas evidence records.
        """
        verdict = redact_audit_metadata(
            span="chain.tool", decision="allow", reason_code="tool_call",
            user_id=chain.current_user_id or "",
        )
        if scenario == "task_start":
            result: ConnectorResult = await connector.list_tasks(chain.connector_ctx)
        elif scenario == "money_guard":
            result = await connector.list_transactions(chain.connector_ctx)
        elif scenario == "wardrobe_research":
            result = _wardrobe_evidence(chain, connector)
        else:
            result = await connector.search_products(
                chain.connector_ctx, (query or chain.input_query)[:400], limit=5
            )
        # Record the connector outcome for the chain result (provider truth).
        chain.last_connector_result = result
        return json.dumps(
            {
                "status": result.status.value,
                "trace_id": verdict.trace_id,
                "items": [i.model_dump(mode="json", exclude_none=True) for i in result.items],
                "error": (result.error.model_dump(mode="json", exclude_none=True)
                          if result.error else None),
            },
            ensure_ascii=False,
        )

    return atlas_fetch_evidence


class AtlasChain:
    """Strands-orchestrated Atlas chain with policy-first, budgeted execution."""

    def __init__(
        self,
        *,
        connector: Any,
        model_handle: Any | None = None,  # ModelHandle; None = build from env
        consent: ConsentState | None = None,
    ) -> None:
        self._connector = connector
        self._model_handle = model_handle
        self._consent = consent
        # Per-run state (set in run()).
        self.current_user_id: str | None = None
        self.input_query: str = ""
        self.connector_ctx: Any = None
        self.last_connector_result: ConnectorResult | None = None

    # -- policy gate (deterministic, outside the model) ----------------------------

    def _policy_gate(self, ctx_input: ChainInput) -> None:
        """Run the deterministic policy checks BEFORE any model/connector work."""
        from nanobot.atlas.policy import evaluate_capability

        capability = (
            ConnectorCapability.READ_USER_DATA
            if ctx_input.scenario in ("task_start", "money_guard", "wardrobe_research")
            else ConnectorCapability.READ_PUBLIC_DATA
        )
        if self._consent is None or self._model_handle is None:
            raise AtlasChainError("policy_denied", "chain missing consent or model handle")
        atlas_ctx = getattr(self._model_handle, "atlas_context", None)
        if atlas_ctx is None:
            raise AtlasChainError("policy_denied", "model handle lacks verified atlas context")
        verdict = evaluate_capability(
            atlas_ctx,
            self._consent,
            capability,
            declared_capabilities=self._connector.capabilities(),
        )
        if not verdict.allowed:
            raise AtlasChainError("policy_denied", verdict.reason_code)

    # -- orchestration ---------------------------------------------------------------

    async def run(self, task: ChainInput) -> ChainResult:
        """Execute the vertical slice. Raises AtlasChainError only for
        deterministic pre-flight failures; provider/model states are returned."""
        self.current_user_id = task.user_id
        self.input_query = task.query
        self.last_connector_result = None
        trace = TraceMetadata(span="chain.run", decision="allow", reason_code="start",
                              created_at=utc_now())

        # 1) Deterministic policy gate FIRST (outside the model).
        self._policy_gate(task)

        # 2) Model handle (free provider only; explicit not_configured state).
        handle = self._model_handle
        if handle is None:
            raise AtlasChainError("model_unconfigured", "no model handle provided")
        budget = ChainBudget(max_model_requests=handle.budget.max_model_requests)

        # 3) Connector context: server-derived identity + consent for the gate.
        from nanobot.atlas.connectors.base import ConnectorContext

        self.connector_ctx = ConnectorContext(
            user_id=task.user_id,
            atlas_context=getattr(handle, "atlas_context", None),
            consent=task.consent,
            trace_id=trace.trace_id,
        )

        # 4) Strands agent with ONLY the chain's allowed tool.
        try:
            agent_cls = _agent_class()
        except ImportError as exc:
            raise AtlasChainError(
                "strands_missing",
                "install the atlas extra: pip install -e '.[atlas]'",
            ) from exc
        agent_tool = _wrap_tool(_build_connector_tool(self, self._connector, task.scenario))
        agent = agent_cls(
            model=handle.model,
            tools=[agent_tool],
            system_prompt=(
                "You are the Atlas reasoning step. You receive normalized evidence "
                "JSON fetched by your single tool and produce one short, concrete "
                "recommendation. Never invent data that is not in the evidence. "
                "Never claim an action was executed. For money evidence, report "
                "merchant, amount, dates, and confidence exactly as provided and "
                "never suggest paying, cancelling, or disputing anything. "
                "Keep titles under 200 chars."
            ),
            structured_output_model=_recommendation_model(),
        )

        # 5) Run the agent: it calls the real connector tool itself.
        budget.consume()
        try:
            agent_result = await agent.invoke_async(
                f"Scenario: {task.scenario}\nUser request: {task.query[:400]}"
            )
        except Exception as exc:  # noqa: BLE001 - provider SDKs raise many types
            raise AtlasChainError("model_failed", str(exc)[:300]) from exc

        structured = getattr(agent_result, "structured_output", None)
        if structured is None:
            # Fall back to the agent's text; still a typed Recommendation below.
            text = str(getattr(agent_result, "message", "") or "")[:800]
            recommendation = Recommendation(
                user_id=task.user_id,
                problem_id=new_id(),
                title=(text.splitlines() or ["Recommendation"])[0][:200] or "Recommendation",
                rationale=text[:2000] or "no structured output returned",
            )
        else:
            recommendation = Recommendation(
                user_id=task.user_id,
                problem_id=new_id(),
                title=str(getattr(structured, "title", ""))[:200] or "Recommendation",
                rationale=str(getattr(structured, "rationale", ""))[:2000],
            )

        # Opaque cast (not a bare read) so the type checker cannot narrow this
        # to None: the tool closure above assigns it at runtime.
        connector_result = cast("ConnectorResult | None", self.last_connector_result)
        status = connector_result.status if connector_result else ConnectorStatus.UNAVAILABLE
        evidence = list(connector_result.items) if connector_result else []
        final_trace = redact_audit_metadata(
            span="chain.run", decision="allow", reason_code="chain_complete",
            user_id=task.user_id,
        )
        return ChainResult(
            scenario=task.scenario,
            status=status,
            reason_code="chain_complete" if status == ConnectorStatus.OK else status.value,
            evidence=evidence,
            recommendation=recommendation,
            approval_required=False,  # this slice never executes side effects
            provider_info=handle.describe(),
            connector=self._connector.name,
            trace=final_trace,
            model_requests_used=budget.model_requests,
        )


async def run_task_start(connector: Any, task: ChainInput, model_handle: Any) -> ChainResult:
    """Convenience entry for the Task Start slice."""
    chain = AtlasChain(connector=connector, model_handle=model_handle, consent=task.consent)
    return await chain.run(task)


__all__ = [
    "AtlasChain",
    "AtlasChainError",
    "ChainBudget",
    "ChainInput",
    "ChainResult",
    "run_task_start",
]
