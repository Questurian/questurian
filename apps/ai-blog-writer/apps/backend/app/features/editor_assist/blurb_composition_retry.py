"""Retry-prompt policy for failed listicle composition validation."""

from .blurb_composition_contracts import (
    ListicleCompositionSettings,
    ListicleCompositionTarget,
)
from .blurb_composition_policy import WriterPromptPlan, to_listicle_writer_target
from .listicle_writer import build_lean_writer_prompt, build_retry_prompt

_LEAN_INLINE_RETRY_CATEGORIES = {"nightlife"}
_LEAN_RETRY_BUILDER_CATEGORIES = {"dining", "accommodations", "attractions"}


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
