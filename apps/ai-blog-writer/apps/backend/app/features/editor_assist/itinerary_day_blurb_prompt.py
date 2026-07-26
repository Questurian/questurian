"""Prompt preparation for sequence-aware itinerary day blurbs."""

from dataclasses import dataclass

from app.shared.prompts import ANTI_AI_TELLS_BLURB

from .itinerary_composition_contracts import (
    ComposeDayBlurbStop,
    ComposeDayBlurbsRequest,
)
from .listicle_prompt_policy import (
    BLURB_MAX_WORDS,
    BLURB_MIN_WORDS,
    LIST_TONE_GUIDANCE,
    LISTICLE_ANGLE_GUIDANCE,
)

COMPOSE_DAY_BLURBS_PROMPT = """You are an expert travel-editorial writer composing \
the per-stop copy for ONE day of a published listicle itinerary.

You will receive: the article title, the destination, the desired tone, the \
reader-facing intro that already opens the article, an optional internal plan \
overview, and this day's stops in order — each with its category, rough time of \
day, an optional editorial angle, and an optional internal "why this pick" note. \
Each stop is marked either [TO WRITE] or [ALREADY WRITTEN]. Stops marked \
[ALREADY WRITTEN] are shown with their existing copy and are context ONLY — you \
must not rewrite or re-emit them. You may also receive the adjacent day's edge \
stop for context only.

Write ONE paragraph of reader-facing copy for ONLY the [TO WRITE] stops, in the \
given order. Emit nothing for [ALREADY WRITTEN] stops or adjacent-day edge stops.

Narrative and texture:
- These blurbs are a sequence, not isolated reviews. Let each paragraph be aware \
of where it sits in the day: the morning stop opens the day, later stops can hand \
off from what came before ("after the cathedral, wander down to ...") using the \
time of day and order you are given.
- Thread every [TO WRITE] stop into the [ALREADY WRITTEN] copy around it: pick up \
the handoff the preceding stop offers and lead naturally toward the stop that \
follows, matching their voice. Reference them lightly — never restate, quote, or \
rewrite their copy.
- Stay consistent with the intro's framing and the plan overview's thesis, but do \
NOT repeat the intro or restate the trip premise in every blurb.
- Weave each stop's KEY HIGHLIGHTS into the prose (the standout dish, the view, \
the signature feature). Highlights are woven into the paragraph, never bulleted.
- Honor the stop's editorial angle when one is given.
- The "why this pick" notes and plan overview are INTERNAL planning notes, not \
reader copy. Transform them into natural prose, never quote or echo them.
- Adjacent-day edge stops and [ALREADY WRITTEN] stops are context only. Do NOT \
write copy for them.

Write for readers first and SEO second. Use natural travel-news language, avoid \
keyword stuffing, avoid repetitive SEO headings, and make the article feel edited \
by a human. Include SEO elements only where they improve clarity: a strong \
headline, concise subhead, clean section structure, accurate metadata, and \
natural keywords.

Hard rules per blurb:
- One paragraph of about {min_words} to {max_words} words. No heading, no \
subheading, no bullet points, no lists, no quotes. The stop's title is rendered \
elsewhere, so do not restate it as a label.
- Never mention reviews, reviewers, ratings, stars, or the research process. Do \
not invent details.
- Do not print literal day/stop labels ("Day 2, Stop 1:") in the prose.

Output envelope — emit EXACTLY one block per [TO WRITE] stop, copying each stop's \
id tag verbatim, and nothing else outside the blocks:
<<<BLURB:the_stop_id>>>
[the single paragraph for that stop]
<<<END>>>"""


class DayBlurbInputError(ValueError):
    """Raised when a valid HTTP shape cannot form a day-blurb request."""


@dataclass(frozen=True)
class DayBlurbPrompt:
    text: str
    stops: list[ComposeDayBlurbStop]
    write_stops: list[ComposeDayBlurbStop]
    intro_text: str
    plan_overview: str


def _format_day_blurb_stop_line(
    index: int, stop: ComposeDayBlurbStop, is_write: bool
) -> str:
    tags = [tag for tag in (stop.daypart, stop.category) if tag and tag.strip()]
    prefix = f"[{' · '.join(tag.strip() for tag in tags)}] " if tags else ""
    title = stop.title.strip()

    if not is_write:
        existing = (stop.existing_blurb or "").strip()
        body = (
            f"\n    Existing copy (context only, do NOT rewrite): {existing}"
            if existing
            else "\n    (Planned, not yet written — context only.)"
        )
        return f"{index}. id={stop.target_id} [ALREADY WRITTEN] {prefix}{title}{body}"

    angle = (stop.angle or "").strip()
    angle_guidance = LISTICLE_ANGLE_GUIDANCE.get(angle) if angle else None
    angle_suffix = (
        f"\n    Angle — {angle}: {angle_guidance}"
        if angle_guidance
        else (f"\n    Angle: {angle}" if angle else "")
    )
    reason = (stop.selection_reason or "").strip()
    reason_suffix = f"\n    Why this pick: {reason}" if reason else ""
    return (
        f"{index}. id={stop.target_id} [TO WRITE] {prefix}{title}"
        f"{angle_suffix}{reason_suffix}"
    )


def _resolve_stops(
    request: ComposeDayBlurbsRequest,
) -> tuple[list[ComposeDayBlurbStop], list[ComposeDayBlurbStop]]:
    stops = [stop for stop in request.stops if stop.title.strip()]
    if not stops:
        raise DayBlurbInputError(
            "Add at least one resolved stop before composing day blurbs."
        )

    if request.write_target_ids is None:
        write_ids = {stop.target_id for stop in stops}
    else:
        requested = {tid.strip() for tid in request.write_target_ids if tid.strip()}
        write_ids = {stop.target_id for stop in stops if stop.target_id in requested}
        if not write_ids:
            raise DayBlurbInputError(
                "None of the requested stops to write are in this day."
            )
    return stops, [stop for stop in stops if stop.target_id in write_ids]


def _neighbor_context(label: str, title: str, category: str | None) -> str:
    category_suffix = f" ({category.strip()})" if category and category.strip() else ""
    return f"{label}: {title.strip()}{category_suffix}"


def prepare_day_blurb_prompt(request: ComposeDayBlurbsRequest) -> DayBlurbPrompt:
    stops, write_stops = _resolve_stops(request)
    write_ids = {stop.target_id for stop in write_stops}
    context_lines = [
        f"Article title: {request.article_title.strip()}",
        f"Destination: {request.location_label.strip()}",
    ]
    if request.day_label and request.day_label.strip():
        context_lines.append(f"This day: {request.day_label.strip()}")
    if request.day_count:
        context_lines.append(f"Trip length: {request.day_count} day(s)")
    tone_guidance = (
        LIST_TONE_GUIDANCE.get(request.list_tone) if request.list_tone else None
    )
    if tone_guidance:
        context_lines.append(f"Tone — {request.list_tone}: {tone_guidance}")

    intro_text = (request.intro or "").strip()
    if intro_text:
        context_lines.append(
            f"Article intro (already written, for framing): {intro_text}"
        )
    plan_overview = (request.plan_overview or "").strip()
    if plan_overview:
        context_lines.append(f"Internal plan overview (the spine): {plan_overview}")
    if request.prev_day_last_stop:
        context_lines.append(
            _neighbor_context(
                "Previous day ended at (context only, do not write)",
                request.prev_day_last_stop.title,
                request.prev_day_last_stop.category,
            )
        )
    if request.next_day_first_stop:
        context_lines.append(
            _neighbor_context(
                "Next day opens at (context only, do not write)",
                request.next_day_first_stop.title,
                request.next_day_first_stop.category,
            )
        )

    stop_lines = [
        _format_day_blurb_stop_line(index + 1, stop, stop.target_id in write_ids)
        for index, stop in enumerate(stops)
    ]
    prompt = (
        COMPOSE_DAY_BLURBS_PROMPT.format(
            min_words=BLURB_MIN_WORDS, max_words=BLURB_MAX_WORDS
        )
        + "\n\nTrip context:\n"
        + "\n".join(context_lines)
        + "\n\nDay stops in order (write only [TO WRITE]):\n"
        + "\n".join(stop_lines)
        + f"\n\n{ANTI_AI_TELLS_BLURB}"
    )
    return DayBlurbPrompt(
        text=prompt,
        stops=stops,
        write_stops=write_stops,
        intro_text=intro_text,
        plan_overview=plan_overview,
    )
