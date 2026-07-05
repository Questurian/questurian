"""
Staged-drafts storage helpers.

Persists in-progress staged article drafts in the shared SQLite database. Each
draft is stored as an opaque JSON blob keyed by ``(storage_key, draft_id)`` so
the backend stays agnostic about the draft's internal shape (the frontend owns
normalization). Only ``draft_id`` and ``storage_key`` are promoted to columns
for keying and listing.
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.database import get_db_connection


class StagedDraftConflict(Exception):
    """Raised when a conditional update loses to a concurrent write.

    ``current`` holds the draft as stored now, or ``None`` if it was deleted.
    """

    def __init__(self, current: Optional[Dict[str, Any]]):
        super().__init__("Staged draft was modified concurrently")
        self.current = current


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_dict(row: Any) -> Dict[str, Any]:
    """Deserialize a staged_drafts row into the stored draft blob.

    The stored ``data`` blob is the source of truth for the draft body; we merge
    the promoted columns on top so ``id`` and timestamps always reflect the row.
    """
    data = json.loads(row["data"]) if row["data"] else {}
    if not isinstance(data, dict):
        data = {}
    data["id"] = row["draft_id"]
    data["createdAt"] = row["created_at"]
    data["updatedAt"] = row["updated_at"]
    return data


def list_staged_drafts(storage_key: str) -> List[Dict[str, Any]]:
    """Return all drafts for a storage key, newest first."""
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT storage_key, draft_id, data, created_at, updated_at
            FROM staged_drafts
            WHERE storage_key = ?
            ORDER BY updated_at DESC
            """,
            (storage_key,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]


def get_staged_draft(storage_key: str, draft_id: str) -> Optional[Dict[str, Any]]:
    """Return a single draft, or ``None`` if it does not exist."""
    with get_db_connection() as conn:
        row = conn.execute(
            """
            SELECT storage_key, draft_id, data, created_at, updated_at
            FROM staged_drafts
            WHERE storage_key = ? AND draft_id = ?
            """,
            (storage_key, draft_id),
        ).fetchone()
        return _row_to_dict(row) if row else None


def upsert_staged_draft(
    storage_key: str, draft_id: str, data: Dict[str, Any]
) -> Dict[str, Any]:
    """Insert or update a draft, preserving ``created_at`` on update."""
    now = _now_iso()
    serialized = json.dumps(data)
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO staged_drafts
                (storage_key, draft_id, data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(storage_key, draft_id) DO UPDATE SET
                data = excluded.data,
                updated_at = excluded.updated_at
            """,
            (storage_key, draft_id, serialized, now, now),
        )
    # Re-read so the returned draft reflects the persisted timestamps (created_at
    # is unchanged on update thanks to the ON CONFLICT clause above).
    draft = get_staged_draft(storage_key, draft_id)
    assert draft is not None  # just written
    return draft


def update_staged_draft_if_unmodified(
    storage_key: str,
    draft_id: str,
    data: Dict[str, Any],
    expected_updated_at: str,
) -> Dict[str, Any]:
    """Update a draft only if its ``updated_at`` still matches the caller's copy.

    The conditional UPDATE is the compare-and-set: SQLite executes it atomically,
    so a zero rowcount means the row changed (or was deleted) since the caller
    last read it, and a ``StagedDraftConflict`` is raised with the current state.
    """
    now = _now_iso()
    serialized = json.dumps(data)
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE staged_drafts
            SET data = ?, updated_at = ?
            WHERE storage_key = ? AND draft_id = ? AND updated_at = ?
            """,
            (serialized, now, storage_key, draft_id, expected_updated_at),
        )
        if cursor.rowcount == 0:
            raise StagedDraftConflict(get_staged_draft(storage_key, draft_id))
    draft = get_staged_draft(storage_key, draft_id)
    assert draft is not None  # just updated
    return draft


def delete_staged_draft(storage_key: str, draft_id: str) -> None:
    """Delete a single draft (no-op if it does not exist)."""
    with get_db_connection() as conn:
        conn.execute(
            "DELETE FROM staged_drafts WHERE storage_key = ? AND draft_id = ?",
            (storage_key, draft_id),
        )


def delete_all_staged_drafts(storage_key: str) -> None:
    """Delete every draft for a storage key."""
    with get_db_connection() as conn:
        conn.execute(
            "DELETE FROM staged_drafts WHERE storage_key = ?",
            (storage_key,),
        )
