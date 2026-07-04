"""URL2Blog LangGraph runner with explicit staged nodes and gate policies."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any, TypedDict
from uuid import uuid4

from fastapi.responses import JSONResponse

from app.ai_graph.runtime import (
    finalize_langsmith_trace,
    langgraph_checkpoint_async,
    langgraph_trace,
    langsmith_trace_payload,
)
from app.core import read_status, write_stage_result, write_status

logger = logging.getLogger(__name__)

URL2BLOG_REWRITE_GATE_MIN_SCORE = 8.0
URL2BLOG_REWRITE_GATE_NEAR_PASS_MARGIN = 0.5
URL2BLOG_REWRITE_GATE_MAX_NGRAM = 0.88
URL2BLOG_REWRITE_GATE_MAX_RETRIES = 2
URL2BLOG_REWRITE_GATE_FALLBACK_MIN_SCORE = 6.0
URL2BLOG_REWRITE_GATE_FALLBACK_MAX_REQUIRED_REVISIONS = 3

URL2BLOG_FACT_GATE_MIN_SCORE = 8.0
URL2BLOG_FACT_GATE_NEAR_PASS_MARGIN = 0.5
URL2BLOG_FACT_GATE_MAX_RETRIES = 1

URL2BLOG_EDITORIAL_MIN_WORD_RETENTION_RATIO = 0.85
RUN_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


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


def _attach_trace_payload(
    response: JSONResponse,
    trace_payload: dict[str, str],
) -> tuple[JSONResponse, str | None]:
    if not trace_payload:
        return response, None

    try:
        decoded = response.body.decode("utf-8")
        payload = json.loads(decoded)
    except Exception:  # noqa: BLE001
        return response, None

    if not isinstance(payload, dict):
        return response, None

    payload.update({k: v for k, v in trace_payload.items() if v})
    run_id_value = payload.get("run_id")
    run_id = run_id_value if isinstance(run_id_value, str) and run_id_value else None
    safe_headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower() not in {"content-length", "transfer-encoding"}
    }

    return (
        JSONResponse(
            payload,
            status_code=response.status_code,
            headers=safe_headers,
            media_type=response.media_type,
            background=response.background,
        ),
        run_id,
    )


def _write_graph_stage_result(*, run_id: str, stage: str, data: dict[str, Any]) -> None:
    write_stage_result(
        run_id,
        stage,
        {
            "created_at": datetime.utcnow().isoformat(),
            "data": data,
        },
    )


def _persist_pipeline_trace(
    *, run_id: str, stage_trace: list[dict[str, Any]]
) -> None:
    """Persist the LLM input/output trace so failed runs keep a full autopsy."""
    if not stage_trace:
        return
    try:
        _write_graph_stage_result(
            run_id=run_id,
            stage="pipeline_trace",
            data={"trace": stage_trace},
        )
    except Exception:  # noqa: BLE001
        logger.exception("Failed persisting URL2Blog pipeline trace")


def _resolve_run_id(request: Any) -> str:
    requested_run_id = getattr(request, "run_id", None)
    if not isinstance(requested_run_id, str):
        return str(uuid4())

    candidate = requested_run_id.strip()
    if not candidate:
        return str(uuid4())

    if RUN_ID_PATTERN.match(candidate):
        return candidate

    logger.warning(
        "URL2Blog pipeline received invalid run_id override; using generated run_id",
        extra={"requested_run_id": requested_run_id},
    )
    return str(uuid4())


def _write_failed_status(*, run_id: str, error: Exception) -> None:
    stage = "pipeline_v2"
    try:
        current_status = read_status(run_id)
        if isinstance(current_status, dict):
            current_stage = current_status.get("stage")
            if isinstance(current_stage, str) and current_stage.strip():
                stage = current_stage.strip()
    except Exception:  # noqa: BLE001
        logger.exception("Failed reading URL2Blog status before marking failure")

    error_text = str(error).strip() or error.__class__.__name__
    if len(error_text) > 1500:
        error_text = f"{error_text[:1497]}..."

    try:
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "failed",
                "stage": stage,
                "error": error_text,
                "updated_at": datetime.utcnow().isoformat(),
            },
            feature="url2blog",
        )
    except Exception:  # noqa: BLE001
        logger.exception("Failed marking URL2Blog run as failed")


def _evaluate_rewrite_gate(
    *,
    context: dict[str, Any],
    retry_count: int,
) -> tuple[str, dict[str, Any]]:
    quality = dict(context.get("quality") or {})
    required_revisions = quality.get("required_revisions")
    required_revision_count = (
        len(required_revisions) if isinstance(required_revisions, list) else 0
    )
    overall_score = float(quality.get("overall_score") or 0.0)
    too_close_to_source = bool(quality.get("too_close_to_source"))
    ngram_overlap = float(context.get("ngram_overlap") or 0.0)

    strict_pass = (
        overall_score >= URL2BLOG_REWRITE_GATE_MIN_SCORE
        and not too_close_to_source
        and ngram_overlap <= URL2BLOG_REWRITE_GATE_MAX_NGRAM
        and required_revision_count == 0
    )
    near_pass = (
        overall_score
        >= (URL2BLOG_REWRITE_GATE_MIN_SCORE - URL2BLOG_REWRITE_GATE_NEAR_PASS_MARGIN)
        and not too_close_to_source
        and ngram_overlap <= (URL2BLOG_REWRITE_GATE_MAX_NGRAM + 0.03)
    )
    fallback_pass = (
        retry_count >= URL2BLOG_REWRITE_GATE_MAX_RETRIES
        and overall_score >= URL2BLOG_REWRITE_GATE_FALLBACK_MIN_SCORE
        and required_revision_count
        <= URL2BLOG_REWRITE_GATE_FALLBACK_MAX_REQUIRED_REVISIONS
        and not too_close_to_source
        and ngram_overlap <= (URL2BLOG_REWRITE_GATE_MAX_NGRAM + 0.08)
    )

    if strict_pass:
        decision = "pass"
        pass_mode = "strict"
    elif retry_count < URL2BLOG_REWRITE_GATE_MAX_RETRIES:
        decision = "retry"
        pass_mode = "retry_required"
    elif near_pass:
        decision = "pass"
        pass_mode = "near_pass"
    elif fallback_pass:
        decision = "pass"
        pass_mode = "fallback_after_failed_gate"
    else:
        decision = "fail"
        pass_mode = "failed_after_retries"

    gate_data = {
        "decision": decision,
        "pass_mode": pass_mode,
        "retry_count": retry_count,
        "max_retries": URL2BLOG_REWRITE_GATE_MAX_RETRIES,
        "overall_score": overall_score,
        "score_threshold": URL2BLOG_REWRITE_GATE_MIN_SCORE,
        "near_pass_margin": URL2BLOG_REWRITE_GATE_NEAR_PASS_MARGIN,
        "fallback_min_score": URL2BLOG_REWRITE_GATE_FALLBACK_MIN_SCORE,
        "fallback_max_required_revisions": (
            URL2BLOG_REWRITE_GATE_FALLBACK_MAX_REQUIRED_REVISIONS
        ),
        "ngram_overlap": round(ngram_overlap, 3),
        "max_ngram_overlap": URL2BLOG_REWRITE_GATE_MAX_NGRAM,
        "required_revision_count": required_revision_count,
        "too_close_to_source": too_close_to_source,
    }
    if decision == "fail":
        gate_data["failure_reason"] = (
            "URL2Blog rewrite quality gate failed after retries; "
            f"score={overall_score:.2f}, "
            f"threshold={URL2BLOG_REWRITE_GATE_MIN_SCORE:.2f}, "
            f"ngram_overlap={ngram_overlap:.3f}, "
            f"required_revisions={required_revision_count}, "
            f"too_close_to_source={too_close_to_source}"
        )
    logger.debug(
        "URL2Blog rewrite gate decision=%s retry_count=%d score=%.2f ngram=%.3f",
        decision,
        retry_count,
        overall_score,
        ngram_overlap,
    )
    return decision, gate_data


def _evaluate_fact_gate(
    *,
    context: dict[str, Any],
    retry_count: int,
) -> tuple[str, dict[str, Any]]:
    fact_coverage = dict(context.get("fact_coverage") or {})
    coverage_score = float(fact_coverage.get("coverage_score") or 0.0)
    missing_high_count = int(fact_coverage.get("missing_high_count") or 0)
    missing_count = int(fact_coverage.get("missing_count") or 0)

    strict_pass = (
        coverage_score >= URL2BLOG_FACT_GATE_MIN_SCORE and missing_high_count == 0
    )
    near_pass = (
        coverage_score >= (URL2BLOG_FACT_GATE_MIN_SCORE - URL2BLOG_FACT_GATE_NEAR_PASS_MARGIN)
        and missing_high_count == 0
    )

    if strict_pass:
        decision = "pass"
        pass_mode = "strict"
    elif retry_count < URL2BLOG_FACT_GATE_MAX_RETRIES:
        decision = "retry"
        pass_mode = "retry_required"
    elif near_pass:
        decision = "pass"
        pass_mode = "near_pass"
    else:
        # Soft-fail: retries are exhausted but the draft is complete. Ship it
        # with an unverified-facts warning instead of discarding the run.
        decision = "pass"
        pass_mode = "fallback_unverified_facts"

    gate_data = {
        "decision": decision,
        "pass_mode": pass_mode,
        "retry_count": retry_count,
        "max_retries": URL2BLOG_FACT_GATE_MAX_RETRIES,
        "coverage_score": coverage_score,
        "coverage_threshold": URL2BLOG_FACT_GATE_MIN_SCORE,
        "near_pass_margin": URL2BLOG_FACT_GATE_NEAR_PASS_MARGIN,
        "missing_high_count": missing_high_count,
        "missing_count": missing_count,
    }
    if pass_mode == "fallback_unverified_facts":
        gate_data["fact_warning"] = (
            "Fact coverage could not be fully verified after retries; "
            f"coverage_score={coverage_score:.2f}, "
            f"threshold={URL2BLOG_FACT_GATE_MIN_SCORE:.2f}, "
            f"missing_high_count={missing_high_count}, "
            f"missing_count={missing_count}"
        )
        gate_data["missing_facts"] = list(fact_coverage.get("missing_facts") or [])
        gate_data["coverage_summary"] = str(fact_coverage.get("coverage_summary") or "")
    logger.debug(
        "URL2Blog fact gate decision=%s retry_count=%d score=%.2f missing_high=%d",
        decision,
        retry_count,
        coverage_score,
        missing_high_count,
    )
    return decision, gate_data


def _evaluate_editorial_gate(*, context: dict[str, Any]) -> dict[str, Any]:
    pre_word_count = int(context.get("pre_editorial_word_count") or 0)
    post_word_count = int(context.get("post_editorial_word_count") or 0)
    editorial_data = dict(context.get("editorial_augmentation") or {})
    augmentation_applied = bool(editorial_data.get("augmentation_applied"))

    if not augmentation_applied:
        decision = "pass"
        reason = "editorial_augmentation_not_applied"
    else:
        min_retained_words = max(
            1,
            int(round(pre_word_count * URL2BLOG_EDITORIAL_MIN_WORD_RETENTION_RATIO)),
        )
        if post_word_count < min_retained_words:
            decision = "rollback"
            reason = (
                "editorial_output_shrank_too_much "
                f"({post_word_count} < {min_retained_words})"
            )
        else:
            decision = "pass"
            reason = "editorial_quality_preserved"

    gate_data = {
        "decision": decision,
        "reason": reason,
        "augmentation_applied": augmentation_applied,
        "pre_editorial_word_count": pre_word_count,
        "post_editorial_word_count": post_word_count,
        "min_word_retention_ratio": URL2BLOG_EDITORIAL_MIN_WORD_RETENTION_RATIO,
    }
    logger.debug(
        "URL2Blog editorial gate decision=%s pre_words=%d post_words=%d",
        decision,
        pre_word_count,
        post_word_count,
    )
    return gate_data


def _apply_editorial_rollback(
    *,
    context: dict[str, Any],
    url2blog_routes: Any,
) -> tuple[dict[str, Any], dict[str, Any]]:
    pre_editorial_content = str(context.get("pre_editorial_content") or "")
    restored_word_count = len(url2blog_routes._tokenize_similarity_words(pre_editorial_content))

    if pre_editorial_content:
        context["final_improved_content"] = pre_editorial_content
        context["post_editorial_word_count"] = restored_word_count

        editorial_data = dict(context.get("editorial_augmentation") or {})
        existing_summary = str(editorial_data.get("augmentation_summary") or "").strip()
        editorial_data.update(
            {
                "augmentation_applied": False,
                "components_added": [],
                "augmentation_summary": (
                    f"{existing_summary} Rolled back by editorial gate."
                ).strip(),
            }
        )
        context["editorial_augmentation"] = editorial_data

    rollback_data = {
        "restored_from": "pre_editorial_content",
        "restored_word_count": restored_word_count,
        "had_pre_editorial_content": bool(pre_editorial_content),
    }
    return context, rollback_data


async def run_url2blog_pipeline_graph(
    *,
    request: Any,
) -> JSONResponse:
    from langgraph.graph import END, START, StateGraph

    from app.features.url2blog import routes as url2blog_routes

    run_id = _resolve_run_id(request)
    selected_model_name = url2blog_routes._resolve_url2blog_model(
        getattr(request, "model_name", None)
    )
    execution_profile = url2blog_routes._resolve_execution_profile(
        getattr(request, "execution_profile", None)
    )
    include_debug = bool(getattr(request, "include_debug", False))
    json_parse_metrics: dict[str, Any] = {
        "total_parse_failures": 0,
        "recovered_calls": 0,
        "recovered_parse_failures": 0,
        "failures_by_stage": {},
    }

    # Seed status immediately so frontend polling never races a missing run row.
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": "queued",
            "error": None,
            "updated_at": datetime.utcnow().isoformat(),
        },
        feature="url2blog",
    )

    response_holder: dict[str, JSONResponse | None] = {"response": None}

    async def stage_1_node(state: Url2BlogGraphState) -> Url2BlogGraphState:
        stage1_result = await url2blog_routes._pipeline_v2_run_stage1(
            request=request,
            run_id=state["run_id"],
            selected_model_name=state["selected_model_name"],
            include_debug=state["include_debug"],
            stage_trace=list(state.get("stage_trace") or []),
        )
        _persist_pipeline_trace(
            run_id=state["run_id"],
            stage_trace=list(stage1_result.get("trace") or []),
        )
        return {
            "stage1_payload": dict(stage1_result.get("stage1_payload") or {}),
            "stage_trace": list(stage1_result.get("trace") or []),
            "normalized_title": str(stage1_result.get("normalized_title") or ""),
            "normalized_content": str(stage1_result.get("normalized_content") or ""),
            "normalized_language": str(
                stage1_result.get("normalized_language") or "English"
            ),
            "source_word_count": int(stage1_result.get("source_word_count") or 0),
            "min_expanded_word_target": int(
                stage1_result.get("min_expanded_word_target") or 0
            ),
        }

    async def stage_2_node(state: Url2BlogGraphState) -> Url2BlogGraphState:
        parse_metrics = dict(state.get("json_parse_metrics") or {})
        stage2_result = await url2blog_routes._pipeline_v2_run_stage2(
            request=request,
            run_id=state["run_id"],
            selected_model_name=state["selected_model_name"],
            include_debug=state["include_debug"],
            json_parse_metrics=parse_metrics,
            stage_trace=list(state.get("stage_trace") or []),
            normalized_title=str(state.get("normalized_title") or ""),
            normalized_content=str(state.get("normalized_content") or ""),
            normalized_language=str(state.get("normalized_language") or "English"),
        )
        _persist_pipeline_trace(
            run_id=state["run_id"],
            stage_trace=list(stage2_result.get("trace") or []),
        )
        return {
            "stage2_payload": dict(stage2_result.get("stage2_payload") or {}),
            "stage_trace": list(stage2_result.get("trace") or []),
            "json_parse_metrics": parse_metrics,
        }

    async def rewrite_quality_node(state: Url2BlogGraphState) -> Url2BlogGraphState:
        logger.debug("URL2Blog rewrite quality node start")
        context = url2blog_routes._pipeline_v2_prepare_context(
            request=request,
            run_id=state["run_id"],
            selected_model_name=state["selected_model_name"],
            execution_profile=state["execution_profile"],
            stage1_payload=dict(state.get("stage1_payload") or {}),
            stage2_payload=dict(state.get("stage2_payload") or {}),
            stage_trace=list(state.get("stage_trace") or []),
            json_parse_metrics=dict(state.get("json_parse_metrics") or {}),
        )

        retry_count = int(state.get("rewrite_quality_retry_count") or 0)
        context["rewrite_quality_retry_count"] = retry_count
        context = url2blog_routes._pipeline_v2_run_rewrite_quality_phase(context)
        _persist_pipeline_trace(
            run_id=state["run_id"],
            stage_trace=list(context.get("stage_trace") or []),
        )

        while True:
            decision, gate_data = _evaluate_rewrite_gate(
                context=context,
                retry_count=retry_count,
            )
            _write_graph_stage_result(
                run_id=state["run_id"],
                stage="rewrite_quality_gate",
                data=gate_data,
            )
            context["rewrite_quality_gate"] = gate_data
            context["stage_trace"] = url2blog_routes._pipeline_v2_append_stage_trace(
                stage_trace=list(context.get("stage_trace") or []),
                include_debug=bool(state.get("include_debug")),
                stage="rewrite_quality_gate",
                output=gate_data,
            )
            _persist_pipeline_trace(
                run_id=state["run_id"],
                stage_trace=list(context.get("stage_trace") or []),
            )

            if decision == "fail":
                raise RuntimeError(str(gate_data.get("failure_reason")))
            if decision == "pass":
                break

            retry_count += 1
            quality_feedback = dict(context.get("quality") or {})
            retry_feedback = {
                "overall_score": quality_feedback.get("overall_score"),
                "quality_summary": quality_feedback.get("quality_summary"),
                "required_revisions": list(
                    quality_feedback.get("required_revisions") or []
                ),
                "ngram_overlap": context.get("ngram_overlap"),
            }
            context["rewrite_quality_retry_count"] = retry_count
            context["rewrite_retry_feedback"] = retry_feedback
            _write_graph_stage_result(
                run_id=state["run_id"],
                stage="rewrite_quality_retry",
                data={
                    "retry_count": retry_count,
                    "retry_feedback": retry_feedback,
                },
            )
            context = url2blog_routes._pipeline_v2_run_rewrite_quality_phase(context)
            _persist_pipeline_trace(
                run_id=state["run_id"],
                stage_trace=list(context.get("stage_trace") or []),
            )

        logger.debug("URL2Blog rewrite quality node complete")
        return {
            "pipeline_context": context,
            "rewrite_quality_retry_count": retry_count,
            "stage_trace": list(context.get("stage_trace") or []),
            "json_parse_metrics": dict(context.get("json_parse_metrics") or {}),
        }

    async def fact_length_node(state: Url2BlogGraphState) -> Url2BlogGraphState:
        logger.debug("URL2Blog fact/length node start")
        context = dict(state.get("pipeline_context") or {})
        retry_count = int(state.get("fact_retry_count") or 0)

        context = url2blog_routes._pipeline_v2_run_fact_length_phase(context)
        _persist_pipeline_trace(
            run_id=state["run_id"],
            stage_trace=list(context.get("stage_trace") or []),
        )

        while True:
            decision, gate_data = _evaluate_fact_gate(
                context=context,
                retry_count=retry_count,
            )
            _write_graph_stage_result(
                run_id=state["run_id"],
                stage="fact_gate",
                data=gate_data,
            )
            context["fact_gate"] = gate_data
            context["stage_trace"] = url2blog_routes._pipeline_v2_append_stage_trace(
                stage_trace=list(context.get("stage_trace") or []),
                include_debug=bool(state.get("include_debug")),
                stage="fact_gate",
                output=gate_data,
            )
            _persist_pipeline_trace(
                run_id=state["run_id"],
                stage_trace=list(context.get("stage_trace") or []),
            )

            if decision == "pass":
                if gate_data["pass_mode"] == "fallback_unverified_facts":
                    context["fact_coverage_warning"] = {
                        "message": gate_data.get("fact_warning"),
                        "coverage_score": gate_data.get("coverage_score"),
                        "coverage_threshold": gate_data.get("coverage_threshold"),
                        "missing_facts": list(gate_data.get("missing_facts") or []),
                        "coverage_summary": gate_data.get("coverage_summary"),
                    }
                    logger.warning(
                        "URL2Blog fact gate passing with unverified facts: %s",
                        gate_data.get("fact_warning"),
                    )
                break

            retry_count += 1
            _write_graph_stage_result(
                run_id=state["run_id"],
                stage="fact_retry",
                data={"retry_count": retry_count},
            )
            context = url2blog_routes._pipeline_v2_run_fact_length_phase(context)
            _persist_pipeline_trace(
                run_id=state["run_id"],
                stage_trace=list(context.get("stage_trace") or []),
            )

        logger.debug("URL2Blog fact/length node complete")
        return {
            "pipeline_context": context,
            "fact_retry_count": retry_count,
            "stage_trace": list(context.get("stage_trace") or []),
            "json_parse_metrics": dict(context.get("json_parse_metrics") or {}),
        }

    async def editorial_node(state: Url2BlogGraphState) -> Url2BlogGraphState:
        logger.debug("URL2Blog editorial node start")
        context = dict(state.get("pipeline_context") or {})
        context = url2blog_routes._pipeline_v2_run_editorial_phase(context)

        gate_data = _evaluate_editorial_gate(context=context)
        _write_graph_stage_result(
            run_id=state["run_id"],
            stage="editorial_gate",
            data=gate_data,
        )
        context["editorial_gate"] = gate_data
        context["stage_trace"] = url2blog_routes._pipeline_v2_append_stage_trace(
            stage_trace=list(context.get("stage_trace") or []),
            include_debug=bool(state.get("include_debug")),
            stage="editorial_gate",
            output=gate_data,
        )

        if gate_data["decision"] == "rollback":
            context, rollback_data = _apply_editorial_rollback(
                context=context,
                url2blog_routes=url2blog_routes,
            )
            _write_graph_stage_result(
                run_id=state["run_id"],
                stage="editorial_rollback",
                data=rollback_data,
            )
            context["stage_trace"] = url2blog_routes._pipeline_v2_append_stage_trace(
                stage_trace=list(context.get("stage_trace") or []),
                include_debug=bool(state.get("include_debug")),
                stage="editorial_rollback",
                output=rollback_data,
            )
        else:
            context = url2blog_routes._pipeline_v2_run_editorial_post_recheck_phase(
                context
            )

        logger.debug("URL2Blog editorial node complete")
        _persist_pipeline_trace(
            run_id=state["run_id"],
            stage_trace=list(context.get("stage_trace") or []),
        )
        return {
            "pipeline_context": context,
            "stage_trace": list(context.get("stage_trace") or []),
            "json_parse_metrics": dict(context.get("json_parse_metrics") or {}),
        }

    async def finalize_node(state: Url2BlogGraphState) -> Url2BlogGraphState:
        logger.debug("URL2Blog finalize node start")
        context = dict(state.get("pipeline_context") or {})
        response_holder["response"] = url2blog_routes._pipeline_v2_finalize_response(
            context
        )
        logger.debug("URL2Blog finalize node complete")
        return {"completed": True}

    builder = StateGraph(Url2BlogGraphState)
    builder.add_node("stage_1", stage_1_node)
    builder.add_node("stage_2", stage_2_node)
    builder.add_node("rewrite_quality", rewrite_quality_node)
    builder.add_node("fact_length", fact_length_node)
    builder.add_node("editorial", editorial_node)
    builder.add_node("finalize", finalize_node)
    builder.add_edge(START, "stage_1")
    builder.add_edge("stage_1", "stage_2")
    builder.add_edge("stage_2", "rewrite_quality")
    builder.add_edge("rewrite_quality", "fact_length")
    builder.add_edge("fact_length", "editorial")
    builder.add_edge("editorial", "finalize")
    builder.add_edge("finalize", END)

    trace_payload: dict[str, str] = {}
    try:
        with langgraph_trace(
            trace_name="url2blog.pipeline_v2",
            feature="url2blog",
            thread_id=run_id,
            app_run_id=run_id,
            tags=["pipeline_v2"],
            metadata={"entrypoint": "url2blog/pipeline-v2"},
            inputs={"run_id": run_id},
        ) as (trace_run, trace_metadata):
            async with langgraph_checkpoint_async() as checkpointer:
                graph = builder.compile(checkpointer=checkpointer)
                await graph.ainvoke(
                    {
                        "run_id": run_id,
                        "selected_model_name": selected_model_name,
                        "execution_profile": execution_profile,
                        "include_debug": include_debug,
                        "rewrite_quality_retry_count": 0,
                        "fact_retry_count": 0,
                        "stage_trace": [],
                        "json_parse_metrics": json_parse_metrics,
                        "completed": False,
                    },
                    config={
                        "configurable": {"thread_id": run_id},
                        "tags": ["langgraph", "url2blog", "pipeline_v2"],
                        "metadata": {"feature": "url2blog", "run_id": run_id},
                        "run_name": "url2blog_pipeline_v2_graph",
                        "recursion_limit": 64,
                    },
                )
            trace_payload = langsmith_trace_payload(
                finalize_langsmith_trace(trace_run, trace_metadata)
            )
    except Exception as exc:
        _write_failed_status(run_id=run_id, error=exc)
        logger.exception("URL2Blog LangGraph pipeline failed")
        raise

    response = response_holder.get("response")
    if response is None:
        logger.error("URL2Blog LangGraph finished without a response")
        raise RuntimeError("URL2Blog LangGraph returned no response")

    response_with_trace, app_run_id = _attach_trace_payload(response, trace_payload)
    if app_run_id and trace_payload:
        write_stage_result(
            app_run_id,
            "langgraph_trace",
            {
                "created_at": datetime.utcnow().isoformat(),
                "data": trace_payload,
            },
        )

    return response_with_trace
