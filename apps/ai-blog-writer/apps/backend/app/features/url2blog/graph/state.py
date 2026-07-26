"""State exchanged by URL2Blog graph nodes."""

from typing import Any, TypedDict


class Url2BlogGraphState(TypedDict, total=False):
    run_id: str
    selected_model_name: str
    execution_profile: str
    include_debug: bool
    stage_trace: list[dict[str, Any]]
    json_parse_metrics: dict[str, Any]
    stage1_payload: dict[str, Any]
    normalized_title: str
    normalized_content: str
    normalized_language: str
    source_word_count: int
    min_expanded_word_target: int
    stage2_payload: dict[str, Any]
    pipeline_context: dict[str, Any]
    rewrite_quality_retry_count: int
    fact_retry_count: int
    completed: bool
