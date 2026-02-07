"""
Shared article types storage.

Article types are reference data used across multiple features (youtube2blog,
url2blog, etc.) for classifying and generating content.
"""
import json
from typing import Any, Dict, List, Optional

from .database import get_db_connection


def ensure_article_types_table() -> None:
    """Create the article_types table if it doesn't exist."""
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
            conn.execute(
                "ALTER TABLE article_types ADD COLUMN title_guideline TEXT DEFAULT ''"
            )
        conn.execute(
            "UPDATE article_types SET title_guideline = '' WHERE title_guideline IS NULL"
        )


# Initialize table on module load
ensure_article_types_table()


def write_article_type(
    name: str,
    definition: str,
    guideline: Optional[str] = None,
    title_guideline: Optional[str] = None,
) -> Dict[str, Any]:
    """Write or update an article type. Returns the article type data."""
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO article_types (name, definition, guideline, title_guideline, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(name) DO UPDATE SET
                definition = excluded.definition,
                guideline = COALESCE(excluded.guideline, article_types.guideline),
                title_guideline = COALESCE(excluded.title_guideline, article_types.title_guideline),
                updated_at = datetime('now')
        """,
            (name, definition, guideline, title_guideline),
        )

        # Return the created/updated article type
        row = conn.execute(
            """
            SELECT id, name, definition, guideline, title_guideline, created_at, updated_at
            FROM article_types WHERE name = ?
            """,
            (name,),
        ).fetchone()
        return dict(row) if row else {}


def read_article_types() -> List[Dict[str, Any]]:
    """Read all article types with their definitions."""
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, definition, guideline, title_guideline, created_at, updated_at
            FROM article_types ORDER BY name
            """
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
            """
            SELECT name, guideline FROM article_types
            WHERE guideline IS NOT NULL ORDER BY name
            """
        ).fetchall()
        return [f"## {row['name']}\n{row['guideline']}" for row in rows]


def get_article_type_by_name(name: str) -> Optional[Dict[str, Any]]:
    """Read a specific article type by name."""
    with get_db_connection() as conn:
        row = conn.execute(
            """
            SELECT id, name, definition, guideline, title_guideline, created_at, updated_at
            FROM article_types WHERE name = ?
            """,
            (name,),
        ).fetchone()
        if not row:
            return None
        return dict(row)


def delete_article_type(article_type_id: int) -> bool:
    """Delete an article type by ID. Returns True if deleted, False if not found."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM article_types WHERE id = ?", (article_type_id,)
        )
        return cursor.rowcount > 0


def get_article_type_guideline(name: str) -> Optional[str]:
    """Get the guideline for a specific article type by name."""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT guideline FROM article_types WHERE name = ?",
            (name,),
        ).fetchone()
        return row["guideline"] if row else None


def get_article_type_title_guideline(name: str) -> Optional[str]:
    """Get the title guideline for a specific article type by name."""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT title_guideline FROM article_types WHERE name = ?",
            (name,),
        ).fetchone()
        return row["title_guideline"] if row else None
