"""Writer execution, parsing, and validation for itinerary day blurbs."""

import logging
import re
import time
from uuid import uuid4

from fastapi import HTTPException

from app.shared.text import enforce_anti_ai_tells_markdown
from app.shared.model_calls import resolve
from app.shared.writer_invocation import WriterModelError

from .dependencies import EditorAssistDependencies
from .itinerary_composition_contracts import (
    ComposeDayBlurbResult,
    ComposeDayBlurbsRequest,
    ComposeDayBlurbsResponse,
    ComposeIntroStepEvent,
)
from .itinerary_day_blurb_prompt import (
    DayBlurbInputError,
    prepare_day_blurb_prompt,
)
from .listicle_writer_validation import (
    strip_generation_fence,
    validate_generated_text,
)

logger = logging.getLogger(__name__)

JOB = "editor.itinerary_day_blurb"

BLURB_ENVELOPE_PATTERN = re.compile(
    r"<<<BLURB:(?P<tid>[^>]+)>>>(?P<body>.*?)<<<END>>>", flags=re.S
)


def _compose_day_blurbs_impl(
    request: ComposeDayBlurbsRequest,
    dependencies: EditorAssistDependencies,
) -> ComposeDayBlurbsResponse:
    article_title = request.article_title.strip()
    location_label = request.location_label.strip()
    if not article_title:
        raise HTTPException(status_code=400, detail="article_title is required")
    if not location_label:
        raise HTTPException(status_code=400, detail="location_label is required")

    inputs_started = time.monotonic()
    try:
        prompt = prepare_day_blurb_prompt(request)
    except DayBlurbInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    stops = prompt.stops
    write_stops = prompt.write_stops
    steps: list[ComposeIntroStepEvent] = [
        ComposeIntroStepEvent(
            name="inputs",
            label="Collected day plan signal",
            status="ok" if prompt.intro_text else "warning",
            duration_ms=int((time.monotonic() - inputs_started) * 1000),
            details={
                "day_label": request.day_label,
                "list_tone": request.list_tone,
                "stop_count": len(stops),
                "write_count": len(write_stops),
                "context_only_count": len(stops) - len(write_stops),
                "intro_present": bool(prompt.intro_text),
                "plan_overview_present": bool(prompt.plan_overview),
                "has_prev_neighbor": request.prev_day_last_stop is not None,
                "has_next_neighbor": request.next_day_first_stop is not None,
                "stops_with_reason": sum(
                    1 for stop in write_stops if (stop.selection_reason or "").strip()
                ),
            },
        )
    ]

    # An operator's own choice, or None so the gateway decides.
    chosen_model = (request.model_name or "").strip() or None
    model_used = resolve(JOB, chosen_model)
    writer_started = time.monotonic()
    try:
        writer_result = dependencies.invoke_writer(
            job_id=JOB,
            prompt=prompt.text,
            model_name=model_used,
            max_tokens=8192,
            temperature=0.55,
        )
    except WriterModelError as exc:
        error_id = str(uuid4())
        logger.exception(
            "Editor assist compose-itinerary-day-blurbs failed | "
            "error_id=%s model=%s stops=%d write_stops=%d error=%s",
            error_id,
            model_used,
            len(stops),
            len(write_stops),
            exc,
        )
        raise HTTPException(
            status_code=502,
            detail=(
                "AI day-blurb composition request failed " f"(error {error_id}): {exc}"
            ),
        ) from exc

    raw_text = (writer_result.text or "").strip()
    parsed = {
        match.group("tid").strip(): match.group("body").strip()
        for match in BLURB_ENVELOPE_PATTERN.finditer(raw_text)
    }
    steps.append(
        ComposeIntroStepEvent(
            name="writer",
            label="Day composer model call",
            status="ok" if parsed else "failed",
            duration_ms=int((time.monotonic() - writer_started) * 1000),
            model=model_used,
            prompt=prompt.text,
            output=raw_text,
            details={"raw_chars": len(raw_text), "blocks_parsed": len(parsed)},
        )
    )
    if not parsed:
        raise HTTPException(
            status_code=502,
            detail="AI day-blurb composition returned no parseable blurbs",
        )

    results: dict[str, ComposeDayBlurbResult] = {}
    for stop in write_stops:
        body = parsed.get(stop.target_id, "").strip()
        if not body:
            results[stop.target_id] = ComposeDayBlurbResult(
                target_id=stop.target_id,
                status="error",
                validation_errors=["Composer returned no paragraph for this stop."],
            )
            steps.append(
                ComposeIntroStepEvent(
                    name=f"stop:{stop.target_id}",
                    label=f"{stop.title.strip()} — missing",
                    status="failed",
                    details={"reason": "no_block_for_target"},
                )
            )
            continue

        blurb = enforce_anti_ai_tells_markdown(
            strip_generation_fence(body),
            repair=lambda repair_prompt: dependencies.invoke_writer(
            job_id=JOB,
                prompt=repair_prompt,
                model_name=model_used,
                max_tokens=2048,
                temperature=0.2,
            ).text,
            context=f"editor_assist day blurb {stop.target_id}",
        )
        validation_errors = validate_generated_text(field_type="blurb", text=blurb)
        results[stop.target_id] = ComposeDayBlurbResult(
            target_id=stop.target_id,
            status="generated",
            markdown=blurb,
            validation_errors=validation_errors,
        )
        steps.append(
            ComposeIntroStepEvent(
                name=f"stop:{stop.target_id}",
                label=f"{stop.title.strip()} — blurb",
                status="warning" if validation_errors else "ok",
                model=model_used,
                output=blurb,
                details={
                    "chars": len(blurb),
                    "validation_errors": validation_errors,
                },
            )
        )

    generated = sum(1 for result in results.values() if result.status == "generated")
    steps.append(
        ComposeIntroStepEvent(
            name="finalize",
            label="Finalized day blurbs",
            status="ok" if generated else "failed",
            details={"generated": generated, "total": len(write_stops)},
        )
    )
    return ComposeDayBlurbsResponse(model_used=model_used, results=results, steps=steps)
