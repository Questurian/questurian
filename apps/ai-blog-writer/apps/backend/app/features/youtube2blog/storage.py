"""
YouTube2Blog feature-specific storage.

Handles YouTube2Blog-specific operations like getting completed articles
and sync status.

Article type CRUD operations have moved to app.core.article_types.
"""
import json
from typing import Any, Dict, List, Optional

from app.core.database import get_db_connection

# Re-export article_types functions from core for backward compatibility
from app.core.article_types import (
    write_article_type,
    read_article_types,
    read_article_type_names,
    read_article_definitions,
    read_article_guidelines,
    get_article_type_by_name,
    delete_article_type,
)

__all__ = [
    # Article types (re-exported from core)
    "write_article_type",
    "read_article_types",
    "read_article_type_names",
    "read_article_definitions",
    "read_article_guidelines",
    "get_article_type_by_name",
    "delete_article_type",
    # YouTube2Blog-specific functions
    "get_all_completed_articles",
    "mark_article_synced",
    "get_article_sync_status",
]


def get_all_completed_articles() -> List[Dict[str, Any]]:
    """Get all completed YouTube2Blog articles with their outputs."""
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                r.run_id,
                r.status,
                r.created_at,
                r.updated_at,
                o.markdown,
                o.artifact,
                o.synced_to_payload,
                o.payload_article_id,
                o.synced_at
            FROM runs r
            INNER JOIN outputs o ON r.run_id = o.run_id
            WHERE r.status = 'completed' AND r.feature = 'youtube2blog'
            ORDER BY r.updated_at DESC
            """
        ).fetchall()

        articles = []
        for row in rows:
            artifact = json.loads(row["artifact"]) if row["artifact"] else {}

            # Extract title from stage_4 data if available
            title = None
            article_type = None
            stages = artifact.get("stages", {})
            if "stage_4" in stages:
                stage4_data = stages["stage_4"].get("data", {})
                title = stage4_data.get("title")
                article_type = stage4_data.get("article_type")
            elif "stage_3" in stages:
                stage3_data = stages["stage_3"].get("data", {})
                article_type = stage3_data.get("article_type")

            articles.append(
                {
                    "run_id": row["run_id"],
                    "title": title,
                    "article_type": article_type,
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "markdown": row["markdown"],
                    "markdown_length": len(row["markdown"]) if row["markdown"] else 0,
                    "synced_to_payload": bool(row["synced_to_payload"]),
                    "payload_article_id": row["payload_article_id"],
                    "synced_at": row["synced_at"],
                }
            )

        return articles


def mark_article_synced(run_id: str, payload_article_id: int) -> bool:
    """
    Mark an article as synced to Payload CMS.

    Args:
        run_id: The run ID of the article
        payload_article_id: The ID of the article in Payload CMS

    Returns:
        True if updated, False if article not found
    """
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
