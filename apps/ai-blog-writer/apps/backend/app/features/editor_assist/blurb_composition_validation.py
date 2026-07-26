"""Validation trace and final result policy for listicle composition."""

from __future__ import annotations

import time

from .blurb_composition_confidence import LowConfidence
from .blurb_composition_contracts import (
    ListicleCompositionResult,
    ListicleCompositionSettings,
    ListicleCompositionStep,
    ListicleCompositionTarget,
)
from .listicle_writer import ListicleFieldType, validate_generated_text


def _elapsed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


def validate_candidate(*, field_type: ListicleFieldType, text: str) -> list[str]:
    """Apply the canonical listicle text validator."""
    return validate_generated_text(field_type=field_type, text=text)


def build_validation_step(
    *,
    field_type: ListicleFieldType,
    validation_errors: list[str],
    started_at: float,
) -> ListicleCompositionStep:
    return ListicleCompositionStep(
        name="validated",
        status="ok" if not validation_errors else "failed",
        details={
            "validation_errors": list(validation_errors),
            "passed": not validation_errors,
            "field_type": field_type,
        },
        duration_ms=_elapsed_ms(started_at),
    )


def finalize_validated_result(
    *,
    target: ListicleCompositionTarget,
    settings: ListicleCompositionSettings,
    candidate: str,
    model_used: str,
    source_urls: list[str],
    warnings: list[str],
    low_confidence: LowConfidence,
    validation_errors: list[str],
    steps: list[ListicleCompositionStep],
) -> ListicleCompositionResult:
    start = time.perf_counter()
    if validation_errors:
        steps.append(
            ListicleCompositionStep(
                name="finalized",
                status="failed",
                output=candidate,
                model=model_used,
                details={
                    "final_status": "error",
                    "validation_errors": list(validation_errors),
                    "source_urls": list(source_urls),
                    "low_confidence": low_confidence.value,
                    "low_confidence_reasons": list(low_confidence.reasons),
                    "warnings": list(warnings),
                },
                duration_ms=_elapsed_ms(start),
            )
        )
        return ListicleCompositionResult(
            target_id=target.target_id,
            status="error",
            model_used=model_used,
            source_urls=source_urls,
            validation_errors=validation_errors,
            error_message="Generated content failed validation after retry.",
            low_confidence=low_confidence.value,
            warnings=warnings,
            requested_angle=settings.requested_angle,
            effective_angle=settings.effective_angle,
            steps=steps,
        )

    steps.append(
        ListicleCompositionStep(
            name="finalized",
            status="ok",
            output=candidate,
            model=model_used,
            details={
                "final_status": "generated",
                "source_urls": list(source_urls),
                "low_confidence": low_confidence.value,
                "low_confidence_reasons": list(low_confidence.reasons),
                "warnings": list(warnings),
            },
            duration_ms=_elapsed_ms(start),
        )
    )
    return ListicleCompositionResult(
        target_id=target.target_id,
        status="generated",
        markdown=candidate,
        model_used=model_used,
        source_urls=source_urls,
        low_confidence=low_confidence.value,
        warnings=warnings,
        requested_angle=settings.requested_angle,
        effective_angle=settings.effective_angle,
        steps=steps,
    )
