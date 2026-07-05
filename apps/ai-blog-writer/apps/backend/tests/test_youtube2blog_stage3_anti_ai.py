from app.features.youtube2blog.stages import stage_3
from app.features.youtube2blog.config import Y2B_STAGE3_MAX_OUTPUT_TOKENS


class _FakeLlm:
    def __init__(self, responses: list[str]):
        self.responses = responses
        self.prompts: list[str] = []

    def invoke(self, prompt: str) -> str:
        self.prompts.append(prompt)
        return self.responses.pop(0)


def test_compose_article_retries_anti_ai_validation_error(monkeypatch):
    monkeypatch.setattr(stage_3, "_load_general_guidelines", lambda: "")
    llm = _FakeLlm(
        [
            "# Title\n\nThe room is small — barely six tables.",
            "# Title\n\nThe room has six tables.",
        ]
    )

    article, prompt, raw = stage_3._compose_article(
        transcript="A small room with six tables.",
        supplemental=None,
        guideline="Use markdown.",
        article_type="Review",
        title="Title",
        llm=llm,
    )

    assert article == "# Title\n\nThe room has six tables."
    assert "em dash" in llm.prompts[1]
    assert "VOICE RULES" in prompt
    assert raw == "# Title\n\nThe room is small — barely six tables."


def test_supplement_prompt_uses_non_conflicting_wording(monkeypatch):
    monkeypatch.setattr(stage_3, "_load_general_guidelines", lambda: "")
    llm = _FakeLlm(["## Context\n\nGeneral context."])

    _, prompt, _ = stage_3._gather_missing_info(
        transcript="Source mentions ceviche.",
        missing_sections=["Background"],
        article_type="Guide",
        llm=llm,
    )

    assert "do not copy transcript filler" in prompt
    assert "avoid stock transition phrases" in prompt
    assert "cannot invent unsupported specifics" in prompt


def test_stage3_llm_uses_longform_output_cap(monkeypatch):
    captured: dict[str, object] = {}

    class StubLLM:
        pass

    def fake_get_vertex_llm(**kwargs):
        captured.update(kwargs)
        return StubLLM()

    monkeypatch.setattr(stage_3, "get_vertex_llm", fake_get_vertex_llm)

    assert isinstance(stage_3._stage3_llm("writer-model"), StubLLM)
    assert captured["model_name"] == "writer-model"
    assert captured["max_tokens"] == Y2B_STAGE3_MAX_OUTPUT_TOKENS
