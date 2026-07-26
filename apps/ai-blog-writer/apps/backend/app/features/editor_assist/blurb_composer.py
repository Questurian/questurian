"""Composition orchestration for one editor-assist listicle target.

This module owns sequencing policy for Critical Fields, Research Profile,
Writer Brief, prompt selection, retry, validation, warnings, and
low-confidence signaling. Routes adapt HTTP/Pydantic inputs into this smaller
interface.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import logging
import time
from typing import Any, Literal, Protocol

from .angle_assignment import (
    ANTI_AI_PROMPT_CATEGORIES,
    LEAN_PROMPT_CATEGORIES,
    ListicleAngle,
)
from .critical_fields import CriticalFieldsResult
from .listicle_writer import (
    ListTone,
    ListicleArticleType,
    ListicleCategory,
    ListicleFieldType,
    ListicleWriterTarget,
    build_identity_only_writer_prompt,
    build_lean_writer_prompt,
    build_retry_prompt,
    build_writer_prompt,
    strip_generation_fence,
    validate_generated_text,
)
from .research_profile import (
    ResearchFinding,
    ResearchProfile,
    ResearchProfileTrace,
)
from .writer_brief import (
    MIN_SOURCE_FACTS,
    WriterBrief,
    WriterBriefTrace,
    run_writer_brief,
)
from app.shared.writer_invocation import WriterModelError, invoke_writer_model

logger = logging.getLogger(__name__)

_LEAN_INLINE_RETRY_CATEGORIES = {"nightlife"}
_LEAN_RETRY_BUILDER_CATEGORIES = {"dining", "accommodations", "attractions"}

CompositionStatus = Literal["generated", "error"]
StepStatus = Literal["ok", "skipped", "failed"]


class WriterModelResult(Protocol):
    text: str
    model_name: str


class WriterInvoker(Protocol):
    def __call__(
        self,
        *,
        prompt: str,
        model_name: str,
        max_tokens: int,
        temperature: float,
    ) -> WriterModelResult: ...


class WriterBriefRunner(Protocol):
    def __call__(
        self,
        *,
        venue_name: str,
        location_label: str,
        category: str,
        angle: ListicleAngle | None,
        research_profile: ResearchProfile,
    ) -> tuple[WriterBrief, WriterBriefTrace]: ...


@dataclass(frozen=True)
class ListicleCompositionTarget:
    target_id: str
    field_type: ListicleFieldType
    category: ListicleCategory | None = None
    display_name: str | None = None
    research_subject: str | None = None
    location_label: str | None = None
    current_content: str = ""
    supporting_context: str | None = None


@dataclass(frozen=True)
class ListicleCompositionSettings:
    article_title: str
    article_type: ListicleArticleType
    article_location: str
    article_context: str
    custom_instruction: str
    model_name: str
    list_tone: ListTone | None = None
    requested_angle: ListicleAngle | None = None
    effective_angle: ListicleAngle | None = None


@dataclass(frozen=True)
class ListicleCompositionStep:
    name: str
    status: StepStatus
    prompt: str | None = None
    output: str | None = None
    model: str | None = None
    details: dict[str, Any] = field(default_factory=dict)
    duration_ms: int = 0


@dataclass(frozen=True)
class ListicleCompositionResult:
    target_id: str
    status: CompositionStatus
    model_used: str
    markdown: str | None = None
    source_urls: list[str] = field(default_factory=list)
    validation_errors: list[str] = field(default_factory=list)
    error_message: str | None = None
    low_confidence: bool = False
    warnings: list[str] = field(default_factory=list)
    requested_angle: ListicleAngle | None = None
    effective_angle: ListicleAngle | None = None
    steps: list[ListicleCompositionStep] = field(default_factory=list)


@dataclass(frozen=True)
class ListicleCompositionDeps:
    invoke_writer: WriterInvoker = invoke_writer_model
    run_writer_brief: WriterBriefRunner = run_writer_brief


class ListicleCompositionWriterError(Exception):
    """Raised when writer model calls fail and HTTP adapter should return 502."""


@dataclass
class _LowConfidence:
    reasons: list[str] = field(default_factory=list)

    def add(self, reason: str) -> None:
        if reason not in self.reasons:
            self.reasons.append(reason)

    @property
    def value(self) -> bool:
        return bool(self.reasons)


@dataclass(frozen=True)
class _WriterPromptPlan:
    prompt: str
    writer_target: ListicleWriterTarget
    path: Literal["lean", "identity", "legacy"]
    writer_brief: WriterBrief | None = None


def _elapsed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


def _merge_urls(*groups: list[str]) -> list[str]:
    seen: set[str] = set()
    merged: list[str] = []
    for group in groups:
        for url in group:
            if url in seen:
                continue
            seen.add(url)
            merged.append(url)
    return merged


def _format_research_profile_block(
    research_profile: ResearchProfile | None,
) -> str:
    """Render supported angle evidence and bucket evidence for the writer."""
    if research_profile is None:
        return ""
    lines: list[str] = ["RESEARCH PROFILE"]
    selected = research_profile.selected_angle
    if selected.status == "supported" and selected.angle and selected.summary:
        lines.append("SELECTED ANGLE EVIDENCE")
        lines.append(f"- {selected.angle} (effective angle): {selected.summary}")
    bucket_lines: list[str] = []
    for bucket, findings in research_profile.standard_buckets.items():
        for finding in findings:
            bucket_lines.append(f"- {bucket}: {finding.summary}")
    if bucket_lines:
        lines.append("STANDARD EVIDENCE BUCKETS")
        lines.extend(bucket_lines)
    return "\n".join(lines)


def _research_buckets_details(
    buckets: dict[str, list[ResearchFinding]],
) -> dict[str, list[dict[str, Any]]]:
    return {
        bucket: [
            {
                "summary": finding.summary,
                "citations": list(finding.citations),
            }
            for finding in findings
        ]
        for bucket, findings in buckets.items()
    }


def _to_listicle_writer_target(
    target: ListicleCompositionTarget,
    *,
    extra_supporting_context: str = "",
) -> ListicleWriterTarget:
    base_context = target.supporting_context or ""
    if extra_supporting_context:
        supporting_context = (
            f"{base_context}\n\n{extra_supporting_context}".strip()
            if base_context.strip()
            else extra_supporting_context
        )
    else:
        supporting_context = base_context

    return ListicleWriterTarget(
        target_id=target.target_id,
        field_type=target.field_type,
        category=target.category,
        display_name=target.display_name,
        research_subject=target.research_subject,
        location_label=target.location_label,
        current_content=target.current_content or "",
        supporting_context=supporting_context,
    )


def _initial_low_confidence(
    *,
    is_blurb: bool,
    target: ListicleCompositionTarget,
    research_profile: ResearchProfile | None,
    requested_angle: ListicleAngle | None,
    effective_angle: ListicleAngle | None,
) -> _LowConfidence:
    low_confidence = _LowConfidence()
    angle_failed = (
        is_blurb
        and target.category in ANTI_AI_PROMPT_CATEGORIES
        and requested_angle is not None
        and effective_angle is None
    )
    if angle_failed:
        low_confidence.add("requested angle unsupported")
    if (
        is_blurb
        and research_profile is not None
        and not research_profile.usable_for_blurb
    ):
        low_confidence.add("research profile unusable")
    return low_confidence


def _uses_lean_prompt(
    *,
    is_blurb: bool,
    target: ListicleCompositionTarget,
    research_profile: ResearchProfile | None,
) -> bool:
    return (
        is_blurb
        and target.category in LEAN_PROMPT_CATEGORIES
        and research_profile is not None
        and research_profile.usable_for_blurb
    )


def _select_writer_prompt(
    *,
    settings: ListicleCompositionSettings,
    target: ListicleCompositionTarget,
    writer_target: ListicleWriterTarget,
    is_blurb: bool,
    use_lean_prompt: bool,
    research_profile: ResearchProfile | None,
    writer_brief: WriterBrief | None,
) -> _WriterPromptPlan:
    if use_lean_prompt and writer_brief is not None and writer_brief.is_usable:
        lean_target = _to_listicle_writer_target(target)
        prompt = build_lean_writer_prompt(
            category=target.category or "nightlife",
            article_title=settings.article_title,
            article_type=settings.article_type,
            article_location=settings.article_location,
            target=lean_target,
            brief=writer_brief,
            custom_instruction=settings.custom_instruction,
            list_tone=settings.list_tone,
        )
        return _WriterPromptPlan(
            prompt=prompt,
            writer_target=writer_target,
            path="lean",
            writer_brief=writer_brief,
        )

    if (
        is_blurb
        and research_profile is not None
        and not research_profile.usable_for_blurb
    ):
        prompt = build_identity_only_writer_prompt(
            article_title=settings.article_title,
            article_type=settings.article_type,
            article_location=settings.article_location,
            target=writer_target,
            article_context=settings.article_context,
            custom_instruction=settings.custom_instruction,
            list_tone=settings.list_tone,
        )
        return _WriterPromptPlan(
            prompt=prompt, writer_target=writer_target, path="identity"
        )

    if use_lean_prompt:
        prompt = build_identity_only_writer_prompt(
            article_title=settings.article_title,
            article_type=settings.article_type,
            article_location=settings.article_location,
            target=writer_target,
            article_context=settings.article_context,
            custom_instruction=settings.custom_instruction,
            list_tone=settings.list_tone,
        )
        return _WriterPromptPlan(
            prompt=prompt, writer_target=writer_target, path="identity"
        )

    prompt = build_writer_prompt(
        article_title=settings.article_title,
        article_type=settings.article_type,
        article_location=settings.article_location,
        target=writer_target,
        article_context=settings.article_context,
        custom_instruction=settings.custom_instruction,
        list_tone=settings.list_tone,
        listicle_angle=settings.effective_angle,
    )
    return _WriterPromptPlan(prompt=prompt, writer_target=writer_target, path="legacy")


def _build_retry_prompt_for_plan(
    *,
    settings: ListicleCompositionSettings,
    target: ListicleCompositionTarget,
    plan: _WriterPromptPlan,
    candidate: str,
    validation_errors: list[str],
) -> str:
    if (
        plan.path == "lean"
        and plan.writer_brief is not None
        and plan.writer_brief.is_usable
        and target.category in _LEAN_INLINE_RETRY_CATEGORIES
    ):
        lean_target = _to_listicle_writer_target(target)
        base_lean_prompt = build_lean_writer_prompt(
            category="nightlife",
            article_title=settings.article_title,
            article_type=settings.article_type,
            article_location=settings.article_location,
            target=lean_target,
            brief=plan.writer_brief,
            custom_instruction=settings.custom_instruction,
            list_tone=settings.list_tone,
        )
        failures = "\n".join(f"- {item}" for item in validation_errors)
        return (
            f"{base_lean_prompt}\n\n"
            "REVISION TASK\n"
            "The previous draft did not pass validation. Rewrite it so it fully complies.\n\n"
            f"VALIDATION FAILURES\n{failures}\n\n"
            f"CURRENT DRAFT\n{candidate.strip()}\n\n"
            "Return only the corrected final paragraph."
        )

    retry_brief = (
        plan.writer_brief
        if (
            plan.path == "lean"
            and plan.writer_brief is not None
            and plan.writer_brief.is_usable
            and target.category in _LEAN_RETRY_BUILDER_CATEGORIES
        )
        else None
    )
    return build_retry_prompt(
        article_title=settings.article_title,
        article_type=settings.article_type,
        article_location=settings.article_location,
        target=plan.writer_target,
        article_context=settings.article_context,
        custom_instruction=settings.custom_instruction,
        current_output=candidate,
        validation_errors=validation_errors,
        list_tone=settings.list_tone,
        listicle_angle=settings.effective_angle,
        brief=retry_brief,
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
    deps = deps or ListicleCompositionDeps()
    steps: list[ListicleCompositionStep] = []
    source_urls: list[str] = []
    warnings: list[str] = []

    cf_start = time.perf_counter()
    steps.append(
        ListicleCompositionStep(
            name="critical_fields_evaluated",
            status="ok" if cf_result.passed else "failed",
            details={
                "passed": cf_result.passed,
                "missing": list(cf_result.missing),
                "category": target.category,
                "field_type": target.field_type,
            },
            duration_ms=_elapsed_ms(cf_start),
        )
    )
    if not cf_result.passed:
        return ListicleCompositionResult(
            target_id=target.target_id,
            status="error",
            model_used=settings.model_name,
            error_message=f"Critical Fields gate failed: missing {', '.join(cf_result.missing)}",
            requested_angle=settings.requested_angle,
            effective_angle=settings.effective_angle,
            steps=steps,
        )

    is_blurb = target.field_type == "blurb"
    if is_blurb and research_profile is not None:
        rp_start = time.perf_counter()
        source_urls = _merge_urls(source_urls, research_profile.source_urls)
        warnings = list(research_profile.warnings)
        trace = research_profile_trace or ResearchProfileTrace(prompt="")
        steps.append(
            ListicleCompositionStep(
                name="research_profile_completed",
                status="ok" if research_profile.usable_for_blurb else "failed",
                prompt=trace.prompt or None,
                output=trace.raw_response or None,
                model=trace.model or None,
                details={
                    "requested_angle": settings.requested_angle,
                    "effective_angle": research_profile.effective_angle,
                    "selected_angle": {
                        "angle": research_profile.selected_angle.angle,
                        "status": research_profile.selected_angle.status,
                        "summary": research_profile.selected_angle.summary,
                        "citations": list(research_profile.selected_angle.citations),
                        "reason": research_profile.selected_angle.reason,
                    },
                    "standard_buckets": _research_buckets_details(
                        research_profile.standard_buckets
                    ),
                    "usable_for_blurb": research_profile.usable_for_blurb,
                    "source_urls": list(source_urls),
                    "warnings": list(warnings),
                    "parser_dropped_reason": trace.parser_dropped_reason,
                    "error": trace.error,
                },
                duration_ms=_elapsed_ms(rp_start),
            )
        )

    low_confidence = _initial_low_confidence(
        is_blurb=is_blurb,
        target=target,
        research_profile=research_profile,
        requested_angle=settings.requested_angle,
        effective_angle=settings.effective_angle,
    )

    use_lean_prompt = _uses_lean_prompt(
        is_blurb=is_blurb,
        target=target,
        research_profile=research_profile,
    )
    writer_brief: WriterBrief | None = None
    if use_lean_prompt:
        wb_start = time.perf_counter()
        venue_name = (target.research_subject or target.display_name or "").strip()
        location_label = (target.location_label or settings.article_location).strip()
        writer_brief, wb_trace = deps.run_writer_brief(
            venue_name=venue_name,
            location_label=location_label,
            category=target.category or "nightlife",
            angle=settings.effective_angle,
            research_profile=research_profile,
        )
        if not writer_brief.is_usable:
            low_confidence.add("writer brief unusable")
        steps.append(
            ListicleCompositionStep(
                name="writer_brief_completed",
                status="ok" if writer_brief.is_usable else "failed",
                prompt=wb_trace.prompt or None,
                output=wb_trace.raw_response or None,
                model=wb_trace.model or None,
                details={
                    "angle": writer_brief.angle,
                    "angle_directive": writer_brief.angle_directive,
                    "source_facts": [
                        {"fact": entry.fact, "citations": list(entry.citations)}
                        for entry in writer_brief.source_facts
                    ],
                    "source_facts_count": len(writer_brief.source_facts),
                    "min_source_facts": MIN_SOURCE_FACTS,
                    "is_usable": writer_brief.is_usable,
                    "parser_dropped_reason": wb_trace.parser_dropped_reason,
                    "error": wb_trace.error,
                },
                duration_ms=_elapsed_ms(wb_start),
            )
        )

    findings_block = _format_research_profile_block(research_profile)
    writer_target = _to_listicle_writer_target(
        target, extra_supporting_context=findings_block
    )
    plan = _select_writer_prompt(
        settings=settings,
        target=target,
        writer_target=writer_target,
        is_blurb=is_blurb,
        use_lean_prompt=use_lean_prompt,
        research_profile=research_profile,
        writer_brief=writer_brief,
    )

    wr_start = time.perf_counter()
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
                    "custom_instruction": settings.custom_instruction or None,
                    "list_tone": settings.list_tone,
                    "requested_angle": settings.requested_angle,
                    "effective_angle": settings.effective_angle,
                    "low_confidence": low_confidence.value,
                    "low_confidence_reasons": list(low_confidence.reasons),
                    "warnings": list(warnings),
                },
                duration_ms=_elapsed_ms(wr_start),
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
                "custom_instruction": settings.custom_instruction or None,
                "list_tone": settings.list_tone,
                "requested_angle": settings.requested_angle,
                "effective_angle": settings.effective_angle,
                "low_confidence": low_confidence.value,
                "low_confidence_reasons": list(low_confidence.reasons),
                "warnings": list(warnings),
            },
            duration_ms=_elapsed_ms(wr_start),
        )
    )

    val_start = time.perf_counter()
    validation_errors = validate_generated_text(
        field_type=writer_target.field_type,
        text=candidate,
    )
    steps.append(
        ListicleCompositionStep(
            name="validated",
            status="ok" if not validation_errors else "failed",
            details={
                "validation_errors": list(validation_errors),
                "passed": not validation_errors,
                "field_type": writer_target.field_type,
            },
            duration_ms=_elapsed_ms(val_start),
        )
    )

    if validation_errors:
        rt_start = time.perf_counter()
        retry_prompt = _build_retry_prompt_for_plan(
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
                    duration_ms=_elapsed_ms(rt_start),
                )
            )
            logger.exception(
                "Writer model retry failed for target %s", target.target_id
            )
            raise ListicleCompositionWriterError(str(exc)) from exc

        candidate = strip_generation_fence(retry_result.text)
        validation_errors = validate_generated_text(
            field_type=writer_target.field_type,
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
                duration_ms=_elapsed_ms(rt_start),
            )
        )

    fn_start = time.perf_counter()
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
                duration_ms=_elapsed_ms(fn_start),
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
            duration_ms=_elapsed_ms(fn_start),
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
