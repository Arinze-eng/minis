"""Atlas live demo: REAL connector end-to-end through the edge service.

Runs the directive §3 flow against the local environment:

    trigger -> AtlasService (server-verified identity, stored consent, policy)
      -> Strands chain (Groq openai/gpt-oss-120b) -> REAL connector read
      -> normalized evidence -> recommendation -> demo card (no external send)

Fallback taxonomy is shown explicitly and exits bounded:
  - connector disabled / credentials absent-or-placeholder -> NOT_CONFIGURED
    (no provider request is attempted — rule 6 end-to-end)
  - consent missing -> UNAUTHORIZED with grant instructions
  - model unconfigured/unavailable -> bounded model status, never a silent
    provider switch (there is NO paid fallback by design)

Safety: read-only connector operations only; ``send_flag`` is always False
here; credentials come only from the environment / ignored ``.env.local`` and
are never printed, logged, or persisted (key NAMES are printed, values never).

Run:
    uv run --no-sync python scripts/atlas_demo.py
    uv run --no-sync python scripts/atlas_demo.py --scenario shopping_research
    uv run --no-sync python scripts/atlas_demo.py --grant-consent --json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

ENV_FILE = REPO_ROOT / ".env.local"

_FALLBACK_HINTS: dict[str, str] = {
    "connector_disabled": (
        "connector not enabled: set its ATLAS_ENABLE_* flag and non-placeholder "
        "credentials (see scripts/atlas_diagnose.py), then rerun"
    ),
    "consent_missing": (
        "no stored consent: rerun with --grant-consent (the human running this "
        "script is the consenting user) and then rerun the demo"
    ),
    "model_unconfigured": (
        "model unavailable: set GROQ_API_KEY (free tier) — Atlas never falls "
        "back to a paid provider silently"
    ),
}


def load_env_file(path: Path) -> list[str]:
    """Load KEY=VALUE lines into os.environ; return the key NAMES loaded.

    Values are never logged, returned, or echoed anywhere.
    """
    loaded: list[str] = []
    if not path.exists():
        return loaded
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
            loaded.append(key)
    return loaded


def _grant_consent(user_id: str, connector: str, store: Any | None = None) -> None:
    """Record explicit local read consent (the CLI operator is the user)."""
    from datetime import timedelta
    from typing import cast

    from nanobot.atlas.contracts import ConsentScope, utc_now
    from nanobot.atlas.policy import ConsentState
    from nanobot.atlas.store import AtlasStore, LocalAtlasStore

    scope = ConsentScope.READ_PUBLIC if connector == "serpapi" else ConsentScope.READ_PROFILE
    store = store if store is not None else LocalAtlasStore()
    store = cast(AtlasStore, store)
    if store.get_consent(user_id, connector) is None:
        store.save_consent(
            user_id,
            ConsentState(
                user_id=user_id, scope=scope, connector=connector,
                granted_at=utc_now() - timedelta(seconds=1),
                expires_at=None, revoked=False,
            ),
        )
        print(f"[consent] recorded {scope.value} consent for {connector!r}")


async def run(
    scenario: str, user_id: str, query: str, *, as_json: bool, store: Any | None = None
) -> int:
    from nanobot.atlas.contracts import ConnectorStatus
    from nanobot.atlas.service import AtlasRequest, AtlasService

    service = AtlasService(store) if store is not None else AtlasService()  # env=None -> os.environ
    response = await service.handle_request(
        AtlasRequest(user_id=user_id, scenario=scenario, query=query, send_flag=False)
    )

    if as_json:
        print(json.dumps({
            "scenario": response.scenario,
            "status": response.status.value,
            "reason_code": response.reason_code,
            "connector": response.connector,
            "recommendation_text": response.recommendation_text,
            "evidence_count": response.evidence_count,
            "provider_info": response.provider_info,
        }, indent=2))
    else:
        print("[demo card]".center(60, "-"))
        print(f"scenario    : {response.scenario}")
        print(f"status      : {response.status.value}")
        print(f"reason      : {response.reason_code}")
        print(f"connector   : {response.connector}")
        print(f"provider    : {response.provider_info or '(not reached)'}")
        print(f"evidence    : {response.evidence_count} item(s)")
        if response.recommendation_text:
            print(f"recommend   : {response.recommendation_text[:400]}")
        if response.status is not ConnectorStatus.OK:
            hint = _FALLBACK_HINTS.get(response.reason_code, "see atlas_diagnose.py")
            print(f"FALLBACK    : {hint}")

    return 0 if response.status is ConnectorStatus.OK else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Atlas live demo (read-only)")
    parser.add_argument("--scenario", default="task_start",
                        choices=("task_start", "shopping_research", "money_guard",
                                 "wardrobe_research"))
    parser.add_argument("--query", default="what should I do next?")
    parser.add_argument("--user", default=os.getenv("ATLAS_DEMO_USER", "local-demo-user"),
                        help="server-verified local principal (never model output)")
    parser.add_argument("--grant-consent", action="store_true",
                        help="explicitly record local read consent before running")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args()

    loaded_names = load_env_file(ENV_FILE)
    print(f"[env] loaded key names from .env.local: {sorted(loaded_names)}")

    from nanobot.atlas.service import SCENARIO_CONNECTORS

    connector = SCENARIO_CONNECTORS.get(args.scenario, "none")
    if args.grant_consent and connector not in {"none", "wardrobe_store"}:
        _grant_consent(args.user, connector)

    return asyncio.run(run(args.scenario, args.user, args.query, as_json=args.json))


if __name__ == "__main__":
    sys.exit(main())
