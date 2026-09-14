"""Obtain an offline Google OAuth refresh token for local Atlas testing.

This helper opens a browser and uses Google's installed-app loopback flow. It
prints only the refresh token and scope result; it never writes credentials to
the repository. Redirects use a random localhost port, so this is not the
OAuth Playground flow and does not require a web-client redirect URI.
"""

# google-auth-oauthlib does not ship the type metadata used by basedpyright.
# The helper keeps the untyped dependency at this adapter boundary only.
# pyright: reportUnknownVariableType=false

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, cast

from google_auth_oauthlib.flow import (  # pyright: ignore[reportMissingImports, reportUnknownVariableType]
    InstalledAppFlow,
)

DEFAULT_SCOPES = (
    "https://www.googleapis.com/auth/tasks.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--client-secrets",
        required=True,
        type=Path,
        help="Path to the downloaded Google Desktop OAuth client JSON file.",
    )
    parser.add_argument(
        "--scope",
        action="append",
        dest="scopes",
        help="OAuth scope; repeat this option to override the defaults.",
    )
    args = parser.parse_args()
    if not args.client_secrets.is_file():
        parser.error(f"client secrets file does not exist: {args.client_secrets}")

    scopes = tuple(args.scopes or DEFAULT_SCOPES)
    flow_class = cast("Any", InstalledAppFlow)
    flow = flow_class.from_client_secrets_file(str(args.client_secrets), scopes)
    credentials: Any = flow.run_local_server(
        host="127.0.0.1",
        port=0,
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    refresh_token = credentials.refresh_token
    if not refresh_token:
        raise RuntimeError(
            "Google did not return a refresh token. Re-run and approve consent, "
            "or revoke the prior grant before trying again."
        )

    print("Google OAuth completed.")
    print("Scopes:")
    for scope in scopes:
        print(f"  {scope}")
    print("\nSet this value in .env.local as ATLAS_GOOGLE_REFRESH_TOKEN:")
    print(refresh_token)
    print("\nDo not commit, paste, or record this value in logs or screenshots.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
