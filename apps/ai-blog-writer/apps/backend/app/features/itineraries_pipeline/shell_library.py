"""Day Shell Library — backend-persisted Custom Day Shells (ADR 0017).

The library is a palette, not a dependency: the frontend snapshots a shell's
slots into the itinerary draft at selection time, so edits and deletes here
never change an existing itinerary's setup.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from app.core.database import get_db_connection

from .schemas import DayShell


def ensure_shell_library_table() -> None:
    with get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS day_shell_library (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                slots TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )


def _row_to_shell(row) -> DayShell:
    return DayShell(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        slots=json.loads(row["slots"]),
    )


def list_library_shells() -> list[DayShell]:
    ensure_shell_library_table()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM day_shell_library ORDER BY name COLLATE NOCASE"
        ).fetchall()
    return [_row_to_shell(row) for row in rows]


def get_library_shell(shell_id: str) -> DayShell | None:
    ensure_shell_library_table()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM day_shell_library WHERE id = ?", (shell_id,)
        ).fetchone()
    return _row_to_shell(row) if row else None


def save_library_shell(shell: DayShell) -> DayShell:
    """Insert or update one library shell (upsert keyed by id)."""
    ensure_shell_library_table()
    now = datetime.now(timezone.utc).isoformat()
    slots_json = json.dumps([slot.model_dump() for slot in shell.slots])
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO day_shell_library (id, name, description, slots, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                slots = excluded.slots,
                updated_at = excluded.updated_at
            """,
            (shell.id, shell.name, shell.description, slots_json, now, now),
        )
    return shell


def delete_library_shell(shell_id: str) -> bool:
    ensure_shell_library_table()
    with get_db_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM day_shell_library WHERE id = ?", (shell_id,)
        )
        return cursor.rowcount > 0
