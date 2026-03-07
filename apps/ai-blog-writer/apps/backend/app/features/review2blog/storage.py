"""Review2Blog feature-specific storage helpers."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from app.core.database import get_db_connection


def get_all_completed_articles(location_key: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get completed Review2Blog outputs, optionally filtered by location_key."""
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
            location_context = review_payload.get("location_context")
            location_context = (
                location_context if isinstance(location_context, dict) else {}
            )
            resolved_location_key = str(location_context.get("location_key") or "").strip()
            if location_key and resolved_location_key != location_key:
                continue

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
                    "location_key": resolved_location_key,
                    "location_name": (
                        location_context.get("name")
                        or review_payload.get("location_name")
                        or review_payload.get("restaurant_name")
                        or ""
                    ),
                    "listicle_title": str(listicle.get("listicle_title") or ""),
                    "blurb_length": str(listicle.get("blurb_length") or ""),
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "markdown": row["markdown"],
                    "markdown_length": len(row["markdown"]) if row["markdown"] else 0,
                }
            )

        return articles
