"""Operator-authored itinerary stop selection-reason composition."""

import logging

from fastapi import HTTPException

from app.shared.writer_invocation import WriterModelError

from .contracts import DEFAULT_MODEL
from .dependencies import EditorAssistDependencies
from .itinerary_composition_contracts import (
    ComposeStopReasonRequest,
    ComposeStopReasonResponse,
)
from .listicle_prompt_policy import LISTICLE_ANGLE_GUIDANCE
from .listicle_writer_validation import strip_generation_fence

logger = logging.getLogger(__name__)

COMPOSE_STOP_REASON_PROMPT = """You are refining an operator's rough note on why \
they chose a specific venue for a stop in a travel itinerary, so a later writer \
can build a blurb from it. The operator picked this stop by hand: their note is \
the substance. Keep their intent, sharpen the wording, and expand only enough to \
make it concrete and specific.

Write 1 to 2 sentences on this venue's draw and why it fits here. Match the \
register of an internal planning note: concrete about the venue, NOT scoring \
jargon, NOT reader-facing marketing prose. Do NOT write the blurb itself. Do NOT \
invent facts the operator did not give and that are not obvious from the venue's \
identity.

Return ONLY the refined reason text — no labels, quotes, or commentary."""


def _compose_stop_reason_impl(
    request: ComposeStopReasonRequest,
    dependencies: EditorAssistDependencies,
) -> ComposeStopReasonResponse:
    rough_reason = request.rough_reason.strip()
    title = request.title.strip()
    if not rough_reason:
        raise HTTPException(status_code=400, detail="rough_reason is required")
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    stop_tags = [
        tag.strip()
        for tag in (request.daypart, request.category)
        if tag and tag.strip()
    ]
    stop_descriptor = f"{title} [{' · '.join(stop_tags)}]" if stop_tags else title

    context_lines = [f"Stop: {stop_descriptor}"]
    angle = (request.angle or "").strip()
    if angle:
        angle_guidance = LISTICLE_ANGLE_GUIDANCE.get(angle)
        context_lines.append(
            f"Editorial angle — {angle}: {angle_guidance}"
            if angle_guidance
            else f"Editorial angle: {angle}"
        )
    article_title = (request.article_title or "").strip()
    if article_title:
        context_lines.append(f"Article title: {article_title}")
    location_label = (request.location_label or "").strip()
    if location_label:
        context_lines.append(f"Destination: {location_label}")
    plan_overview = (request.plan_overview or "").strip()
    if plan_overview:
        context_lines.append(f"Internal plan overview (the spine): {plan_overview}")

    llm_prompt = (
        f"{COMPOSE_STOP_REASON_PROMPT}\n\n"
        + "Context:\n"
        + "\n".join(context_lines)
        + f"\n\nOperator's rough note:\n{rough_reason}"
    )

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    try:
        writer_result = dependencies.invoke_writer(
            prompt=llm_prompt,
            model_name=model_used,
            max_tokens=1024,
            temperature=0.3,
        )
    except WriterModelError as exc:
        logger.exception("Editor assist compose-itinerary-stop-reason failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI stop-reason composition request failed",
        ) from exc

    reason = strip_generation_fence(writer_result.text or "").strip()
    if not reason:
        raise HTTPException(
            status_code=502,
            detail="AI stop-reason composition returned empty output",
        )

    return ComposeStopReasonResponse(reason=reason, model_used=model_used)
