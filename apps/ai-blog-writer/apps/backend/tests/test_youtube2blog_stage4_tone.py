"""Tone handling in Stage 4/5 title generation."""

from shared import Stage3Output

import app.features.youtube2blog.stages.stage_4 as stage_4_module


def _stage3() -> Stage3Output:
    return Stage3Output(
        video_id="v1",
        title="Original Title",
        article_type="News",
        coverage_sufficient=True,
        coverage_analysis="",
        missing_sections=[],
        supplemental_content=None,
        final_article="## Section\n\nArticle body.",
        guideline_used="guideline",
    )


class _StubLLM:
    def __init__(self):
        self.prompts: list[str] = []

    def invoke(self, prompt: str) -> str:
        self.prompts.append(prompt)
        return "A Perfectly Reasonable Generated Headline"


def _patch(monkeypatch) -> _StubLLM:
    llm = _StubLLM()
    monkeypatch.setattr(stage_4_module, "get_vertex_llm", lambda **_kwargs: llm)
    monkeypatch.setattr(
        stage_4_module,
        "_retrieve_title_guideline",
        lambda _article_type: "Keep titles under 90 characters.",
    )
    return llm


def test_title_prompt_carries_the_tone_subordinate_to_the_guideline(monkeypatch):
    llm = _patch(monkeypatch)

    stage_4_module.stage_4_generate_title(
        _stage3(),
        tone_guidance="Write in a dry, factual newswire voice.",
    )

    prompt = llm.prompts[0]
    assert "Write in a dry, factual newswire voice." in prompt
    # The guideline must stay the primary constraint; tone only fills the gaps.
    assert "The guideline\nremains the primary constraint" in prompt


def test_title_prompt_is_unchanged_when_no_tone_is_set(monkeypatch):
    llm = _patch(monkeypatch)

    stage_4_module.stage_4_generate_title(_stage3(), tone_guidance="   ")

    assert "## Voice" not in llm.prompts[0]


def test_title_retry_also_carries_the_tone(monkeypatch):
    llm = _patch(monkeypatch)

    stage_4_module.stage_5_generate_title_retry(
        _stage3(),
        feedback="Too vague.",
        tone_guidance="Write in a dry, factual newswire voice.",
    )

    prompt = llm.prompts[0]
    assert "Write in a dry, factual newswire voice." in prompt
    assert "Too vague." in prompt
