"""Review2Blog feature-specific storage helpers."""

from __future__ import annotations

import json
from typing import Any, Dict, List

from app.core.database import get_db_connection


def get_all_completed_articles() -> List[Dict[str, Any]]:
    """Get all completed Review2Blog outputs."""
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                r.run_id,
                r.status,
                r.created_at,
                r.updated_at,
                o.markdown,
                o.artifact
            FROM runs r
            INNER JOIN outputs o ON r.run_id = o.run_id
            WHERE r.status = 'completed' AND r.feature = 'review2blog'
            ORDER BY r.updated_at DESC
            """
        ).fetchall()

        articles: List[Dict[str, Any]] = []
        for row in rows:
            artifact = json.loads(row["artifact"]) if row["artifact"] else {}
            review_payload = (
                artifact.get("review2blog_run")
                if isinstance(artifact, dict)
                else {}
            )
            review_payload = review_payload if isinstance(review_payload, dict) else {}
            listicle = review_payload.get("listicle")
            listicle = listicle if isinstance(listicle, dict) else {}

            title = (
                listicle.get("listicle_title")
                or review_payload.get("location_name")
                or review_payload.get("restaurant_name")
                or "Review2Blog Draft"
            )

            articles.append(
                {
                    "run_id": row["run_id"],
                    "title": title,
                    "article_type": "review2blog",
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "markdown": row["markdown"],
                    "markdown_length": len(row["markdown"]) if row["markdown"] else 0,
                }
            )

        return articles
