"""Shared data helpers for Prompt2Blog route and storage tests."""

from __future__ import annotations

import json

from app.core import write_artifact, write_status


def response_payload(response) -> dict:
    return json.loads(response.body.decode("utf-8"))


def seed_completed_prompt2blog_run(run_id: str) -> None:
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "completed",
            "stage": "complete",
            "error": None,
            "updated_at": "2026-03-05T00:00:00Z",
        },
        feature="prompt2blog",
    )
    write_artifact(
        run_id,
        {
            "markdown": "# Persisted Prompt2Blog Title\n\n## Overview\n\nBody content.",
            "pipeline_v2": {
                "improved_article": {
                    "title": "Persisted Prompt2Blog Title",
                    "content": "## Overview\n\nBody content.",
                },
                "article_type": {"id": 11, "name": "Explainer"},
            },
        },
    )
