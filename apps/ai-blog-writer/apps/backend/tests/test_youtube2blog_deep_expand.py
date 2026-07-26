from __future__ import annotations

import pytest

from app.features.youtube2blog.stages import stage_deep_expand


def test_detect_listicle_keeps_stage_level_llm_seam(monkeypatch):
    calls = []

    def fake_invoke(prompt, model_name):
        calls.append((prompt, model_name))
        return {
            "is_listicle": True,
            "list_type": "places",
            "list_topic": "islands",
            "detected_items": list(range(25)),
        }

    monkeypatch.setattr(stage_deep_expand, "_invoke_json_llm", fake_invoke)

    result = stage_deep_expand.detect_listicle(
        "Article body",
        "Island guide",
        model_name="test-model",
    )

    assert calls[0][1] == "test-model"
    assert result == {
        "is_listicle": True,
        "list_type": "places",
        "list_topic": "islands",
        "detected_items": [str(index) for index in range(20)],
    }


def test_run_deep_expand_persists_gap_analysis_and_expansion(monkeypatch):
    statuses = []
    results = []
    monkeypatch.setattr(stage_deep_expand, "_now_iso", lambda: "now")
    monkeypatch.setattr(
        stage_deep_expand,
        "write_status",
        lambda job_id, payload, **kwargs: statuses.append(
            (job_id, payload, kwargs)
        ),
    )
    monkeypatch.setattr(
        stage_deep_expand,
        "write_stage_result",
        lambda job_id, stage, payload: results.append((job_id, stage, payload)),
    )
    monkeypatch.setattr(
        stage_deep_expand,
        "analyze_article_gaps",
        lambda *args, **kwargs: {
            "gaps": [{"topic": "history"}],
            "expansion_plan": "Add context.",
        },
    )
    monkeypatch.setattr(
        stage_deep_expand,
        "expand_article_with_gaps",
        lambda *args, **kwargs: "Expanded article",
    )

    stage_deep_expand.run_deep_expand(
        "job-1",
        "Article",
        "guide",
        "Title",
        model_name="test-model",
    )

    assert [payload["stage"] for _, payload, _ in statuses] == [
        "analyzing",
        "expanding",
        "completed",
    ]
    assert [stage for _, stage, _ in results] == [
        "gap_analysis",
        "expand_result",
    ]
    assert results[-1][2]["expanded_article"] == "Expanded article"


def test_run_deep_expand_dispatches_listicle_rewrite(monkeypatch):
    statuses = []
    results = []
    rewrite_calls = []
    monkeypatch.setattr(stage_deep_expand, "_now_iso", lambda: "now")
    monkeypatch.setattr(
        stage_deep_expand,
        "write_status",
        lambda job_id, payload, **kwargs: statuses.append(payload),
    )
    monkeypatch.setattr(
        stage_deep_expand,
        "write_stage_result",
        lambda job_id, stage, payload: results.append((stage, payload)),
    )

    def fake_rewrite(*args, **kwargs):
        rewrite_calls.append((args, kwargs))
        return "Rewritten article"

    monkeypatch.setattr(
        stage_deep_expand,
        "rewrite_listicle_article",
        fake_rewrite,
    )

    stage_deep_expand.run_deep_expand(
        "job-2",
        "Article",
        "listicle",
        "Title",
        model_name="test-model",
        rewrite_items=["First", "Second"],
    )

    assert rewrite_calls[0][0][3] == ["First", "Second"]
    assert [payload["stage"] for payload in statuses] == [
        "rewriting",
        "completed",
    ]
    assert results == [
        (
            "expand_result",
            {
                "expanded_article": "Rewritten article",
                "gaps": [],
                "expansion_plan": "Rewritten around 2 curated items.",
                "created_at": "now",
            },
        )
    ]


def test_run_deep_expand_records_failure_and_reraises(monkeypatch):
    statuses = []
    monkeypatch.setattr(stage_deep_expand, "_now_iso", lambda: "now")
    monkeypatch.setattr(
        stage_deep_expand,
        "write_status",
        lambda job_id, payload, **kwargs: statuses.append(payload),
    )
    monkeypatch.setattr(
        stage_deep_expand,
        "analyze_article_gaps",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("broken")),
    )

    with pytest.raises(RuntimeError, match="broken"):
        stage_deep_expand.run_deep_expand(
            "job-3",
            "Article",
            "guide",
            "Title",
        )

    assert statuses[-1] == {
        "run_id": "job-3",
        "stage": "error",
        "state": "failed",
        "updated_at": "now",
        "error": "broken",
    }
