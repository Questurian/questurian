from contextlib import nullcontext
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse

from app.core import (
    read_all_stage_results,
    read_output,
    read_stage_result,
    read_status,
)
from app.core.staff_auth import require_staff, staff_user_id
from app.features.claude_connection.cli_writer import (
    prompt2blog_credential_scope,
    quota_breaker_scope,
)
from app.features.claude_connection.prompt2blog_credential import (
    Prompt2BlogCredential,
    Prompt2BlogCredentialError,
    load_credential,
)
from app.shared.writer_models import resolve_writer_model
from utils.llm_model_policy import (
    CLAUDE_PROVIDER_SUBSCRIPTION_CLI,
    claude_provider,
)

from ..config import DEFAULT_MODEL, FEATURE_NAME
from ..contracts_v3 import Prompt2BlogV3Request
from ..drafts_view import build_drafts_report, render_drafts_page
from ..intake_v3 import (
    prepare_v3_runtime_request,
    v3_intake_result,
    v3_run_input_artifact,
)
from ..models import Prompt2BlogInputRequest
from ..observability import _read_langgraph_trace
from ..models import PipelineV3RuntimeRequest
from ..orchestrator import run_full_pipeline
from ..orchestrator_v3 import resume_pipeline_v3, run_pipeline_v3
from ..resume_v3 import plan_resume
from ..run_recorder import RunRecorder
from ..support import _clean_string_list, _safe_str

router = APIRouter()

# One sentence per refusal, written for the operator rather than the log. Every
# key is a `ResumePlan.reason`; a reason with no entry falls back to the generic
# line, which is why the table can never make a refusal disappear.
RESUME_REFUSAL_MESSAGES = {
    "run_not_failed": (
        "This run has not failed, so there is nothing to resume."
    ),
    "no_snapshot": (
        "This run failed before it finished a single stage, so there is no "
        "saved work to continue from. Start a new run."
    ),
    "snapshot_version_unsupported": (
        "This run's saved state was written by an older version of the "
        "pipeline and cannot be trusted. Start a new run."
    ),
    "schema_version_unsupported": (
        "Only v3 runs can be resumed."
    ),
    "commission_mismatch": (
        "The saved state does not match the commission this run started "
        "with, so resuming it could publish mismatched work. Start a new run."
    ),
    "snapshot_unreadable": (
        "This run's saved state does not name a stage to continue from. "
        "Start a new run."
    ),
    "run_already_finished": (
        "This run had already finished its article; there is nothing left to "
        "resume."
    ),
    "resume_limit_reached": (
        "This run has already been resumed the maximum number of times. "
        "Whatever is failing is not something resuming can fix."
    ),
}


def _run_full_pipeline_background(
    run_id: str,
    request: Prompt2BlogInputRequest,
    credential: Prompt2BlogCredential | None,
) -> None:
    """Keep background-task failures contained after the graph records them."""
    try:
        scope = (
            prompt2blog_credential_scope(credential.token)
            if credential is not None
            else nullcontext()
        )
        # The breaker is armed for every run, credential or not: a run can
        # reach the CLI transport on the machine's own login, and it needs the
        # stop switch just as much as one with its own credential.
        with quota_breaker_scope(), scope:
            run_full_pipeline(run_id, request)
    except Exception:  # noqa: BLE001
        # The orchestrator records the active failed stage and logs the exception.
        # Re-raising from a Starlette background task only adds an unhandled-task
        # error after the HTTP response has already been sent.
        return


def _run_pipeline_v3_background(
    run_id: str,
    request: PipelineV3RuntimeRequest,
    credential: Prompt2BlogCredential | None,
) -> None:
    """Keep background-task failures contained after the graph records them."""
    try:
        scope = (
            prompt2blog_credential_scope(credential.token)
            if credential is not None
            else nullcontext()
        )
        with quota_breaker_scope(), scope:
            run_pipeline_v3(run_id, request)
    except Exception:  # noqa: BLE001
        return


def _resume_pipeline_v3_background(
    run_id: str,
    credential: Prompt2BlogCredential | None,
) -> None:
    """Keep background-task failures contained after the graph records them."""
    try:
        scope = (
            prompt2blog_credential_scope(credential.token)
            if credential is not None
            else nullcontext()
        )
        with quota_breaker_scope(), scope:
            resume_pipeline_v3(run_id)
    except Exception:  # noqa: BLE001
        return


def _prompt2blog_credential_for_run() -> Prompt2BlogCredential | None:
    if claude_provider() != CLAUDE_PROVIDER_SUBSCRIPTION_CLI:
        return None
    try:
        return load_credential()
    except Prompt2BlogCredentialError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


def _validate_prompt2blog_input_request(request: Prompt2BlogInputRequest) -> None:
    if request.article_type_id <= 0:
        raise HTTPException(status_code=400, detail="article_type_id is required")

    if not _clean_string_list(request.source_material):
        raise HTTPException(
            status_code=400,
            detail="At least one source_material item is required",
        )

    required_text_fields = {
        "article_goal": request.article_goal,
        "target_reader": request.target_reader,
        "destination_context": request.destination_context,
        "tone_id": request.tone_id,
        "length_id": request.length_id,
    }
    for field_name, value in required_text_fields.items():
        if not _safe_str(value):
            raise HTTPException(status_code=400, detail=f"{field_name} is required")

    try:
        resolve_writer_model(request.writing_model)
        resolve_writer_model(request.audit_model)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/pipeline-v2")
async def start_pipeline_v2(
    request: Prompt2BlogInputRequest,
    background_tasks: BackgroundTasks,
    staff_user=Depends(require_staff),
) -> JSONResponse:
    """Start Prompt2Blog pipeline-v2 from structured source input."""
    _validate_prompt2blog_input_request(request)
    credential = _prompt2blog_credential_for_run()
    run_id = str(uuid4())
    recorder = RunRecorder()

    recorder.queue(run_id, staff_user_id(staff_user))
    recorder.record_stage(
        run_id,
        "pipeline_input",
        {
            "article_type_id": request.article_type_id,
            "source_material_count": len(_clean_string_list(request.source_material)),
            "tone_id": _safe_str(request.tone_id),
            "length_id": _safe_str(request.length_id),
            "brand_voice_id": _safe_str(request.brand_voice_id),
            "include_debug": request.include_debug,
            "enable_editorial_augmentation": request.enable_editorial_augmentation,
            "model_name": request.model_name or DEFAULT_MODEL,
            "writing_model": request.writing_model,
            "audit_model": request.audit_model,
            "model_stack_id": request.model_stack_id,
            "claude_account_label": credential.label if credential else None,
        },
    )
    background_tasks.add_task(
        _run_full_pipeline_background,
        run_id,
        request,
        credential,
    )
    return JSONResponse({"message": "Prompt2Blog pipeline v2 queued", "run_id": run_id})


@router.post("/run")
async def start_full_run(
    request: Prompt2BlogInputRequest,
    background_tasks: BackgroundTasks,
    staff_user=Depends(require_staff),
) -> JSONResponse:
    """Start one-click Prompt2Blog run from source material through final article."""
    _validate_prompt2blog_input_request(request)
    credential = _prompt2blog_credential_for_run()
    run_id = str(uuid4())
    recorder = RunRecorder()

    recorder.queue(run_id, staff_user_id(staff_user))
    recorder.record_stage(
        run_id,
        "pipeline_input",
        {
            "mode": "structured_v2",
            "article_type_id": request.article_type_id,
            "source_material_count": len(_clean_string_list(request.source_material)),
            "tone_id": _safe_str(request.tone_id),
            "length_id": _safe_str(request.length_id),
            "brand_voice_id": _safe_str(request.brand_voice_id),
            "include_debug": request.include_debug,
            "enable_editorial_augmentation": request.enable_editorial_augmentation,
            "model_name": request.model_name or DEFAULT_MODEL,
            "writing_model": request.writing_model,
            "audit_model": request.audit_model,
            "model_stack_id": request.model_stack_id,
            "claude_account_label": credential.label if credential else None,
        },
    )
    background_tasks.add_task(
        _run_full_pipeline_background,
        run_id,
        request,
        credential,
    )
    return JSONResponse({"message": "Prompt2Blog full run queued", "run_id": run_id})


@router.post("/pipeline-v3")
async def start_pipeline_v3(
    request: Prompt2BlogV3Request,
    background_tasks: BackgroundTasks,
    staff_user=Depends(require_staff),
) -> JSONResponse:
    """Start a v3 run, or stop at the research gate without starting one.

    `needs_research` is returned synchronously and queues nothing: a commission
    whose evidence cannot support it has no run to make.
    """
    try:
        readiness_result = v3_intake_result(request)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if readiness_result["status"] != "ready":
        return JSONResponse(
            {
                "message": "Prompt2Blog v3 commission needs more research",
                **readiness_result,
            }
        )

    if request.enable_editorial_augmentation:
        raise HTTPException(
            status_code=400,
            detail=("Editorial augmentation is not available on the v3 pipeline yet."),
        )

    credential = _prompt2blog_credential_for_run()
    runtime = prepare_v3_runtime_request(request)
    run_id = str(uuid4())
    recorder = RunRecorder()
    recorder.queue(run_id, staff_user_id(staff_user))
    input_artifact = v3_run_input_artifact(runtime)
    input_artifact["claude_account_label"] = (
        credential.label if credential else None
    )
    recorder.record_stage(run_id, "pipeline_input_v3", input_artifact)
    background_tasks.add_task(
        _run_pipeline_v3_background,
        run_id,
        runtime,
        credential,
    )
    return JSONResponse(
        {
            "message": "Prompt2Blog pipeline v3 queued",
            "status": "queued",
            "run_id": run_id,
        }
    )


@router.get("/resume/{run_id}", dependencies=[Depends(require_staff)])
async def preview_resume(run_id: str) -> JSONResponse:
    """Report whether a failed run can be picked up, and from where.

    Read-only and free. An operator deciding whether to reconnect an account,
    resume, or start over needs to see what the failed run already produced
    and what it already cost before spending anything on the answer.
    """
    plan = plan_resume(run_id)
    if plan.reason == "run_not_found":
        raise HTTPException(status_code=404, detail="Run not found.")
    if plan.reason == "not_prompt2blog":
        raise HTTPException(status_code=404, detail="Run not found.")
    return JSONResponse(plan.as_dict())


@router.post("/resume/{run_id}")
async def resume_run(
    run_id: str,
    background_tasks: BackgroundTasks,
    staff_user=Depends(require_staff),
) -> JSONResponse:
    """Continue a failed v3 run from the last stage it finished.

    The run keeps its `run_id`, so the status the client is already polling,
    the stage rows, the token ledger and the finished article all stay on one
    run. A refusal costs nothing and names the check that failed.
    """
    plan = plan_resume(run_id)
    if plan.reason in {"run_not_found", "not_prompt2blog"}:
        raise HTTPException(status_code=404, detail="Run not found.")
    if not plan.resumable:
        raise HTTPException(
            status_code=409,
            detail=RESUME_REFUSAL_MESSAGES.get(
                plan.reason, "This run cannot be resumed."
            ),
        )

    credential = _prompt2blog_credential_for_run()
    background_tasks.add_task(_resume_pipeline_v3_background, run_id, credential)
    return JSONResponse(
        {
            "message": "Prompt2Blog pipeline v3 resumed",
            "status": "queued",
            **plan.as_dict(),
        }
    )


@router.get("/status/{run_id}")
async def get_status(run_id: str) -> JSONResponse:
    """Get status for a Prompt2Blog pipeline run."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")
    return JSONResponse(status)


@router.get("/result/{run_id}")
async def get_result(run_id: str) -> JSONResponse:
    """Get final result for a completed Prompt2Blog pipeline run."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    output = read_output(run_id)
    if not output:
        raise HTTPException(status_code=404, detail="Result not available yet.")

    trace_payload = _read_langgraph_trace(run_id)
    artifact = output["artifact"]
    if trace_payload and isinstance(artifact, dict):
        # A run records exactly one of these keys, named for the pipeline
        # version that produced it. Both are checked so a v3 result carries its
        # trace link in the same place a v2 result always has.
        for artifact_key in ("pipeline_v2", "pipeline_v3"):
            pipeline_payload = artifact.get(artifact_key)
            if isinstance(pipeline_payload, dict):
                pipeline_payload.update(trace_payload)

    response_payload: dict[str, Any] = {
        "run_id": run_id,
        "markdown": output["markdown"],
        "artifact": artifact,
    }
    response_payload.update(trace_payload)
    return JSONResponse(response_payload)


@router.get("/drafts/{run_id}", response_class=HTMLResponse)
async def drafts_page(run_id: str) -> HTMLResponse:
    """Every draft this run produced, as a page an operator can read.

    HTML rather than JSON because the answer is prose being compared to other
    prose: which version shipped, how long each one was, and what the audit
    said about it. The same page the `scripts/p2b-drafts.py` CLI writes, from
    the same renderer.

    Read-only, and it reads rows `/debug/{run_id}` already returns, so it adds
    no exposure beyond that endpoint.
    """
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    output = read_output(run_id)
    report = build_drafts_report(
        run_id=run_id,
        status=status,
        stages=read_all_stage_results(run_id),
        markdown=(output or {}).get("markdown", ""),
    )
    if not report["drafts"]:
        raise HTTPException(
            status_code=404,
            detail="This run has no drafts yet; it may still be composing.",
        )
    return HTMLResponse(render_drafts_page(report))


@router.get("/debug/{run_id}")
async def debug_run(run_id: str) -> JSONResponse:
    """Debug endpoint for Prompt2Blog run metadata/stages."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    stages = {}
    for stage_name in [
        "pipeline_input",
        "stage_input_validate",
        "stage_input_cleanup",
        "stage_synthesize_sources",
        "stage_classify_article_type",
        "stage_guideline_fetch",
        "stage_coverage_check",
        "stage_supplement",
        "stage_compose",
        "stage_quality_audit",
        "stage_repair",
        "stage_editorial_augmentation",
        "stage_title",
        "stage_finalize",
        "pipeline_v2",
        "pipeline_input_v3",
        "stage_v3_outline",
        "stage_v3_compose",
        "stage_v3_groundedness",
        "stage_v3_quality_audit",
        "stage_v3_repair",
        "stage_v3_quality_settle",
        "stage_v3_title",
        "stage_v3_finalize",
        "pipeline_v3",
        # Not `resume_snapshot`: it holds a whole graph state, and this
        # endpoint returns every row it names in one response.
        "pipeline_resume_v3",
        "pipeline_failure",
        "langgraph_trace",
    ]:
        stage_data = read_stage_result(run_id, stage_name)
        if stage_data:
            stages[stage_name] = stage_data

    return JSONResponse(
        {
            "run_id": run_id,
            "status": status,
            "stages": stages,
            "output": read_output(run_id),
        }
    )
