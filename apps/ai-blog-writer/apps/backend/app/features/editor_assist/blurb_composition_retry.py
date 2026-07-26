"""Retry-prompt policy for failed listicle composition validation."""

from .angle_assignment import ListicleAngle
from .blurb_composition_contracts import (
    ListicleCompositionSettings,
    ListicleCompositionTarget,
)
from .blurb_composition_policy import WriterPromptPlan, to_listicle_writer_target
from .listicle_prompt_builders import build_lean_writer_prompt, build_writer_prompt
from .listicle_writer_contracts import (
    ListTone,
    ListicleArticleType,
    ListicleWriterTarget,
)
from .writer_brief_contracts import WriterBrief

_LEAN_INLINE_RETRY_CATEGORIES = {"nightlife"}
_LEAN_RETRY_BUILDER_CATEGORIES = {"dining", "accommodations", "attractions"}


def build_retry_prompt(
    *,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    target: ListicleWriterTarget,
    article_context: str,
    custom_instruction: str,
    current_output: str,
    validation_errors: list[str],
    list_tone: ListTone | None = None,
    listicle_angle: ListicleAngle | None = None,
    brief: WriterBrief | None = None,
) -> str:
    """Build a retry anchored on the same prompt shape as the first draft."""
    failures = "\n".join(f"- {item}" for item in validation_errors)
    if (
        target.field_type == "blurb"
        and target.category in _LEAN_RETRY_BUILDER_CATEGORIES
        and brief is not None
        and brief.is_usable
    ):
        base_prompt = build_lean_writer_prompt(
            category=target.category,
            article_title=article_title,
            article_type=article_type,
            article_location=article_location,
            target=target,
            brief=brief,
            custom_instruction=custom_instruction,
            list_tone=list_tone,
        )
    else:
        base_prompt = build_writer_prompt(
            article_title=article_title,
            article_type=article_type,
            article_location=article_location,
            target=target,
            article_context=article_context,
            custom_instruction=custom_instruction,
            list_tone=list_tone,
            listicle_angle=listicle_angle,
        )
    return (
        f"{base_prompt}\n\n"
        "REVISION TASK\n"
        "The previous draft did not pass validation. Rewrite it so it fully complies.\n\n"
        f"VALIDATION FAILURES\n{failures}\n\n"
        f"CURRENT DRAFT\n{current_output.strip()}\n\n"
        "Return only the corrected final paragraph."
    ).strip()


def build_retry_prompt_for_plan(
    *,
    settings: ListicleCompositionSettings,
    target: ListicleCompositionTarget,
    plan: WriterPromptPlan,
    candidate: str,
    validation_errors: list[str],
) -> str:
    if (
        plan.path == "lean"
        and plan.writer_brief is not None
        and plan.writer_brief.is_usable
        and target.category in _LEAN_INLINE_RETRY_CATEGORIES
    ):
        lean_target = to_listicle_writer_target(target)
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
