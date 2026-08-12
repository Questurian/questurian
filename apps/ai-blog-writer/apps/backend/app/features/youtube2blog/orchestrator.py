"""YouTube2Blog run initialization and graph entrypoints."""

from __future__ import annotations

from shared import PipelineMeta, RawVideoRecord

from .dependencies import YouTube2BlogDependencies
from .graph import run_youtube2blog_graph
from .run_recorder import RunRecorder


def initialize_run(
    record: RawVideoRecord,
    source: str,
    notes: str | None = None,
    *,
    owner_staff_id: str | None = None,
    recorder: RunRecorder | None = None,
) -> PipelineMeta:
    """Initialize a new Run and persist Stage 0."""
    run_recorder = recorder or RunRecorder()
    if owner_staff_id is None:
        return run_recorder.initialize(record, source, notes)
    return run_recorder.initialize(record, source, notes, owner_staff_id=owner_staff_id)


def process_run(
    record: RawVideoRecord,
    meta: PipelineMeta,
    *,
    model_name: str | None = None,
    forced_article_type: str | None = None,
    tone_id: str | None = None,
    writing_model: str | None = None,
    dependencies: YouTube2BlogDependencies | None = None,
) -> str:
    """Run YouTube2Blog through LangGraph orchestration."""
    return run_youtube2blog_graph(
        record,
        meta,
        model_name=model_name,
        forced_article_type=forced_article_type,
        tone_id=tone_id,
        writing_model=writing_model,
        dependencies=dependencies,
    )
