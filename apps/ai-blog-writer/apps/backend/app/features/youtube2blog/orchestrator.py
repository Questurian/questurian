"""
YouTube2Blog pipeline orchestrator.

Runs:
- Stage 1: Extract transcript + clean with AI
- Stage 2: Classify article type
- Stage 3: Compose article with coverage analysis
- Stage 4: Editorial augmentation
- Stage 5: Generate article title
"""
from __future__ import annotations

from datetime import datetime
import re
from typing import Dict, Optional
from uuid import uuid4

from shared import (
    PipelineArtifact,
    PipelineMeta,
    RawVideoRecord,
    Stage0Output,
    StageResult,
)

from app.config import PIPELINE_VERSION
from app.core import (
    read_stage_result,
    write_artifact,
    write_stage_result,
    write_status,
)
from .graph import run_youtube2blog_graph
from .stages import (
    stage_1_clean_transcript,
    stage_2_classify_article_type,
    stage_3_compose_article,
    stage_editorial_augmentation,
    stage_4_generate_title,
)
from .storage import read_article_type_names

FEATURE_NAME = "youtube2blog"


def _now() -> datetime:
    return datetime.utcnow()


def _stage_ref(run_id: str, stage: str) -> str:
    return f"data/runs/{run_id}/{stage}.json"


def _clean_title(title: str) -> str:
    cleaned = title.strip().strip("\"'")
    cleaned = cleaned.lstrip("#").strip()
    return cleaned


def _normalize_markdown_body(content: str) -> str:
    cleaned = content.strip()
    if not cleaned:
        return ""
    return re.sub(r"(?m)^\s*#\s+", "## ", cleaned).strip()


def _build_final_markdown(title: str, content: str) -> str:
    body = _normalize_markdown_body(content)
    cleaned_title = _clean_title(title)
    if cleaned_title:
        return f"# {cleaned_title}\n\n{body}".strip()
    return body


def initialize_run(
    record: RawVideoRecord,
    source: str,
    notes: Optional[str] = None,
) -> PipelineMeta:
    """Initialize a new pipeline run with Stage 0 (raw input)."""
    run_id = str(uuid4())
    meta = PipelineMeta(
        run_id=run_id,
        version=PIPELINE_VERSION,
        created_at=_now(),
        source=source,
        notes=notes,
    )
    stage0 = Stage0Output(meta=meta, record=record)
    stage_result = StageResult(
        run_id=run_id,
        stage="stage_0",
        created_at=_now(),
        input_refs={"source": source},
        data=stage0.model_dump(),
    )
    write_stage_result(run_id, "stage_0", stage_result.model_dump())
    write_status(
        run_id,
        {
            "run_id": run_id,
            "stage": "stage_0",
            "state": "pending",
            "updated_at": _now().isoformat(),
            "error": None,
        },
        feature=FEATURE_NAME,
    )
    return meta


def _process_run_stages(record: RawVideoRecord, meta: PipelineMeta) -> str:
    """
    Run the YouTube2Blog pipeline.

    Stage 1: Extract transcript and clean with AI
    Stage 2: Classify article type
    Stage 3: Compose article
    Stage 4: Editorial augmentation
    Stage 5: Generate title
    """
    run_id = meta.run_id
    stage_results: Dict[str, StageResult] = {}

    try:
        # ========================================
        # STAGE 1: Extract + Clean
        # ========================================
        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": "stage_1",
                "state": "running",
                "updated_at": _now().isoformat(),
                "error": None,
            },
            feature=FEATURE_NAME,
        )

        stage1 = stage_1_clean_transcript(record)
        result1 = StageResult(
            run_id=run_id,
            stage="stage_1",
            created_at=_now(),
            input_refs={"stage_0": _stage_ref(run_id, "stage_0")},
            data=stage1.model_dump(),
        )
        write_stage_result(run_id, "stage_1", result1.model_dump())
        stage_results["stage_1"] = result1

        # ========================================
        # STAGE 2: Article Type Classification
        # ========================================
        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": "stage_2",
                "state": "running",
                "updated_at": _now().isoformat(),
                "error": None,
            },
            feature=FEATURE_NAME,
        )

        allowed_types = read_article_type_names()
        stage2 = stage_2_classify_article_type(stage1, allowed_types)
        result2 = StageResult(
            run_id=run_id,
            stage="stage_2",
            created_at=_now(),
            input_refs={"stage_1": _stage_ref(run_id, "stage_1")},
            data=stage2.model_dump(),
        )
        write_stage_result(run_id, "stage_2", result2.model_dump())
        stage_results["stage_2"] = result2

        # ========================================
        # STAGE 3: Article Composition
        # ========================================
        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": "stage_3",
                "state": "running",
                "updated_at": _now().isoformat(),
                "error": None,
            },
            feature=FEATURE_NAME,
        )

        stage3 = stage_3_compose_article(stage1, stage2)
        result3 = StageResult(
            run_id=run_id,
            stage="stage_3",
            created_at=_now(),
            input_refs={
                "stage_1": _stage_ref(run_id, "stage_1"),
                "stage_2": _stage_ref(run_id, "stage_2"),
            },
            data=stage3.model_dump(),
        )
        write_stage_result(run_id, "stage_3", result3.model_dump())
        stage_results["stage_3"] = result3

        # ========================================
        # STAGE 4: Editorial Augmentation
        # ========================================
        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": "stage_editorial_augmentation",
                "state": "running",
                "updated_at": _now().isoformat(),
                "error": None,
            },
            feature=FEATURE_NAME,
        )

        stage_editorial = stage_editorial_augmentation(stage3)
        result_editorial = StageResult(
            run_id=run_id,
            stage="stage_editorial_augmentation",
            created_at=_now(),
            input_refs={"stage_3": _stage_ref(run_id, "stage_3")},
            data=stage_editorial.model_dump(),
        )
        write_stage_result(
            run_id,
            "stage_editorial_augmentation",
            result_editorial.model_dump(),
        )
        stage_results["stage_editorial_augmentation"] = result_editorial

        # ========================================
        # STAGE 5: Title Generation
        # ========================================
        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": "stage_4",
                "state": "running",
                "updated_at": _now().isoformat(),
                "error": None,
            },
            feature=FEATURE_NAME,
        )

        stage3_for_title = stage3.model_copy(
            update={"final_article": stage_editorial.augmented_content}
        )
        stage4 = stage_4_generate_title(stage3_for_title)
        result4 = StageResult(
            run_id=run_id,
            stage="stage_4",
            created_at=_now(),
            input_refs={
                "stage_3": _stage_ref(run_id, "stage_3"),
                "stage_editorial_augmentation": _stage_ref(
                    run_id,
                    "stage_editorial_augmentation",
                ),
            },
            data=stage4.model_dump(),
        )
        write_stage_result(run_id, "stage_4", result4.model_dump())
        stage_results["stage_4"] = result4

        # ========================================
        # Output: Save to SQLite
        # ========================================
        markdown = _build_final_markdown(stage4.title, stage3_for_title.final_article)

        stage_results["stage_0"] = StageResult(
            **read_stage_result(run_id, "stage_0")
        )
        artifact = PipelineArtifact(
            run_id=run_id,
            meta=meta,
            stages=stage_results,
            markdown_path=f"db:outputs:{run_id}",
        )
        artifact_dict = artifact.model_dump()
        artifact_dict["markdown"] = markdown
        write_artifact(run_id, artifact_dict)

        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": "complete",
                "state": "completed",
                "updated_at": _now().isoformat(),
                "error": None,
            },
            feature=FEATURE_NAME,
        )

        return markdown

    except Exception as exc:
        write_status(
            run_id,
            {
                "run_id": run_id,
                "stage": "error",
                "state": "failed",
                "updated_at": _now().isoformat(),
                "error": str(exc),
            },
            feature=FEATURE_NAME,
        )
        raise


def process_run(
    record: RawVideoRecord,
    meta: PipelineMeta,
    *,
    model_name: str | None = None,
    forced_article_type: str | None = None,
    tone_id: str | None = None,
    writing_model: str | None = None,
) -> str:
    """
    Run YouTube2Blog through LangGraph orchestration.
    """
    return run_youtube2blog_graph(
        record,
        meta,
        model_name=model_name,
        forced_article_type=forced_article_type,
        tone_id=tone_id,
        writing_model=writing_model,
    )
