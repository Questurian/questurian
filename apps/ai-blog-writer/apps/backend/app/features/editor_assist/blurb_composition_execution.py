"""Writer execution, validation, retry, and finalization for one target."""

from __future__ import annotations

import logging
import time

from app.shared.writer_invocation import WriterModelError

from .blurb_composition_confidence import LowConfidence
from .blurb_composition_contracts import (
    ListicleCompositionDeps,
    ListicleCompositionResult,
    ListicleCompositionSettings,
    ListicleCompositionStep,
    ListicleCompositionTarget,
    ListicleCompositionWriterError,
)
from .blurb_composition_policy import WriterPromptPlan
from .blurb_composition_retry import build_retry_prompt_for_plan
from .blurb_composition_validation import (
    build_validation_step,
    finalize_validated_result,
    validate_candidate,
)
from .listicle_writer import strip_generation_fence

logger = logging.getLogger(__name__)


def _elapsed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


def _writer_step_details(
    *,
    settings: ListicleCompositionSettings,
    low_confidence: LowConfidence,
    warnings: list[str],
) -> dict[str, object]:
    return {
        "custom_instruction": settings.custom_instruction or None,
        "list_tone": settings.list_tone,
        "requested_angle": settings.requested_angle,
        "effective_angle": settings.effective_angle,
        "low_confidence": low_confidence.value,
        "low_confidence_reasons": list(low_confidence.reasons),
        "warnings": list(warnings),
    }


def execute_writer_plan(
    *,
    target: ListicleCompositionTarget,
    settings: ListicleCompositionSettings,
    plan: WriterPromptPlan,
    deps: ListicleCompositionDeps,
    source_urls: list[str],
    warnings: list[str],
    low_confidence: LowConfidence,
    prior_steps: list[ListicleCompositionStep],
) -> ListicleCompositionResult:
    """Run the selected writer path and return its final validated result."""
    steps = list(prior_steps)
    writer_start = time.perf_counter()
    try:
        writer_result = deps.invoke_writer(
            prompt=plan.prompt,
            model_name=settings.model_name,
            max_tokens=8192,
            temperature=0.15,
        )
    except WriterModelError as exc:
        steps.append(
            ListicleCompositionStep(
                name="writer_called",
                status="failed",
                prompt=plan.prompt,
                model=settings.model_name,
                details={
                    "error": str(exc),
                    **_writer_step_details(
                        settings=settings,
                        low_confidence=low_confidence,
                        warnings=warnings,
                    ),
                },
                duration_ms=_elapsed_ms(writer_start),
            )
        )
        logger.exception("Writer model call failed for target %s", target.target_id)
        raise ListicleCompositionWriterError(str(exc)) from exc

    candidate = strip_generation_fence(writer_result.text)
    model_used = writer_result.model_name
    steps.append(
        ListicleCompositionStep(
            name="writer_called",
            status="ok",
            prompt=plan.prompt,
            output=candidate,
            model=model_used,
            details={
                "raw_output": writer_result.text,
                **_writer_step_details(
                    settings=settings,
                    low_confidence=low_confidence,
                    warnings=warnings,
                ),
            },
            duration_ms=_elapsed_ms(writer_start),
        )
    )

    validation_start = time.perf_counter()
    validation_errors = validate_candidate(
        field_type=plan.writer_target.field_type,
        text=candidate,
    )
    steps.append(
        build_validation_step(
            field_type=plan.writer_target.field_type,
            validation_errors=validation_errors,
            started_at=validation_start,
        )
    )

    if validation_errors:
        retry_start = time.perf_counter()
        retry_prompt = build_retry_prompt_for_plan(
            settings=settings,
            target=target,
            plan=plan,
            candidate=candidate,
            validation_errors=validation_errors,
        )
        try:
            retry_result = deps.invoke_writer(
                prompt=retry_prompt,
                model_name=settings.model_name,
                max_tokens=8192,
                temperature=0.1,
            )
        except WriterModelError as exc:
            steps.append(
                ListicleCompositionStep(
                    name="retry_called",
                    status="failed",
                    prompt=retry_prompt,
                    model=settings.model_name,
                    details={"error": str(exc)},
                    duration_ms=_elapsed_ms(retry_start),
                )
            )
            logger.exception(
                "Writer model retry failed for target %s", target.target_id
            )
            raise ListicleCompositionWriterError(str(exc)) from exc

        candidate = strip_generation_fence(retry_result.text)
        validation_errors = validate_candidate(
            field_type=plan.writer_target.field_type,
            text=candidate,
        )
        model_used = retry_result.model_name
        steps.append(
            ListicleCompositionStep(
                name="retry_called",
                status="ok" if not validation_errors else "failed",
                prompt=retry_prompt,
                output=candidate,
                model=model_used,
                details={
                    "raw_output": retry_result.text,
                    "post_retry_validation_errors": list(validation_errors),
                    "passed": not validation_errors,
                },
                duration_ms=_elapsed_ms(retry_start),
            )
        )

    return finalize_validated_result(
        target=target,
        settings=settings,
        candidate=candidate,
        model_used=model_used,
        source_urls=source_urls,
        warnings=warnings,
        low_confidence=low_confidence,
        validation_errors=validation_errors,
        steps=steps,
    )
