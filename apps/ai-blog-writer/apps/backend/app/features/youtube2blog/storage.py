"""
YouTube2Blog feature-specific storage.

Handles article_types table which is specific to the YouTube transcript
to article pipeline.
"""
import json
from typing import Any, Dict, List, Optional

from app.core.database import get_db_connection


def ensure_youtube2blog_tables() -> None:
    """Create YouTube2Blog-specific tables."""
    with get_db_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS article_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                definition TEXT NOT NULL,
                guideline TEXT,
                title_guideline TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
        # Migration: ensure title_guideline column exists
        cursor = conn.execute("PRAGMA table_info(article_types)")
        columns = [row[1] for row in cursor.fetchall()]
        if "title_guideline" not in columns:
            conn.execute("ALTER TABLE article_types ADD COLUMN title_guideline TEXT DEFAULT ''")
        conn.execute("UPDATE article_types SET title_guideline = '' WHERE title_guideline IS NULL")


# Initialize tables on module load
ensure_youtube2blog_tables()


def write_article_type(
    name: str,
    definition: str,
    guideline: Optional[str] = None,
    title_guideline: Optional[str] = None
) -> Dict[str, Any]:
    """Write or update an article type. Returns the article type data."""
    with get_db_connection() as conn:
        conn.execute("""
            INSERT INTO article_types (name, definition, guideline, title_guideline, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(name) DO UPDATE SET
                definition = excluded.definition,
                guideline = COALESCE(excluded.guideline, article_types.guideline),
                title_guideline = COALESCE(excluded.title_guideline, article_types.title_guideline),
                updated_at = datetime('now')
        """, (name, definition, guideline, title_guideline))

        # Return the created/updated article type
        row = conn.execute(
            "SELECT id, name, definition, guideline, title_guideline, created_at, updated_at FROM article_types WHERE name = ?",
            (name,)
        ).fetchone()
        return dict(row) if row else {}


def read_article_types() -> List[Dict[str, Any]]:
    """Read all article types with their definitions."""
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, definition, guideline, title_guideline, created_at, updated_at FROM article_types ORDER BY name"
        ).fetchall()
        return [dict(row) for row in rows]


def read_article_type_names() -> List[str]:
    """Read just the article type names."""
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT name FROM article_types ORDER BY name"
        ).fetchall()
        return [row["name"] for row in rows]


def read_article_definitions() -> List[str]:
    """Read article type definitions for classification."""
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT name, definition FROM article_types ORDER BY name"
        ).fetchall()
        return [f"- {row['name']} → {row['definition']}" for row in rows]


def read_article_guidelines() -> List[str]:
    """Read article type names and guidelines for enhanced classification."""
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT name, guideline FROM article_types WHERE guideline IS NOT NULL ORDER BY name"
        ).fetchall()
        return [f"## {row['name']}\n{row['guideline']}" for row in rows]


def get_article_type_by_name(name: str) -> Optional[Dict[str, Any]]:
    """Read a specific article type by name."""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT id, name, definition, guideline, title_guideline, created_at, updated_at FROM article_types WHERE name = ?",
            (name,)
        ).fetchone()
        if not row:
            return None
        return dict(row)


def delete_article_type(article_type_id: int) -> bool:
    """Delete an article type by ID. Returns True if deleted, False if not found."""
    with get_db_connection() as conn:
        cursor = conn.execute("DELETE FROM article_types WHERE id = ?", (article_type_id,))
        return cursor.rowcount > 0


def get_all_completed_articles() -> List[Dict[str, Any]]:
    """Get all completed YouTube2Blog articles with their outputs."""
    with get_db_connection() as conn:
        rows = conn.execute("""
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
        """).fetchall()

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

            articles.append({
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
            })

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
