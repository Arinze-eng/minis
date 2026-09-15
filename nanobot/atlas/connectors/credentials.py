"""Secret-safe credential access for Atlas connectors.

Security rules encoded here:

- Credentials are read only from the process environment (or an ignored
  ``.env.local`` loaded by the caller) — never from arguments, logs, or
  persisted Atlas records.
- Values are never logged or echoed; only presence is reported, as a
  tri-state string (``set`` / ``missing`` / ``placeholder``).
- Placeholder values (``replace_me``, ``your_refresh_token``, ...) are never
  returned to callers that make provider requests, so a placeholder can never
  reach an API call.
"""

from __future__ import annotations

import os

PLACEHOLDER_VALUES: frozenset[str] = frozenset(
    {"replace_me", "your_refresh_token", "your_api_key", "changeme", "xxx"}
)


def read_secret(*names: str) -> str:
    """Return the first usable env value among ``names`` (aliases in order).

    "Usable" means non-empty after stripping and not a known placeholder.
    Returns ``""`` when no usable value exists. Never logs or echoes values.
    """
    for name in names:
        value = os.getenv(name, "").strip()
        if value and value not in PLACEHOLDER_VALUES:
            return value
    return ""


def secret_state(*names: str) -> str:
    """Tri-state presence report across aliases: ``set`` | ``missing`` | ``placeholder``."""
    saw_placeholder = False
    for name in names:
        value = os.getenv(name, "").strip()
        if value and value not in PLACEHOLDER_VALUES:
            return "set"
        if value in PLACEHOLDER_VALUES:
            saw_placeholder = True
    return "placeholder" if saw_placeholder else "missing"


__all__ = ["PLACEHOLDER_VALUES", "read_secret", "secret_state"]
