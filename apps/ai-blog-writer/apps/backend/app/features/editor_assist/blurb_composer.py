"""Thin composition API for one Editor Assist listicle target.

The public contracts stay available from this module for compatibility. Cohesive
evidence, prompt-policy, and writer-execution concerns live in adjacent modules.
"""

from __future__ import annotations

import time

from .blurb_composition_contracts import (
    CompositionStatus,
    ListicleCompositionDeps,
    ListicleCompositionResult,
    ListicleCompositionSettings,
    ListicleCompositionStep,
    ListicleCompositionTarget,
    ListicleCompositionWriterError,
    StepStatus,
    WriterBriefRunner,
    WriterInvoker,
    WriterModelResult,
)
from .blurb_composition_confidence import initial_low_confidence
from .blurb_composition_evidence import (
    format_research_profile_block,
    prepare_research,
    prepare_writer_brief,
)
from .blurb_composition_execution import execute_writer_plan
from .blurb_composition_policy import (
    select_writer_prompt,
    to_listicle_writer_target,
    uses_lean_prompt,
)
from .critical_fields import CriticalFieldsResult
from .research_profile import ResearchProfile, ResearchProfileTrace

__all__ = [
    "CompositionStatus",
    "ListicleCompositionDeps",
    "ListicleCompositionResult",
    "ListicleCompositionSettings",
    "ListicleCompositionStep",
    "ListicleCompositionTarget",
    "ListicleCompositionWriterError",
    "StepStatus",
    "WriterBriefRunner",
    "WriterInvoker",
    "WriterModelResult",
    "compose_listicle_target",
]


def _elapsed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


def _critical_fields_step(
    target: ListicleCompositionTarget,
    cf_result: CriticalFieldsResult,
) -> ListicleCompositionStep:
    start = time.perf_counter()
    return ListicleCompositionStep(
        name="critical_fields_evaluated",
        status="ok" if cf_result.passed else "failed",
        details={
            "passed": cf_result.passed,
            "missing": list(cf_result.missing),
            "category": target.category,
            "field_type": target.field_type,
        },
        duration_ms=_elapsed_ms(start),
    )


def compose_listicle_target(
    *,
    target: ListicleCompositionTarget,
    settings: ListicleCompositionSettings,
    cf_result: CriticalFieldsResult,
    research_profile: ResearchProfile | None,
    research_profile_trace: ResearchProfileTrace | None,
    deps: ListicleCompositionDeps | None = None,
) -> ListicleCompositionResult:
    """Compose and validate one target while preserving the stable route seam."""
    dependencies = deps or ListicleCompositionDeps()
    steps = [_critical_fields_step(target, cf_result)]
    if not cf_result.passed:
        return ListicleCompositionResult(
            target_id=target.target_id,
            status="error",
            model_used=settings.model_name,
            error_message=(
                f"Critical Fields gate failed: missing {', '.join(cf_result.missing)}"
            ),
            requested_angle=settings.requested_angle,
            effective_angle=settings.effective_angle,
            steps=steps,
        )

    is_blurb = target.field_type == "blurb"
    research = prepare_research(
        is_blurb=is_blurb,
        settings=settings,
        research_profile=research_profile,
        research_profile_trace=research_profile_trace,
    )
    steps.extend(research.steps)

    low_confidence = initial_low_confidence(
        is_blurb=is_blurb,
        target=target,
        research_profile=research_profile,
        settings=settings,
    )
    use_lean_prompt = uses_lean_prompt(
        is_blurb=is_blurb,
        target=target,
        research_profile=research_profile,
    )
    brief = prepare_writer_brief(
        use_lean_prompt=use_lean_prompt,
        target=target,
        settings=settings,
        research_profile=research_profile,
        deps=dependencies,
    )
    if brief.low_confidence_reason:
        low_confidence.add(brief.low_confidence_reason)
    if brief.step is not None:
        steps.append(brief.step)

    writer_target = to_listicle_writer_target(
        target,
        extra_supporting_context=format_research_profile_block(research_profile),
    )
    plan = select_writer_prompt(
        settings=settings,
        target=target,
        writer_target=writer_target,
        is_blurb=is_blurb,
        use_lean_prompt=use_lean_prompt,
        research_profile=research_profile,
        writer_brief=brief.writer_brief,
    )
    return execute_writer_plan(
        target=target,
        settings=settings,
        plan=plan,
        deps=dependencies,
        source_urls=research.source_urls,
        warnings=research.warnings,
        low_confidence=low_confidence,
        prior_steps=steps,
    )
