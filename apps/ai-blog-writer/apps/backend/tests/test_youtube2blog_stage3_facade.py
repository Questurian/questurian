from app.features.youtube2blog.stages import stage_3
from app.features.youtube2blog.stages.stage_3_coverage import check_coverage
from shared import Stage1Output, Stage2Output


class _FakeLlm:
    def __init__(self, response: str):
        self.response = response
        self.prompts: list[str] = []

    def invoke(self, prompt: str) -> str:
        self.prompts.append(prompt)
        return self.response


def test_guideline_lookup_prefers_normalized_markdown_file(
    monkeypatch,
    tmp_path,
):
    guideline_path = tmp_path / "News & Trends.md"
    guideline_path.write_text("Use the news structure.", encoding="utf-8")
    database_calls: list[str] = []

    def track_database_lookup(article_type: str):
        database_calls.append(article_type)
        return None

    monkeypatch.setattr(stage_3, "ARTICLE_GUIDELINES_DIR", tmp_path)
    monkeypatch.setattr(
        stage_3,
        "get_article_type_by_name",
        track_database_lookup,
    )

    assert (
        stage_3.stage_3_retrieve_guideline("News and Trends")
        == "Use the news structure."
    )
    assert database_calls == []


def test_guideline_lookup_preserves_database_patch_seam(monkeypatch):
    monkeypatch.setattr(stage_3, "_load_guideline_from_file", lambda _name: "")
    monkeypatch.setattr(
        stage_3,
        "get_article_type_by_name",
        lambda name: {"guideline": f"Database guideline for {name}."},
    )

    assert (
        stage_3.stage_3_retrieve_guideline("Review") == "Database guideline for Review."
    )


def test_coverage_analysis_parses_provider_response():
    llm = _FakeLlm(
        '{"coverage_sufficient": false, "analysis": "One gap.", '
        '"missing_sections": ["Costs"]}'
    )

    result = check_coverage(
        "Transcript",
        "Guideline",
        llm,
        load_general_guidelines=lambda: "\n\nGeneral guidance.",
    )

    assert result[:3] == (False, "One gap.", ["Costs"])
    assert "General guidance." in result[3]
    assert result[4] == llm.response


def test_legacy_stage_facade_orchestrates_extracted_concerns(monkeypatch):
    analysis_llm = object()
    composition_llm = object()
    requested_models: list[str] = []

    def fake_make_llm(model_name: str = "analysis-model"):
        requested_models.append(model_name)
        if model_name == stage_3.Y2B_COMPOSE_MODEL:
            return composition_llm
        return analysis_llm

    def fake_check(transcript, guideline, llm):
        assert llm is analysis_llm
        return (
            False,
            f"{transcript} lacks {guideline}",
            ["Context"],
            "coverage prompt",
            "coverage response",
        )

    def fake_gather(transcript, sections, article_type, llm, tone):
        assert transcript == "Clean transcript"
        assert sections == ["Context"]
        assert article_type == "Review"
        assert llm is analysis_llm
        return (
            "## Context\n\nSupplement.",
            f"supplement prompt: {tone}",
            "supplement response",
        )

    def fake_compose(
        transcript,
        supplement,
        guideline,
        article_type,
        title,
        llm,
        tone,
    ):
        assert transcript == "Clean transcript"
        assert supplement == "## Context\n\nSupplement."
        assert guideline == "Review guideline."
        assert article_type == "Review"
        assert title == "Original title"
        assert llm is composition_llm
        return (
            "# Final article",
            f"composition prompt: {tone}",
            "composition response",
        )

    monkeypatch.setattr(stage_3, "_stage3_llm", fake_make_llm)
    monkeypatch.setattr(
        stage_3,
        "_retrieve_guideline",
        lambda _article_type: "Review guideline.",
    )
    monkeypatch.setattr(
        stage_3,
        "_check_coverage",
        fake_check,
    )
    monkeypatch.setattr(
        stage_3,
        "_gather_missing_info",
        fake_gather,
    )
    monkeypatch.setattr(
        stage_3,
        "_compose_article",
        fake_compose,
    )

    output = stage_3.stage_3_compose_article(
        Stage1Output(
            video_id="video-1",
            title="Original title",
            cleaned_transcript="Clean transcript",
        ),
        Stage2Output(
            video_id="video-1",
            title="Original title",
            classification="Review",
            confidence=0.9,
            reasoning="Strong match.",
        ),
        tone_guidance="Keep it direct.",
    )

    assert requested_models == ["analysis-model", stage_3.Y2B_COMPOSE_MODEL]
    assert output.coverage_sufficient is False
    assert output.missing_sections == ["Context"]
    assert output.supplemental_content == "## Context\n\nSupplement."
    assert output.final_article == "# Final article"
    assert output.debug_composition_response == "composition response"
