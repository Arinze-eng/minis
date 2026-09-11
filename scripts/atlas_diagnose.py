"""Secret-safe local diagnostics for Atlas.

This command never prints credential values. It reports presence, feature flags,
dependency versions, and optional read-only connector health probes.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib.metadata
import os
import sys
from collections.abc import Iterable

from nanobot.atlas.connectors.credentials import secret_state
from nanobot.atlas.connectors.google_tasks import GoogleTasksConnector
from nanobot.atlas.connectors.serpapi import SerpApiConnector
from nanobot.atlas.connectors.telegram_delivery import TelegramDeliveryConnector

SECRET_NAMES = (
    "GROQ_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
    "SERPAPI_API_KEY",
    "TELEGRAM_BOT_TOKEN",
)


def _print_presence() -> None:
    aliases: dict[str, tuple[str, ...]] = {
        "GROQ_API_KEY": ("GROQ_API_KEY", "ATLAS_GROQ_API_KEY"),
        "GOOGLE_CLIENT_ID": ("GOOGLE_CLIENT_ID", "ATLAS_GOOGLE_CLIENT_ID"),
        "GOOGLE_CLIENT_SECRET": ("GOOGLE_CLIENT_SECRET", "ATLAS_GOOGLE_CLIENT_SECRET"),
        "GOOGLE_REFRESH_TOKEN": ("GOOGLE_REFRESH_TOKEN", "ATLAS_GOOGLE_REFRESH_TOKEN"),
        "SERPAPI_API_KEY": ("SERPAPI_API_KEY", "ATLAS_SERPAPI_API_KEY"),
        "TELEGRAM_BOT_TOKEN": ("TELEGRAM_BOT_TOKEN",),
    }
    for label, names in aliases.items():
        print(f"credential.{label}={secret_state(*names)}")


def _print_versions() -> None:
    for package in ("strands-agents", "httpx", "pydantic"):
        try:
            version = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            version = "missing"
        print(f"package.{package}={version}")
    major, minor, micro = sys.version_info[:3]
    print(f"python={major}.{minor}.{micro}")


def _print_flags() -> None:
    for name in ("ATLAS_ENABLE_GOOGLE_TASKS", "ATLAS_ENABLE_SERPAPI", "ATLAS_ENABLE_TELEGRAM_DELIVERY"):
        print(f"flag.{name}={os.getenv(name, 'unset').strip().lower() or 'unset'}")


def _connector(name: str):
    return {
        "google_tasks": GoogleTasksConnector(),
        "serpapi": SerpApiConnector(),
        "telegram": TelegramDeliveryConnector(),
    }[name]


async def _health(names: Iterable[str]) -> int:
    failures = 0
    for name in names:
        connector = _connector(name)
        if hasattr(connector, "is_configured") and not connector.is_configured():
            print(f"connector.{name}=not_configured")
            failures += 1
            continue
        result = await connector.health_check()
        print(f"connector.{name}={result.status.value}")
        if result.error is not None:
            print(f"connector.{name}.error_code={result.error.status.value}")
            failures += 1
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--health", action="store_true", help="run bounded read-only health probes")
    parser.add_argument("--connector", choices=("google_tasks", "serpapi", "telegram"), action="append")
    args = parser.parse_args()
    _print_presence()
    _print_versions()
    _print_flags()
    if not args.health:
        print("next=run with --health after loading .env.local")
        return 0
    names = args.connector or ["google_tasks", "serpapi", "telegram"]
    return asyncio.run(_health(names))


if __name__ == "__main__":
    raise SystemExit(main())
