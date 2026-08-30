"""The drafts page: every version of an article a run produced.

The case that motivates it is run 25178bce, where repair produced a shorter
draft, the keep-best comparison scored it no higher than the one it replaced,
and the *earlier* draft shipped. Nothing in the run record said so at a glance.
"""

from __future__ import annotations

import asyncio
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core import write_status, write_stage_result
from app.features.prompt2blog.api import runs as runs_api
from app.features.prompt2blog.drafts_view import (
    band_side,
    build_drafts_report,
    markdown_to_html,
    pipeline_words,
    plain_words,
    render_drafts_page,
)
from tests.prompt2blog_test_support import seed_completed_prompt2blog_run

pytest_plugins = ["tests.prompt2blog_test_fixtures"]

FIRST_DRAFT = "## Lima\n\n" + "word " * 600
REPAIRED_DRAFT = "## Lima\n\n" + "word " * 400


def _stages() -> dict[str, dict]:
    return {
        "stage_v3_compose": {
            "created_at": "2026-08-29T13:04:14+00:00",
            "data": {"rewrite": {"improved_title": "Lima", "improved_content": FIRST_DRAFT}},
        },
        "stage_v3_repair": {
            "created_at": "2026-08-29T13:06:33+00:00",
            "data": {"rewrite": {"improved_title": "Lima", "improved_content": REPAIRED_DRAFT}},
        },
        "stage_v3_quality_audit": {
            "created_at": "2026-08-29T13:06:47+00:00",
            "data": {
                "quality": {
                    "overall_score": 6,
                    "required_revisions": ["Trim the draft"],
                    "constraint_checks": {"target_word_count_met": False},
                },
                "repair_decision": {
                    "route": "settle",
                    "reason": "attempt_limit_reached",
                    "attempts_used": 1,
                    "attempts_allowed": 1,
                    "tokens_spent": 119366,
                    "token_budget": 320000,
                },
            },
        },
        "stage_v3_quality_settle": {
            "created_at": "2026-08-29T13:06:47+00:00",
            "data": {"repair_attempts": 1, "reverted_to_earlier_draft": True},
        },
        "stage_v3_finalize": {
            "created_at": "2026-08-29T13:06:55+00:00",
            "data": {
                "pipeline_status": "needs_revision",
                "readiness_blockers": ["target_word_count_met"],
                "constraint_checks": {
                    "target_word_count_met": False,
                    "word_count_target_min": 800,
                    "word_count_target_max": 1000,
                },
            },
        },
    }


def test_report_marks_the_draft_that_actually_shipped():
    report = build_drafts_report(
        run_id="run-1",
        status={"feature": "prompt2blog"},
        stages=_stages(),
        markdown="# Lima\n\n" + FIRST_DRAFT,
    )

    labels = [draft["label"] for draft in report["drafts"]]
    assert labels == ["First draft", "Repaired draft", "Shipped article"]

    shipped = [draft["label"] for draft in report["drafts"] if draft["is_shipped"]]
    # The compose draft, not the repair that replaced and then lost to it.
    assert shipped == ["First draft"]


def test_repaired_draft_is_kept_even_when_it_was_discarded():
    """A discarded draft is the whole reason to open this page."""
    report = build_drafts_report(
        run_id="run-1",
        status={},
        stages=_stages(),
        markdown="# Lima\n\n" + FIRST_DRAFT,
    )

    repaired = next(d for d in report["drafts"] if d["label"] == "Repaired draft")
    assert repaired["words"] == plain_words(REPAIRED_DRAFT)
    assert repaired["is_shipped"] is False


def test_page_reports_both_word_counts_and_the_revert():
    report = build_drafts_report(
        run_id="run-1",
        status={},
        stages=_stages(),
        markdown="# Lima\n\n" + FIRST_DRAFT,
    )
    page = render_drafts_page(report)

    assert "reverted to an earlier one" in page
    assert "pipeline counter says" in page
    assert "Trim the draft" in page
    assert "attempt_limit_reached" in page


def test_pipeline_counter_can_disagree_with_a_word_count():
    """The counter splits on punctuation, which is what failed run 25178bce."""
    text = "day-by-day US$1,090"

    assert plain_words(text) == 2
    assert pipeline_words(text) == 6


def test_band_side_reports_which_way_a_count_missed():
    assert band_side(1004, 800, 1000) == "over"
    assert band_side(700, 800, 1000) == "under"
    assert band_side(900, 800, 1000) == ""
    # No band configured is not a failure.
    assert band_side(900, 0, 0) == ""


def test_markdown_rendering_escapes_html_in_a_draft():
    rendered = markdown_to_html("## <script>alert(1)</script>\n\nBody **bold**")

    assert "<script>" not in rendered
    assert "&lt;script&gt;" in rendered
    assert "<strong>bold</strong>" in rendered


def test_drafts_route_renders_html_for_a_run(empty_prompt2blog_storage):
    run_id = f"p2b-{uuid4()}"
    seed_completed_prompt2blog_run(run_id)
    write_stage_result(
        run_id,
        "stage_v3_compose",
        {
            "created_at": "2026-08-29T13:04:14+00:00",
            "data": {"rewrite": {"improved_title": "Lima", "improved_content": FIRST_DRAFT}},
        },
    )

    response = asyncio.run(runs_api.drafts_page(run_id))

    assert response.status_code == 200
    assert response.media_type == "text/html"
    assert "First draft" in response.body.decode("utf-8")


def test_drafts_route_404s_for_an_unknown_run(empty_prompt2blog_storage):
    with pytest.raises(HTTPException) as raised:
        asyncio.run(runs_api.drafts_page("no-such-run"))

    assert raised.value.status_code == 404


def test_drafts_route_404s_when_a_run_has_no_draft_yet(empty_prompt2blog_storage):
    """A run that failed before composing holds no article to show."""
    run_id = f"p2b-{uuid4()}"
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "failed",
            "stage": "stage_v3_outline",
            "error": "stopped early",
            "updated_at": "2026-08-29T00:00:00Z",
        },
        feature="prompt2blog",
    )

    with pytest.raises(HTTPException) as raised:
        asyncio.run(runs_api.drafts_page(run_id))

    assert raised.value.status_code == 404
