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


def test_stage_1_clean_transcript_uses_ai_output(monkeypatch):
    captured_prompt = {"value": ""}

    class StubLLM:
        def invoke(self, prompt: str) -> str:
            captured_prompt["value"] = prompt
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
    assert record.transcript in captured_prompt["value"]


def test_stage_1_clean_transcript_chunks_long_inputs(monkeypatch):
    prompts: list[str] = []

    class StubLLM:
        def invoke(self, prompt: str) -> str:
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
