"""
Shared helpers for article sync state in the outputs table.
"""

from typing import Any, Dict, Optional

from app.core.database import get_db_connection


def mark_article_synced(run_id: str, payload_article_id: int) -> bool:
    """Mark an article as synced to Payload CMS."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE outputs
            SET synced_to_payload = 1,
                payload_article_id = ?,
                synced_at = datetime('now')
            WHERE run_id = ?
            """,
            (payload_article_id, run_id),
        )
        return cursor.rowcount > 0


def get_article_sync_status(run_id: str) -> Optional[Dict[str, Any]]:
    """Get the sync status of an article."""
    with get_db_connection() as conn:
        row = conn.execute(
            """
            SELECT synced_to_payload, payload_article_id, synced_at
            FROM outputs WHERE run_id = ?
            """,
            (run_id,),
        ).fetchone()

        if not row:
            return None

        return {
            "synced_to_payload": bool(row["synced_to_payload"]),
            "payload_article_id": row["payload_article_id"],
            "synced_at": row["synced_at"],
        }
