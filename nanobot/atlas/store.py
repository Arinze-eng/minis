"""Provisional Atlas persistence: narrow protocol + local file store.

Deliberately minimal and replaceable. The local store keeps Atlas domain state
under the existing nanobot data directory following the repository's atomic
write conventions (temp file + fsync + rename + directory fsync, as in
``agent/memory.py``), user-scoped by construction so one user's records are
unreachable through another user's API surface.

Design constraints from the stage contract:

- no secrets are stored (records hold domain state only);
- no assumptions about unverified live Supabase tables or RLS policies;
- no Supabase migration is added in this stage;
- a future Supabase adapter implements the same narrow ``AtlasStore``
  protocol additively, behind the same interface, without changing callers.

The atomic-write helper is self-contained (stdlib only) so this module has no
dependency on ``utils.helpers`` (which imports tiktoken/loguru).
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from contextlib import suppress
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, Protocol, cast, runtime_checkable

from nanobot.atlas.contracts import (
    ApprovalRequest,
    ConsentScope,
    DraftAction,
    EvidenceItem,
    NormalizedProblem,
    Recommendation,
    VerifiedOutcome,
)
from nanobot.atlas.policy import ConsentState
from nanobot.atlas.wardrobe import GarmentRecord

RecordKind = Literal[
    "problems", "evidence", "recommendations", "drafts", "approvals", "outcomes",
    "garments", "consents",
]

# Records persisted for the four proposed demo scenarios (money guard, task
# start, wardrobe/shopping research, drip advice). Minimum state only.
_RECORD_KINDS: tuple[RecordKind, ...] = (
    "problems",
    "evidence",
    "recommendations",
    "drafts",
    "approvals",
    "outcomes",
    "garments",
    "consents",
)


@runtime_checkable
class AtlasStore(Protocol):
    """Narrow persistence surface for Atlas domain state.

    Implementations must be user-scoped: every method takes the authenticated
    ``user_id`` and may only touch that user's records.
    """

    def save_problem(self, user_id: str, problem: NormalizedProblem) -> None: ...
    def list_problems(self, user_id: str) -> list[NormalizedProblem]: ...
    def save_evidence(self, user_id: str, evidence: EvidenceItem) -> None: ...
    def list_evidence(self, user_id: str) -> list[EvidenceItem]: ...
    def save_recommendation(self, user_id: str, rec: Recommendation) -> None: ...
    def list_recommendations(self, user_id: str) -> list[Recommendation]: ...
    def save_draft(self, user_id: str, draft: DraftAction) -> None: ...
    def get_draft(self, user_id: str, action_id: str) -> DraftAction | None: ...
    def save_approval(self, user_id: str, approval: ApprovalRequest) -> None: ...
    def get_approval(self, user_id: str, action_id: str) -> ApprovalRequest | None: ...
    def save_outcome(self, user_id: str, outcome: VerifiedOutcome) -> None: ...
    def consumed_idempotency_keys(self, user_id: str) -> list[str]: ...
    def save_garment(self, user_id: str, garment: GarmentRecord) -> None: ...
    def list_garments(self, user_id: str) -> list[GarmentRecord]: ...
    def save_consent(self, user_id: str, consent: ConsentState) -> None: ...
    def get_consent(self, user_id: str, connector: str) -> ConsentState | None: ...


# Serializes all local record reads/writes. Concurrent atomic renames of the
# same file race file handles on Windows (PermissionError), mirroring the
# write-locking discipline used by agent/memory.py for history files.
_RECORDS_LOCK = threading.Lock()


def _default_root() -> Path:
    """Resolve the Atlas storage root under the existing nanobot data dir."""
    env_dir = os.getenv("NANOBOT_DATA_DIR", "").strip()
    base = Path(env_dir).expanduser() if env_dir else Path.home() / ".nanobot"
    return base / "atlas"


def _atomic_write_json(path: Path, data: Any) -> None:
    """Atomic JSON write: temp file + fsync + rename + directory fsync.

    Mirrors ``nanobot.utils.helpers._write_text_atomic`` and the session/memory
    durability convention without importing helpers (keeps this module free of
    heavy optional dependencies).
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
            handle.flush()
            os.fsync(handle.fileno())
        tmp.replace(path)
        with suppress(OSError, NotImplementedError):
            dir_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)


def _safe_user_dir(user_id: str) -> str:
    """Map a user id to a single filesystem path segment.

    User ids are server-derived but may be UUIDs, emails, or platform ids; they
    are hashed to a fixed hex segment so no user input becomes a path element.
    """
    import hashlib

    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:32]


class LocalAtlasStore:
    """File-backed ``AtlasStore`` under ``<data dir>/atlas/users/<user hash>/``.

    Layout::

        <root>/users/<user-hash>/problems.json
        <root>/users/<user-hash>/evidence.json
        ...

    Each record file is a JSON array rewritten atomically on save. Writes are
    scoped to the calling user's directory; there is no API surface that reads
    across users.
    """

    def __init__(self, root: Path | None = None) -> None:
        self._root = root if root is not None else _default_root()

    @property
    def root(self) -> Path:
        return self._root

    # -- internal helpers ---------------------------------------------------

    def _user_dir(self, user_id: str) -> Path:
        return self._root / "users" / _safe_user_dir(user_id)

    def _path(self, user_id: str, kind: RecordKind) -> Path:
        if kind not in _RECORD_KINDS:
            raise ValueError(f"unknown atlas record kind: {kind!r}")
        return self._user_dir(user_id) / f"{kind}.json"

    def _read(self, user_id: str, kind: RecordKind) -> list[dict[str, Any]]:
        with _RECORDS_LOCK:
            return self._read_unlocked(user_id, kind)

    def _read_unlocked(self, user_id: str, kind: RecordKind) -> list[dict[str, Any]]:
        path = self._path(user_id, kind)
        if not path.exists():
            return []
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            # Corrupt or unreadable state degrades to empty, never crashes
            # the agent; the file itself is left untouched for diagnosis.
            return []
        if isinstance(raw, list):
            return cast("list[dict[str, Any]]", raw)
        return []

    def _write(self, user_id: str, kind: RecordKind, rows: list[dict[str, Any]]) -> None:
        with _RECORDS_LOCK:
            self._write_unlocked(user_id, kind, rows)

    def _write_unlocked(self, user_id: str, kind: RecordKind, rows: list[dict[str, Any]]) -> None:
        _atomic_write_json(self._path(user_id, kind), rows)

    @staticmethod
    def _replace_by_id(
        rows: list[dict[str, Any]], id_field: str, new_row: dict[str, Any]
    ) -> list[dict[str, Any]]:
        key = new_row.get(id_field)
        out = [r for r in rows if r.get(id_field) != key]
        out.append(new_row)
        return out

    # -- generic typed accessors ---------------------------------------------

    def _save(self, user_id: str, kind: RecordKind, id_field: str, record: Any) -> None:
        # One lock acquisition spans the whole read-modify-write so concurrent
        # savers cannot interleave and lose updates.
        with _RECORDS_LOCK:
            rows = self._read_unlocked(user_id, kind)
            rows = self._replace_by_id(
                rows, id_field, record.model_dump(mode="json", exclude_none=True)
            )
            self._write_unlocked(user_id, kind, rows)

    # -- problems -------------------------------------------------------------

    def save_problem(self, user_id: str, problem: NormalizedProblem) -> None:
        self._save(user_id, "problems", "problem_id", problem)

    def list_problems(self, user_id: str) -> list[NormalizedProblem]:
        return [NormalizedProblem.model_validate(r) for r in self._read(user_id, "problems")]

    # -- evidence --------------------------------------------------------------

    def save_evidence(self, user_id: str, evidence: EvidenceItem) -> None:
        self._save(user_id, "evidence", "evidence_id", evidence)

    def list_evidence(self, user_id: str) -> list[EvidenceItem]:
        return [EvidenceItem.model_validate(r) for r in self._read(user_id, "evidence")]

    # -- recommendations ---------------------------------------------------------

    def save_recommendation(self, user_id: str, rec: Recommendation) -> None:
        self._save(user_id, "recommendations", "recommendation_id", rec)

    def list_recommendations(self, user_id: str) -> list[Recommendation]:
        return [Recommendation.model_validate(r) for r in self._read(user_id, "recommendations")]

    # -- drafts --------------------------------------------------------------------

    def save_draft(self, user_id: str, draft: DraftAction) -> None:
        self._save(user_id, "drafts", "action_id", draft)

    def get_draft(self, user_id: str, action_id: str) -> DraftAction | None:
        for row in self._read(user_id, "drafts"):
            if row.get("action_id") == action_id:
                return DraftAction.model_validate(row)
        return None

    # -- approvals ---------------------------------------------------------------

    def save_approval(self, user_id: str, approval: ApprovalRequest) -> None:
        self._save(user_id, "approvals", "action_id", approval)

    def get_approval(self, user_id: str, action_id: str) -> ApprovalRequest | None:
        for row in self._read(user_id, "approvals"):
            if row.get("action_id") == action_id:
                return ApprovalRequest.model_validate(row)
        return None

    # -- outcomes / side-effect ledger ---------------------------------------------

    def save_outcome(self, user_id: str, outcome: VerifiedOutcome) -> None:
        self._save(user_id, "outcomes", "outcome_id", outcome)

    def consumed_idempotency_keys(self, user_id: str) -> list[str]:
        keys: list[str] = []
        for row in self._read(user_id, "outcomes"):
            if row.get("status") == "succeeded":
                keys.extend(row.get("consumed_idempotency_keys") or [])
        return keys

    # -- garments (Wardrobe Help; user-entered data) -----------------------------

    def save_garment(self, user_id: str, garment: GarmentRecord) -> None:
        """Store one user-entered garment (overwrites by garment_id)."""
        self._save(user_id, "garments", "garment_id", garment)

    def list_garments(self, user_id: str) -> list[GarmentRecord]:
        return [GarmentRecord.model_validate(r) for r in self._read(user_id, "garments")]

    # -- consents (server-stored grant records, keyed user+connector) ------------

    def save_consent(self, user_id: str, consent: ConsentState) -> None:
        """Store one consent grant keyed by user+connector (latest wins).

        ``ConsentState`` is a frozen dataclass (policy-owned), so it is
        serialized with ``dataclasses.asdict``; datetimes become ISO strings.
        """
        row = asdict(consent)
        for field_name in ("granted_at", "expires_at"):
            value = row.get(field_name)
            if isinstance(value, datetime):
                row[field_name] = value.isoformat()
        with _RECORDS_LOCK:
            rows = self._read_unlocked(user_id, "consents")
            rows = [r for r in rows if r.get("connector") != consent.connector]
            rows.append(row)
            self._write_unlocked(user_id, "consents", rows)

    def get_consent(self, user_id: str, connector: str) -> ConsentState | None:
        for row in self._read(user_id, "consents"):
            if row.get("connector") == connector:
                try:
                    granted = row.get("granted_at")
                    if not isinstance(granted, str):
                        return None
                    expires_raw = row.get("expires_at")
                    return ConsentState(
                        user_id=str(row.get("user_id") or ""),
                        scope=ConsentScope(str(row.get("scope") or "")),
                        connector=str(row.get("connector") or ""),
                        granted_at=datetime.fromisoformat(granted),
                        expires_at=(
                            datetime.fromisoformat(expires_raw)
                            if isinstance(expires_raw, str) else None
                        ),
                        revoked=bool(row.get("revoked", False)),
                    )
                except (ValueError, KeyError):
                    return None
        return None
