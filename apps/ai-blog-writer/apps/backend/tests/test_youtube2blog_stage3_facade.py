from app.features.youtube2blog.stages import stage_3
from app.features.youtube2blog.stages.stage_3_coverage import check_coverage


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
