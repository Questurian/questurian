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
    ShellSlot,
)

logger = logging.getLogger(__name__)

def _complete(*, prompt: str, model_name: str, temperature: float, max_tokens: int) -> str:
    """Run one completion, routing ``claude*`` models to Anthropic and the rest to Vertex."""
    return invoke_writer_model(
        prompt=prompt,
        model_name=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
    ).text


# --- Intent -------------------------------------------------------------------

INTENT_PROMPT = """You are planning a travel itinerary. Read the title and brief and extract \
creative search intent as JSON. Do not decide stop count, categories, dayparts, meal placement, \
or day structure — those come from the selected Day Shell. Whether the trip includes lodging is \
decided by the operator, not by you.

Title: {title}
Location: {location}
Brief: {brief}

Return ONLY a JSON object with these keys:
- "price_min": integer 1-4 or null (1=$, 4=$$$$). Use higher floors for "luxury/upscale/fine".
- "price_max": integer 1-4 or null
- "keywords": array of short lowercase descriptors to match against venue tags (e.g. ["fine dining","rooftop","tasting menu"])
- "lodging_keywords": array of short descriptors for the hotel (e.g. ["luxury","comfortable","central"])
"""


def extract_intent(
    *,
    title: str,
    brief: str,
    location: str,
    model_name: str,
    trace: dict[str, str] | None = None,
) -> IntentSpec:
    prompt = INTENT_PROMPT.format(title=title, location=location, brief=brief)
    # Tiny structured output (a few small arrays), but give it real headroom so a
    # verbose keyword list never truncates. Flash-Lite tops out at 65,536.
    raw = _complete(prompt=prompt, model_name=model_name, temperature=0.2, max_tokens=8192)
    if trace is not None:
        trace["prompt"] = prompt
        trace["output"] = raw
    parsed = parse_json_response(raw, raise_on_error=False, default={}) or {}
    if not parsed:
        logger.warning("Intent extraction returned unparseable JSON; using creative intent defaults.")

    def _price(value: Any) -> int | None:
        try:
            n = int(value)
        except (TypeError, ValueError):
            return None
        return n if 1 <= n <= 4 else None

    def _str_list(value: Any) -> list[str]:
        return [s.strip() for s in value if isinstance(s, str) and s.strip()] if isinstance(value, list) else []

    return IntentSpec(
        price_min=_price(parsed.get("price_min")),
        price_max=_price(parsed.get("price_max")),
        keywords=_str_list(parsed.get("keywords")),
        lodging_keywords=_str_list(parsed.get("lodging_keywords")),
    )


# --- Fit scoring --------------------------------------------------------------

SCORING_PROMPT = """Score how well each venue fills this exact Shell Slot, 0-100. \
The same idea may be tagged differently across venues ("Fine Dining" ~ "Luxury" ~ "Upscale") — \
judge by meaning, not exact tag text. Price levels: 1=$ … 4=$$$$.

Shell Slot:
- label: {slot_label}
- daypart: {daypart}
- acceptable collections: {acceptable_collections}
- preferred collections: {preferred_collections}
- intent tags: {slot_intent_tags}
- avoid tags: {slot_avoid_tags}

Intent:
- keywords: {keywords}
- price band: {price_min} to {price_max}
- brief: {brief}

Candidates:
{candidates}

Return ONLY a JSON object: {{"scores": [{{"id": <int>, "fit_score": <0-100>, "fit_note": "<one short phrase: the venue's draw and why it fits>"}}]}}
Include every candidate id exactly once. Penalize candidates that do not fit the Shell Slot even if they match the broader brief."""


def _candidate_line(c: Candidate) -> str:
    price = f"${'$' * (c.price_level - 1)}" if c.price_level else "?"
    tags = ", ".join(c.tags[:12]) if c.tags else "—"
    return f'- id={c.id} | {c.title} | collection={c.category} | price={price} | type={c.type or "—"} | tags: {tags}'


def score_candidates(
    *,
    intent: IntentSpec,
    slot: ShellSlot,
    candidates: list[Candidate],
    brief: str,
    model_name: str,
    trace: dict[str, str] | None = None,
) -> list[ScoredCandidate]:
    if not candidates:
        return []
    prompt = SCORING_PROMPT.format(
        slot_label=slot.label,
        daypart=slot.daypart,
        acceptable_collections=", ".join(slot.acceptable_collections),
        preferred_collections=", ".join(slot.preferred_collections) or "—",
        slot_intent_tags=", ".join(slot.intent_tags) or "—",
        slot_avoid_tags=", ".join(slot.avoid_tags) or "—",
        keywords=", ".join(intent.keywords) or "—",
        price_min=intent.price_min or "any",
        price_max=intent.price_max or "any",
        brief=brief,
        candidates="\n".join(_candidate_line(c) for c in candidates),
    )
    # One JSON object per candidate (~40-50 tokens each), scored over the WHOLE
    # category pool — a dense city can be hundreds of venues. 32,768 covers ~600+
    # candidates and still sits well under Gemini Flash's 65,536 output ceiling.
    raw = _complete(prompt=prompt, model_name=model_name, temperature=0.1, max_tokens=32768)
    if trace is not None:
        trace["prompt"] = prompt
        trace["output"] = raw
    parsed = parse_json_response(raw, raise_on_error=False, default={}) or {}
    if not parsed:
        logger.warning("Scoring for slot %s returned unparseable JSON; defaulting batch to fit=0.", slot.id)
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
Each stop belongs to a Shell Slot. Preserve that slot context in the reason.

Title: {title}
Brief: {brief}

Itinerary (in order):
{plan}

Return ONLY a JSON object:
{{"overview": "<2-4 sentences on the overall shape and logic of the trip>",
  "reasons": [{{"key": "<collection>:<id>", "reason": "<1-2 sentences: this venue's draw + why it fits here>"}}]}}
Include every key exactly once."""


def write_reasons(
    *,
    title: str,
    brief: str,
    lodging: ScoredCandidate | None,
    days: list[list[PlanStop]],
    model_name: str,
    trace: dict[str, str] | None = None,
) -> tuple[dict[str, str], str]:
    """Returns ({collection:item_id: reason}, plan_overview). Falls back to fit notes."""
    lines: list[str] = []
    if lodging is not None:
        lines.append(f'Lodging anchor: key=accommodations:{lodging.candidate.id} | {lodging.candidate.title}')
    for day_index, stops in enumerate(days, start=1):
        for stop in stops:
            lines.append(
                f'Day {day_index}: slot={stop.slot_label} ({stop.daypart}) | key={stop.collection}:{stop.item} | {stop.title}'
            )

    if not lines:
        return {}, ""

    prompt = REASONS_PROMPT.format(title=title, brief=brief, plan="\n".join(lines))
    # One reason per stop (+lodging) plus an overview, on the premium writer. Even
    # a packed multi-day plan is well under this; 32,000 leaves Opus all the room
    # it needs without a 400 on the output cap.
    raw = _complete(prompt=prompt, model_name=model_name, temperature=0.4, max_tokens=32000)
    if trace is not None:
        trace["prompt"] = prompt
        trace["output"] = raw
    parsed = parse_json_response(raw, raise_on_error=False, default={}) or {}
    if not parsed:
        logger.warning("Reasons writing returned unparseable JSON; falling back to fit notes.")

    reasons: dict[str, str] = {}
    raw_reasons = parsed.get("reasons") if isinstance(parsed, dict) else None
    if isinstance(raw_reasons, list):
        for entry in raw_reasons:
            if isinstance(entry, dict):
                raw_key = entry.get("key")
                if isinstance(raw_key, str) and raw_key.strip():
                    key = raw_key.strip()
                elif isinstance(entry.get("id"), int):
                    # Backward-compatible fallback for older model output.
                    key = str(entry["id"])
                else:
                    continue
                text = entry.get("reason")
                if isinstance(text, str) and text.strip():
                    reasons[key] = text.strip()

    overview = parsed.get("overview") if isinstance(parsed, dict) else ""
    return reasons, overview.strip() if isinstance(overview, str) else ""
