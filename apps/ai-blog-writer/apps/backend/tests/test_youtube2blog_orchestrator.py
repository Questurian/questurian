from datetime import datetime, timezone

from shared import (
    PipelineMeta,
    RawVideoRecord,
    Stage1Output,
    Stage2Output,
    Stage3Output,
    Stage4Output,
    StageEditorialAugmentationOutput,
)

import app.features.youtube2blog.orchestrator as y2b_orchestrator


def _sample_record() -> RawVideoRecord:
    now = datetime.now(timezone.utc).isoformat()
    return RawVideoRecord(
        video_id="abc123DEF45",
        title="Sample Video",
        description="",
        video_url="https://www.youtube.com/watch?v=abc123DEF45",
        published_at=now,
        transcript="Sample transcript",
        transcript_status="completed",
        transcript_extracted_at=now,
    )


def _sample_meta() -> PipelineMeta:
    return PipelineMeta(
        run_id="run-123",
        version="test",
        created_at=datetime.now(timezone.utc),
        source="youtube-url",
        notes="test run",
    )


def test_process_run_writes_editorial_stage_and_final_markdown(monkeypatch):
    captured_stage_writes: dict[str, dict] = {}
    captured_status: list[dict] = []
    captured_artifact: dict[str, object] = {}
    captured_stage4_input: dict[str, Stage3Output] = {}

    monkeypatch.setattr(y2b_orchestrator, "read_article_type_names", lambda: ["How-to Guides"])

    monkeypatch.setattr(
        y2b_orchestrator,
        "stage_1_clean_transcript",
        lambda _record: Stage1Output(
            video_id="abc123DEF45",
            title="Sample Video",
            cleaned_transcript="Clean transcript",
        ),
    )
    monkeypatch.setattr(
        y2b_orchestrator,
        "stage_2_classify_article_type",
        lambda _stage1, _allowed_types: Stage2Output(
            video_id="abc123DEF45",
            title="Sample Video",
            classification="How-to Guides",
            confidence=0.95,
            reasoning="Clear how-to intent.",
        ),
    )
    monkeypatch.setattr(
        y2b_orchestrator,
        "stage_3_compose_article",
        lambda _stage1, _stage2: Stage3Output(
            video_id="abc123DEF45",
            title="Sample Video",
            article_type="How-to Guides",
            coverage_sufficient=True,
            coverage_analysis="Coverage sufficient",
            missing_sections=[],
            supplemental_content=None,
            final_article="# Original Draft\n\nOriginal article content.",
            guideline_used="Use headings",
        ),
    )
    monkeypatch.setattr(
        y2b_orchestrator,
        "stage_editorial_augmentation",
        lambda _stage3: StageEditorialAugmentationOutput(
            video_id="abc123DEF45",
            title="Sample Video",
            article_type="How-to Guides",
            augmented_content="# Editorial Draft\n\nImproved article content.",
            components_added=[
                {
                    "component": "key_takeaways_box",
                    "justification": "Improves skimmability.",
                    "placement": "After core sections.",
                }
            ],
            diagnostic={
                "cognitive_load": "weak",
                "narrative_density": "strong",
                "emphasis_clarity": "strong",
                "reading_behavior_risk": "weak",
            },
            augmentation_summary="Added key takeaways block.",
            augmentation_applied=True,
            debug_prompt="prompt",
            debug_raw_response="raw",
            error=None,
        ),
    )

    def fake_stage_4_generate_title(stage3: Stage3Output) -> Stage4Output:
        captured_stage4_input["value"] = stage3
        return Stage4Output(
            video_id=stage3.video_id,
            title="Final Generated Title",
            content=stage3.final_article,
            article_type=stage3.article_type,
            title_guideline_used="Guideline",
        )

    monkeypatch.setattr(y2b_orchestrator, "stage_4_generate_title", fake_stage_4_generate_title)

    def fake_write_status(run_id: str, payload: dict, feature: str = "youtube2blog"):
        del run_id, feature
        captured_status.append(payload)

    def fake_write_stage_result(run_id: str, stage: str, payload: dict):
        del run_id
        captured_stage_writes[stage] = payload

    def fake_write_artifact(run_id: str, payload: dict):
        del run_id
        captured_artifact["payload"] = payload
        return "db:outputs:run-123"

    def fake_read_stage_result(run_id: str, stage: str):
        del run_id
        if stage != "stage_0":
            return None
        return {
            "run_id": "run-123",
            "stage": "stage_0",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "input_refs": {"source": "youtube-url"},
            "data": {"record": {"video_id": "abc123DEF45"}},
        }

    monkeypatch.setattr(y2b_orchestrator, "write_status", fake_write_status)
    monkeypatch.setattr(y2b_orchestrator, "write_stage_result", fake_write_stage_result)
    monkeypatch.setattr(y2b_orchestrator, "write_artifact", fake_write_artifact)
    monkeypatch.setattr(y2b_orchestrator, "read_stage_result", fake_read_stage_result)
    monkeypatch.setattr(
        y2b_orchestrator,
        "run_youtube2blog_graph",
        lambda record, meta: y2b_orchestrator._process_run_stages(record, meta),
    )

    markdown = y2b_orchestrator.process_run(_sample_record(), _sample_meta())

    assert "stage_editorial_augmentation" in captured_stage_writes
    assert any(item.get("stage") == "stage_editorial_augmentation" for item in captured_status)

    stage4_input = captured_stage4_input["value"]
    assert stage4_input.final_article == "# Editorial Draft\n\nImproved article content."

    assert markdown.startswith("# Final Generated Title")
    assert "## Editorial Draft" in markdown
    assert "Improved article content." in markdown

    artifact_payload = captured_artifact["payload"]
    assert isinstance(artifact_payload, dict)
    assert artifact_payload["markdown"] == markdown
    assert "stage_editorial_augmentation" in artifact_payload["stages"]


def test_process_run_uses_langgraph_runner(monkeypatch):
    record = _sample_record()
    meta = _sample_meta()
    captured: dict[str, object] = {}

    def _fake_graph_runner(record_arg, meta_arg):
        captured["record"] = record_arg
        captured["meta"] = meta_arg
        return "# Graph Markdown"

    monkeypatch.setattr(y2b_orchestrator, "run_youtube2blog_graph", _fake_graph_runner)

    markdown = y2b_orchestrator.process_run(record, meta)

    assert markdown == "# Graph Markdown"
    assert captured["record"] is record
    assert captured["meta"] is meta
