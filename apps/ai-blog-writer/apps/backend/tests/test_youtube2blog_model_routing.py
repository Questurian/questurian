"""Which model each stage runs on."""

from types import SimpleNamespace

from shared import Stage3Output

from app.features.youtube2blog.graph.nodes import composition as composition_nodes
from app.features.youtube2blog.graph.nodes import seo as seo_nodes

BASE_MODEL = "base-model"
WRITING_MODEL = "writing-model"


def _stage3() -> Stage3Output:
    return Stage3Output(
        video_id="v1",
        title="A Title",
        article_type="News",
        coverage_sufficient=True,
        coverage_analysis="",
        missing_sections=[],
        supplemental_content=None,
        final_article="## Section\n\nArticle body.",
        guideline_used="guideline",
    )


def _context():
    return SimpleNamespace(
        run_id="run-1",
        active_model=BASE_MODEL,
        writing_model=WRITING_MODEL,
        tone_guidance="",
        start_stage=lambda _stage: None,
        record_stage=lambda state, **_kwargs: dict(state.get("stage_results") or {}),
        stage_ref=lambda run_id, stage: f"data/runs/{run_id}/{stage}.json",
        dependencies=SimpleNamespace(),
    )


def test_stage_3_rewrite_runs_on_the_writing_model(monkeypatch):
    """The improve loop rewrites a draft composed on the writing model. Running
    it on the cheap base model handed that draft to a weaker writer."""
    captured: dict[str, object] = {}

    def spy(**kwargs):
        captured.update(kwargs)
        return {"improved_article": "Improved.", "debug_improve_prompt": ""}

    monkeypatch.setattr(composition_nodes, "stage_3_improve_article", spy)
    node = composition_nodes.build_composition_nodes(_context())["stage_3_improve"]

    node(
        {
            "stage3": _stage3().model_dump(),
            "stage3_quality_feedback": {"overall_quality_score": 5.0},
            "stage3_quality_retry_count": 0,
        }
    )

    assert captured["model_name"] == WRITING_MODEL


def test_seo_enrichment_and_retry_run_on_the_writing_model(monkeypatch):
    calls: list[dict] = []

    def spy(**kwargs):
        calls.append(kwargs)
        return {"seo_article": "SEO body.", "debug_seo_prompt": ""}

    monkeypatch.setattr(seo_nodes, "stage_seo_enrich_article", spy)
    nodes = seo_nodes.build_seo_nodes(_context())

    nodes["stage_seo_enrich"](
        {"stage3": _stage3().model_dump(), "stage_seo_brief": {}}
    )
    nodes["stage_seo_retry"](
        {
            "stage3_for_editorial": _stage3().model_dump(),
            "stage_seo_brief": {},
            "stage_seo_retry_count": 0,
        }
    )

    assert [call["model_name"] for call in calls] == [WRITING_MODEL, WRITING_MODEL]
    assert [call["mode"] for call in calls] == ["primary", "retry"]


def test_seo_brief_stays_on_the_cheaper_base_model(monkeypatch):
    """Brief generation is structured keyword extraction, not a rewrite."""
    captured: dict[str, object] = {}

    def spy(**kwargs):
        captured.update(kwargs)
        return {"focus_keyword": "travel"}

    monkeypatch.setattr(seo_nodes, "stage_seo_generate_brief", spy)
    node = seo_nodes.build_seo_nodes(_context())["stage_seo_brief"]

    node({"stage3": _stage3().model_dump()})

    assert captured["model_name"] == BASE_MODEL
