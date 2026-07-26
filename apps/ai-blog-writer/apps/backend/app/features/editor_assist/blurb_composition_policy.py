"""Writer prompt-path policy for listicle composition."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .angle_assignment import LEAN_PROMPT_CATEGORIES
from .blurb_composition_contracts import (
    ListicleCompositionSettings,
    ListicleCompositionTarget,
)
from .listicle_writer import (
    ListicleWriterTarget,
    build_identity_only_writer_prompt,
    build_lean_writer_prompt,
    build_writer_prompt,
)
from .research_profile import ResearchProfile
from .writer_brief import WriterBrief


@dataclass(frozen=True)
class WriterPromptPlan:
    prompt: str
    writer_target: ListicleWriterTarget
    path: Literal["lean", "identity", "legacy"]
    writer_brief: WriterBrief | None = None


def uses_lean_prompt(
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


def to_listicle_writer_target(
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


def select_writer_prompt(
    *,
    settings: ListicleCompositionSettings,
    target: ListicleCompositionTarget,
    writer_target: ListicleWriterTarget,
    is_blurb: bool,
    use_lean_prompt: bool,
    research_profile: ResearchProfile | None,
    writer_brief: WriterBrief | None,
) -> WriterPromptPlan:
    if use_lean_prompt and writer_brief is not None and writer_brief.is_usable:
        lean_target = to_listicle_writer_target(target)
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
        return WriterPromptPlan(
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
        return WriterPromptPlan(
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
        return WriterPromptPlan(
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
    return WriterPromptPlan(prompt=prompt, writer_target=writer_target, path="legacy")
