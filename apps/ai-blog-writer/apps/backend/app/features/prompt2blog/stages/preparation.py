from __future__ import annotations

from typing import Any

from ..config import DEFAULT_MODEL, PROMPT2BLOG_CLEANUP_MODE
from ..dependencies import PipelineDependencies
from ..models import PipelineV2RuntimeRequest, Prompt2BlogInputRequest
from ..prompts.preparation import SYNTHESIZE_PROMPT
from ..support import _clean_string_list, _safe_int, _safe_str
from .cleanup import cleanup_source


def prepare_full_pipeline_request(
    run_id: str,
    request: Prompt2BlogInputRequest,
    dependencies: PipelineDependencies,
) -> PipelineV2RuntimeRequest:
    """Validate, clean and synthesize structured input for the generation graph."""
    model_name = request.model_name or DEFAULT_MODEL
    recorder = dependencies.recorder

    current_stage = "stage_input_validate"
    recorder.start_stage(run_id, current_stage)

    if request.article_type_id <= 0:
        raise RuntimeError("article_type_id is required")

    source_material = _clean_string_list(request.source_material)
    if not source_material:
        raise RuntimeError("At least one source_material item is required.")

    required_text_fields = {
        "article_goal": request.article_goal,
        "target_reader": request.target_reader,
        "destination_context": request.destination_context,
        "tone_id": request.tone_id,
        "length_id": request.length_id,
    }
    for field_name, value in required_text_fields.items():
        if not _safe_str(value):
            raise RuntimeError(f"{field_name} is required")

    option_context = dependencies.resolve_input_options(request)
    recorder.record_stage(
        run_id,
        current_stage,
        {
            "article_type_id": request.article_type_id,
            "source_material_count": len(source_material),
            "tone_id": _safe_str(option_context["tone"].get("id")),
            "length_id": _safe_str(option_context["length"].get("id")),
            "brand_voice_id": _safe_str(option_context["brand_voice"].get("id")),
            "creativity_level": option_context["creativity_level"],
        },
    )

    current_stage = "stage_input_cleanup"
    recorder.start_stage(run_id, current_stage)

    cleanup_sources: list[dict[str, Any]] = []
    cleaned_sources: list[str] = []
    for source_index, source in enumerate(source_material, start=1):
        cleaned_source = cleanup_source(
            raw_text=source,
            source_index=source_index,
            model_name=model_name,
            llm=dependencies.llm,
        )
        cleanup_sources.append(cleaned_source)
        cleaned_text = _safe_str(cleaned_source.get("cleaned_text"))
        if cleaned_text:
            cleaned_sources.append(cleaned_text)

    if not cleaned_sources:
        raise RuntimeError("All source_material entries were empty after cleanup.")

    cleanup_stats = [
        {
            "input_chars": _safe_int(source.get("input_chars"), default=0),
            "output_chars": _safe_int(source.get("cleaned_chars"), default=0),
            "removed_lines": len(source.get("removed_blocks") or []),
        }
        for source in cleanup_sources
    ]
    recorder.record_stage(
        run_id,
        current_stage,
        {
            "cleanup_mode": PROMPT2BLOG_CLEANUP_MODE,
            "model_name": model_name,
            "source_material_count": len(source_material),
            "cleaned_sources_count": len(cleaned_sources),
            "sources": cleanup_sources,
            "cleanup_stats": cleanup_stats,
            "cleaned_sources": cleaned_sources,
        },
    )

    current_stage = "stage_synthesize_sources"
    recorder.start_stage(run_id, current_stage)

    synthesized_text = dependencies.llm.invoke_text(
        prompt=SYNTHESIZE_PROMPT + "\n\n---\n\n".join(cleaned_sources),
        max_tokens=8192,
        temperature=0.3,
        model_name=model_name,
    ).strip()
    if not synthesized_text:
        raise RuntimeError("Synthesis produced empty output.")

    recorder.record_stage(
        run_id,
        current_stage,
        {
            "source_material_count": len(cleaned_sources),
            "synthesized_text": synthesized_text,
        },
    )

    writing_brief = dependencies.build_writing_brief(
        request,
        option_context=option_context,
        cleaned_sources=cleaned_sources,
    )
    return PipelineV2RuntimeRequest(
        cleaned_data=synthesized_text,
        raw_sources=cleaned_sources,
        writing_brief=writing_brief,
        article_type_id=request.article_type_id,
        option_context=option_context,
        include_debug=request.include_debug,
        enable_editorial_augmentation=request.enable_editorial_augmentation,
        model_name=model_name,
        writing_model=request.writing_model,
        audit_model=request.audit_model,
        model_stack_id=request.model_stack_id,
    )
