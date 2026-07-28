from shared import RawVideoRecord

import app.features.youtube2blog.stages.stage_1 as stage_1_module
from app.features.youtube2blog.stages.stage_1 import stage_1_clean_transcript


def sample_record() -> RawVideoRecord:
    return RawVideoRecord(
        video_id="vid123",
        title="Test Video",
        description="Test description",
        video_url="https://youtube.com/watch?v=vid123",
        published_at="2024-01-01T00:00:00Z",
        transcript=("HOST: Hello world.\nHOST: Hello world.\n[Music] Intro segment."),
        transcript_status="completed",
        transcript_extracted_at="2024-01-01T00:00:00Z",
    )


_ENFORCEMENT_MARKER = "If the following text is already in English"


def _is_translation_enforcement(prompt: str) -> bool:
    """Stage 1 runs an idempotent English pass over the cleaned transcript and
    the title. Those calls reuse the same LLM, so stubs must tell them apart
    from cleaning calls or the canned cleaning output leaks into the title."""
    return prompt.startswith(_ENFORCEMENT_MARKER)


def _enforcement_input_text(prompt: str) -> str:
    """Echo back what the enforcement pass was handed, matching its contract:
    already-English text is returned exactly as-is."""
    return prompt.split("Text:\n", 1)[1]


def test_stage_1_clean_transcript_uses_ai_output(monkeypatch):
    cleaning_prompts: list[str] = []

    class StubLLM:
        def invoke(self, prompt: str) -> str:
            if _is_translation_enforcement(prompt):
                return _enforcement_input_text(prompt)
            cleaning_prompts.append(prompt)
            return "  Cleaned transcript output.  "

    monkeypatch.setattr(
        stage_1_module,
        "get_vertex_llm",
        lambda **_kwargs: StubLLM(),
    )

    record = sample_record()
    output = stage_1_clean_transcript(record)

    assert output.cleaned_transcript == "Cleaned transcript output."
    assert output.video_id == record.video_id
    assert output.title == record.title
    assert len(cleaning_prompts) == 1
    assert record.transcript in cleaning_prompts[0]


def test_stage_1_clean_transcript_chunks_long_inputs(monkeypatch):
    prompts: list[str] = []

    class StubLLM:
        def invoke(self, prompt: str) -> str:
            if _is_translation_enforcement(prompt):
                return _enforcement_input_text(prompt)
            prompts.append(prompt)
            return f"Cleaned chunk {len(prompts)}"

    monkeypatch.setattr(
        stage_1_module,
        "get_vertex_llm",
        lambda **_kwargs: StubLLM(),
    )

    long_transcript = "\n".join(
        f"Section {index}: " + ("useful transcript detail " * 20)
        for index in range(240)
    )
    record = RawVideoRecord(
        video_id="vid-long",
        title="Long Test Video",
        description="",
        video_url="https://youtube.com/watch?v=vid-long",
        published_at="2024-01-01T00:00:00Z",
        transcript=long_transcript,
        transcript_status="completed",
        transcript_extracted_at="2024-01-01T00:00:00Z",
    )

    output = stage_1_clean_transcript(record)

    assert len(prompts) > 1
    assert "chunk 1 of" in prompts[0].lower()
    assert output.cleaned_transcript == "\n\n".join(
        f"Cleaned chunk {index}" for index in range(1, len(prompts) + 1)
    )


def test_stage_1_skips_english_enforcement_for_latin_output(monkeypatch):
    """The cleaning prompts already order a translation, so re-sending a clean
    English transcript through the model is a full output-token bill for a
    byte-identical copy."""
    enforcement_prompts: list[str] = []

    class StubLLM:
        def invoke(self, prompt: str) -> str:
            if _is_translation_enforcement(prompt):
                enforcement_prompts.append(prompt)
                return _enforcement_input_text(prompt)
            return "Cleaned transcript output."

    monkeypatch.setattr(
        stage_1_module,
        "get_vertex_llm",
        lambda **_kwargs: StubLLM(),
    )

    output = stage_1_clean_transcript(sample_record())

    assert enforcement_prompts == []
    assert output.cleaned_transcript == "Cleaned transcript output."


def test_stage_1_enforces_english_when_translation_did_not_happen(monkeypatch):
    """A cleaning pass that ignored the translation instruction leaves non-Latin
    script behind, which is the one case worth paying the extra pass for."""
    enforced: list[str] = []

    class StubLLM:
        def invoke(self, prompt: str) -> str:
            if _is_translation_enforcement(prompt):
                enforced.append(_enforcement_input_text(prompt))
                return "Translated to English."
            return "これは翻訳されていない書き起こしです。" * 5

    monkeypatch.setattr(
        stage_1_module,
        "get_vertex_llm",
        lambda **_kwargs: StubLLM(),
    )

    record = sample_record()
    output = stage_1_clean_transcript(record)

    assert len(enforced) == 1
    assert output.cleaned_transcript == "Translated to English."


def test_stage_1_translates_non_latin_titles_only(monkeypatch):
    """An English title needs no round trip; a Japanese one still does."""

    class StubLLM:
        def invoke(self, prompt: str) -> str:
            if _is_translation_enforcement(prompt):
                return "Translated Title"
            return "Cleaned transcript output."

    monkeypatch.setattr(
        stage_1_module,
        "get_vertex_llm",
        lambda **_kwargs: StubLLM(),
    )

    ascii_title = stage_1_clean_transcript(sample_record())
    assert ascii_title.title == "Test Video"

    record = sample_record()
    japanese = record.model_copy(update={"title": "日本語のタイトル"})
    assert stage_1_clean_transcript(japanese).title == "Translated Title"


def test_needs_english_enforcement_ignores_incidental_foreign_terms():
    """One quoted term in an English article must not buy a re-translation."""
    english_with_loanword = (
        "The restaurant is called 東京 and serves a tasting menu. " * 20
    )

    assert not stage_1_module._needs_english_enforcement(english_with_loanword)
    assert stage_1_module._needs_english_enforcement("東京の美味しいレストランの話")
