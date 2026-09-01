"""
Prompt2Blog feature-specific storage helpers.

Handles completed-article listing and Payload sync status for Prompt2Blog runs.
"""

import json
from typing import Any, Dict, List, Optional

from app.core import article_sync
from app.core.database import get_db_connection


def get_all_completed_articles() -> List[Dict[str, Any]]:
    """Get all completed Prompt2Blog articles with their outputs."""
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
            WHERE r.status = 'completed' AND r.feature = 'prompt2blog'
            ORDER BY r.updated_at DESC
            """
        ).fetchall()

        articles: List[Dict[str, Any]] = []
        for row in rows:
            artifact = json.loads(row["artifact"]) if row["artifact"] else {}
            artifact = artifact if isinstance(artifact, dict) else {}
            # v3 and v4 runs store the payload under `pipeline_v3`; only v2
            # ever wrote `pipeline_v2`. Reading one key meant every run since
            # the v3 cutover listed with a null title and no type, which is
            # what Saved Articles shows and what the staging link carries.
            payload = artifact.get("pipeline_v3") or artifact.get("pipeline_v2")
            payload = payload if isinstance(payload, dict) else {}

            improved_article = payload.get("improved_article")
            improved_article = (
                improved_article if isinstance(improved_article, dict) else {}
            )
            # v2 names the editorial shape `article_type.name`; v3 and v4 call
            # the same slot `form.label`.
            article_type = payload.get("article_type")
            article_type = article_type if isinstance(article_type, dict) else {}
            form = payload.get("form")
            form = form if isinstance(form, dict) else {}

            title = improved_article.get("title") or payload.get("final_title")
            article_type_name = article_type.get("name") or form.get("label")

            articles.append(
                {
                    "run_id": row["run_id"],
                    "title": title,
                    "article_type": article_type_name,
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
    """Mark an article as synced to Payload CMS."""
    return article_sync.mark_article_synced(run_id, payload_article_id)


def get_article_sync_status(run_id: str) -> Optional[Dict[str, Any]]:
    """Get the sync status of an article."""
    return article_sync.get_article_sync_status(run_id)
