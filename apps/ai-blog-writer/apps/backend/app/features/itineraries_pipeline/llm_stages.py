"""LLM stages for Itinerary Autobuild: intent extraction, batched fit-scoring,
and reason/overview writing (ADR 0014/0015).

These are the only LLM-driven steps. Each prompts for JSON and parses defensively
— retrieval, selection and ordering are deterministic and live elsewhere.
"""

from __future__ import annotations

import logging
from typing import Any

from utils import parse_json_response

from app.features.editor_assist.writer_models import invoke_writer_model

from .schemas import (
    Candidate,
    Category,
    IntentSpec,
    PlanStop,
    ScoredCandidate,
)

logger = logging.getLogger(__name__)

VALID_CATEGORIES: tuple[Category, ...] = ("dining", "accommodations", "attractions", "nightlife")


def _complete(*, prompt: str, model_name: str, temperature: float, max_tokens: int) -> str:
    """Run one completion, routing ``claude*`` models to Anthropic and the rest to Vertex."""
    return invoke_writer_model(
        prompt=prompt,
        model_name=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
    ).text


# --- Intent -------------------------------------------------------------------

INTENT_PROMPT = """You are planning a travel itinerary. Read the title and brief and extract a \
structured query intent as JSON. Do not invent venues — only describe what to look for.

Title: {title}
Location: {location}
Brief: {brief}

Return ONLY a JSON object with these keys:
- "categories": array, any of ["dining","accommodations","attractions","nightlife"] that the trip needs
- "price_min": integer 1-4 or null (1=$, 4=$$$$). Use higher floors for "luxury/upscale/fine".
- "price_max": integer 1-4 or null
- "keywords": array of short lowercase descriptors to match against venue tags (e.g. ["fine dining","rooftop","tasting menu"])
- "wants_lodging": boolean (does the trip need a hotel anchor?)
- "stops_per_day": integer 1-8 (fewer for a relaxed pace, more for a packed day)
- "lodging_keywords": array of short descriptors for the hotel (e.g. ["luxury","comfortable","central"])
"""


def extract_intent(*, title: str, brief: str, location: str, model_name: str) -> IntentSpec:
    prompt = INTENT_PROMPT.format(title=title, location=location, brief=brief)
    # Tiny structured output (a few small arrays), but give it real headroom so a
    # verbose keyword list never truncates. Flash-Lite tops out at 65,536.
    raw = _complete(prompt=prompt, model_name=model_name, temperature=0.2, max_tokens=8192)
    parsed = parse_json_response(raw, raise_on_error=False, default={}) or {}
    if not parsed:
        logger.warning("Intent extraction returned unparseable JSON; using category defaults.")

    raw_categories = parsed.get("categories")
    categories: list[Category] = [c for c in VALID_CATEGORIES if isinstance(raw_categories, list) and c in raw_categories]
    if not categories:
        categories = ["dining", "attractions"]

    def _price(value: Any) -> int | None:
        try:
            n = int(value)
        except (TypeError, ValueError):
            return None
        return n if 1 <= n <= 4 else None

    def _str_list(value: Any) -> list[str]:
        return [s.strip() for s in value if isinstance(s, str) and s.strip()] if isinstance(value, list) else []

    stops = parsed.get("stops_per_day")
    try:
        stops_per_day = max(1, min(8, int(stops)))
    except (TypeError, ValueError):
        stops_per_day = 4

    return IntentSpec(
        categories=categories,
        price_min=_price(parsed.get("price_min")),
        price_max=_price(parsed.get("price_max")),
        keywords=_str_list(parsed.get("keywords")),
        wants_lodging=bool(parsed.get("wants_lodging", True)),
        stops_per_day=stops_per_day,
        lodging_keywords=_str_list(parsed.get("lodging_keywords")),
    )


# --- Fit scoring --------------------------------------------------------------

SCORING_PROMPT = """Score how well each venue matches the traveler's intent, 0-100. \
The same idea may be tagged differently across venues ("Fine Dining" ~ "Luxury" ~ "Upscale") — \
judge by meaning, not exact tag text. Price levels: 1=$ … 4=$$$$.

Intent:
- keywords: {keywords}
- price band: {price_min} to {price_max}
- brief: {brief}

Candidates ({category}):
{candidates}

Return ONLY a JSON object: {{"scores": [{{"id": <int>, "fit_score": <0-100>, "fit_note": "<one short phrase: the venue's draw and why it fits>"}}]}}
Include every candidate id exactly once."""


def _candidate_line(c: Candidate) -> str:
    price = f"${'$' * (c.price_level - 1)}" if c.price_level else "?"
    tags = ", ".join(c.tags[:12]) if c.tags else "—"
    return f'- id={c.id} | {c.title} | price={price} | type={c.type or "—"} | tags: {tags}'


def score_candidates(
    *,
    intent: IntentSpec,
    category: Category,
    candidates: list[Candidate],
    brief: str,
    model_name: str,
) -> list[ScoredCandidate]:
    if not candidates:
        return []
    prompt = SCORING_PROMPT.format(
        keywords=", ".join(intent.keywords) or "—",
        price_min=intent.price_min or "any",
        price_max=intent.price_max or "any",
        brief=brief,
        category=category,
        candidates="\n".join(_candidate_line(c) for c in candidates),
    )
    # One JSON object per candidate (~40-50 tokens each), scored over the WHOLE
    # category pool — a dense city can be hundreds of venues. 32,768 covers ~600+
    # candidates and still sits well under Gemini Flash's 65,536 output ceiling.
    raw = _complete(prompt=prompt, model_name=model_name, temperature=0.1, max_tokens=32768)
    parsed = parse_json_response(raw, raise_on_error=False, default={}) or {}
    if not parsed:
        logger.warning("Scoring for %s returned unparseable JSON; defaulting batch to fit=0.", category)
    scores = parsed.get("scores") if isinstance(parsed, dict) else None

    by_id: dict[int, dict[str, Any]] = {}
    if isinstance(scores, list):
        for entry in scores:
            if isinstance(entry, dict) and isinstance(entry.get("id"), int):
                by_id[entry["id"]] = entry

    result: list[ScoredCandidate] = []
    for c in candidates:
        entry = by_id.get(c.id, {})
        try:
            fit = max(0, min(100, int(entry.get("fit_score", 0))))
        except (TypeError, ValueError):
            fit = 0
        note = entry.get("fit_note")
        result.append(ScoredCandidate(candidate=c, fit_score=fit, fit_note=note if isinstance(note, str) else ""))
    return result


# --- Reasons + overview -------------------------------------------------------

REASONS_PROMPT = """You are documenting why each venue was chosen for a travel itinerary, \
so a later writer can build a blurb from it. Write concrete, specific reasons about the venue's \
draw and how it fits the brief — NOT scoring jargon. Do not write the blurb itself.

Title: {title}
Brief: {brief}

Itinerary (in order):
{plan}

Return ONLY a JSON object:
{{"overview": "<2-4 sentences on the overall shape and logic of the trip>",
  "reasons": [{{"id": <stop id int>, "reason": "<1-2 sentences: this venue's draw + why it fits here>"}}]}}
Include every stop id (and the lodging id if present) exactly once."""


def write_reasons(
    *,
    title: str,
    brief: str,
    lodging: ScoredCandidate | None,
    days: list[list[PlanStop]],
    model_name: str,
) -> tuple[dict[int, str], str]:
    """Returns ({item_id: reason}, plan_overview). Falls back to fit notes."""
    lines: list[str] = []
    if lodging is not None:
        lines.append(f'Lodging anchor: id={lodging.candidate.id} | {lodging.candidate.title}')
    for day_index, stops in enumerate(days, start=1):
        for stop in stops:
            lines.append(f'Day {day_index}: id={stop.item} | {stop.title} ({stop.collection})')

    if not lines:
        return {}, ""

    prompt = REASONS_PROMPT.format(title=title, brief=brief, plan="\n".join(lines))
    # One reason per stop (+lodging) plus an overview, on the premium writer. Even
    # a packed multi-day plan is well under this; 32,000 leaves Opus all the room
    # it needs without a 400 on the output cap.
    raw = _complete(prompt=prompt, model_name=model_name, temperature=0.4, max_tokens=32000)
    parsed = parse_json_response(raw, raise_on_error=False, default={}) or {}
    if not parsed:
        logger.warning("Reasons writing returned unparseable JSON; falling back to fit notes.")

    reasons: dict[int, str] = {}
    raw_reasons = parsed.get("reasons") if isinstance(parsed, dict) else None
    if isinstance(raw_reasons, list):
        for entry in raw_reasons:
            if isinstance(entry, dict) and isinstance(entry.get("id"), int):
                text = entry.get("reason")
                if isinstance(text, str) and text.strip():
                    reasons[entry["id"]] = text.strip()

    overview = parsed.get("overview") if isinstance(parsed, dict) else ""
    return reasons, overview.strip() if isinstance(overview, str) else ""
