from shared import RawVideoRecord

from app.features.youtube2blog.stages.stage_1 import stage_1_clean_transcript


def sample_record() -> RawVideoRecord:
    return RawVideoRecord(
        video_id="vid123",
        title="Test Video",
        description="Test description",
        video_url="https://youtube.com/watch?v=vid123",
        published_at="2024-01-01T00:00:00Z",
        transcript=(
            "HOST: Hello world.\nHOST: Hello world.\n[Music] Intro segment."
        ),
        transcript_status="completed",
        transcript_extracted_at="2024-01-01T00:00:00Z",
    )


def test_stage_1_clean_transcript_uses_ai_output(monkeypatch):
    captured_prompt = {"value": ""}

    class StubLLM:
        def invoke(self, prompt: str) -> str:
            captured_prompt["value"] = prompt
            return "  Cleaned transcript output.  "

    class StubPresets:
        @staticmethod
        def transcript_cleaning() -> StubLLM:
            return StubLLM()

    monkeypatch.setattr(
        "app.features.youtube2blog.stages.stage_1.LLMPresets", StubPresets
    )

    record = sample_record()
    output = stage_1_clean_transcript(record)

    assert output.cleaned_transcript == "Cleaned transcript output."
    assert output.video_id == record.video_id
    assert output.title == record.title
    assert record.transcript in captured_prompt["value"]
