"""Writer Brief curator.

Per ADR 0007, the nightlife writer no longer reads the Research Profile
directly. The Research Profile (cited evidence bundle, 11 potentially
overlapping buckets) is passed through a per-blurb curation step that emits a
Writer Brief: a venue-tailored angle directive plus a flat, deduped Source
Facts list (2-8 bullets) with bucket labels stripped.

This module owns the curation step: prompt building, LLM invocation,
JSON parsing, cap enforcement, and structured fallback signaling. The
non-grounded synthesis call is routed through Vertex (gemini-2.5-flash by
default) at low temperature.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from .angle_assignment import ListicleAngle
from .research_profile import ResearchProfile

logger = logging.getLogger(__name__)


# Per-angle directive templates, keyed by category. The {venue} placeholder is
# filled by the curator (or by deterministic fallback rendering) before the
# directive reaches the writer prompt. These are the venue-facing directives
# referenced in ADR 0007 (nightlife), ADR 0009 (dining), and ADR 0011
# (accommodations) — distinct from LISTICLE_ANGLE_GUIDANCE, which is the
# legacy model-facing instruction text still used by the fat-prompt categories
# (attractions, key_location).
ANGLE_DIRECTIVES_BY_CATEGORY: dict[str, dict[ListicleAngle, str]] = {
    "nightlife": {
        "best-for-night": (
            "Open by naming the kind of night {venue} is best for, and give one "
            "concrete reason rooted in the room, the drinks, the crowd, or the "
            "pacing."
        ),
    },
    "dining": {
        "signature-dish": (
            "Open by naming one specific dish at {venue} and one concrete "
            "reason it's worth ordering."
        ),
        "atmosphere": (
            "Open by placing the reader in the room at {venue} with one "
            "concrete physical detail — the light, the seating, the music, "
            "the crowd at a specific hour."
        ),
        "founders-backstory": (
            "Open by naming the person behind {venue} and one specific fact "
            "about them — where they trained, what they ran before, when "
            "they opened."
        ),
        "insider-tip": (
            "Open with one specific, actionable tip at {venue} a first-time "
            "visitor wouldn't guess — a time, a seat, an order, a side door."
        ),
        "best-for": (
            "Open by naming the occasion {venue} serves best, then one "
            "concrete reason rooted in the room, the menu, the pacing, or "
            "the price."
        ),
        "whats-different": (
            "Open by naming the specific thing that sets {venue} apart from "
            "neighboring options of the same kind — a technique, a sourcing "
            "choice, a format."
        ),
    },
    "accommodations": {
        "location-and-setting": (
            "Open by placing {venue} in its physical setting with one "
            "concrete geographic anchor — the bay, the ridge, the named "
            "neighborhood, what's on either side. No 'centrally located'."
        ),
        "view-and-vista": (
            "Open by naming what guests actually see from {venue} — the "
            "specific sightline, which rooms or spaces it's from, one "
            "concrete fact about it."
        ),
        "design-and-aesthetic": (
            "Open by describing one concrete material, named space, or "
            "design choice at {venue} — the lobby, the restaurant, the pool "
            "deck, or the rooms, whichever carries the strongest identity."
        ),
        "signature-amenity": (
            "Open by naming the one standalone feature that defines a stay "
            "at {venue} — the rooftop hammam, the private beach club, the "
            "library — and one concrete fact about it."
        ),
        "food-and-beverage": (
            "Open by naming a specific on-site restaurant, bar, breakfast, "
            "or rooftop at {venue} and one concrete fact — the chef, the "
            "cuisine, the cocktail program, the hours."
        ),
        "trip-fit": (
            "Open by naming the kind of trip {venue} serves best — a "
            "honeymoon, a long remote-work stay, a family with toddlers, a "
            "solo business swing — and one concrete reason rooted in the "
            "rooms, the service, or the property's rhythm."
        ),
        "property-backstory": (
            "Open by naming the owner, designer, or origin year of {venue} "
            "and one specific fact — a former use of the building, the "
            "architect, the family that runs it."
        ),
        "booking-tip": (
            "Open with one specific, actionable booking or stay tip for "
            "{venue} a first-time guest wouldn't guess — a room to request, "
            "a night of the week, an arrival window."
        ),
        "whats-different": (
            "Open by naming the specific thing that sets {venue} apart from "
            "neighboring properties of the same kind — a design choice, a "
            "service rhythm, a location format, a hybrid concept."
        ),
    },
}

MIN_SOURCE_FACTS = 2
MAX_SOURCE_FACTS = 8

_JSON_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.S | re.I)


@dataclass(frozen=True)
class SourceFact:
    fact: str
    citations: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class WriterBrief:
    angle_directive: str
    source_facts: list[SourceFact]
    angle: ListicleAngle | None
    venue: str

    @property
    def is_usable(self) -> bool:
        return bool(self.angle_directive) and len(self.source_facts) >= MIN_SOURCE_FACTS


@dataclass(frozen=True)
class WriterBriefTrace:
    prompt: str
    raw_response: str = ""
    model: str = ""
    error: str | None = None
    parser_dropped_reason: str | None = None


def _format_research_profile_for_curator(profile: ResearchProfile) -> str:
    lines: list[str] = []
    selected = profile.selected_angle
    if selected.status == "supported" and selected.angle and selected.summary:
        lines.append(
            f"selected-angle ({selected.angle}): {selected.summary}"
        )
    for bucket, findings in profile.standard_buckets.items():
        for finding in findings:
            lines.append(f"{bucket}: {finding.summary}")
    return "\n".join(f"- {line}" for line in lines) if lines else "(no findings)"


def build_curator_prompt(
    *,
    venue_name: str,
    location_label: str,
    category: str,
    angle: ListicleAngle | None,
    angle_directive_template: str | None,
    research_profile: ResearchProfile,
) -> str:
    # Deferred to avoid a circular import (listicle_writer imports WriterBrief).
    from .listicle_writer import format_location_for_prompt

    findings_block = _format_research_profile_for_curator(research_profile)
    location = format_location_for_prompt(location_label)
    if angle_directive_template:
        starting_point = angle_directive_template.replace("{venue}", venue_name)
        directive_block = (
            "Angle directive starting point (rewrite when the findings warrant a sharper opening):\n"
            f"{starting_point}"
        )
    else:
        directive_block = (
            "Angle directive starting point: write a one-line directive that names "
            f"{venue_name} and opens the blurb with one concrete reason this venue "
            "belongs in the list."
        )
    return (
        "You are curating a Writer Brief for one travel listicle blurb. Compress "
        "the research findings into a deduped Source Facts list and write a "
        f"venue-tailored angle directive.\n\n"
        f"Venue: {venue_name}, {location}\n"
        f"Category: {category}\n"
        f"Angle: {angle or 'none'}\n\n"
        f"{directive_block}\n\n"
        "Research findings:\n"
        f"{findings_block}\n\n"
        "Return one JSON object only. No code fences, no commentary.\n\n"
        "Shape:\n"
        "{\n"
        '  "angle_directive": "...",\n'
        '  "source_facts": [\n'
        '    { "fact": "...", "citations": ["https://..."] }\n'
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        f"- {MIN_SOURCE_FACTS} to {MAX_SOURCE_FACTS} source_facts. Use what you have; don't pad, don't invent.\n"
        "- Findings may overlap across buckets. Collapse to one fact.\n"
        "- Strip bucket labels from fact text.\n"
        "- Drop database-field noise (exact hours, square meters, age ranges) unless central to the angle.\n"
        "- Preserve citations per fact, merged from the source findings.\n"
        "- Prefer facts that serve the angle's lead shape; supporting texture is fine but should not dominate.\n"
        "- The angle_directive must read as a finished sentence about the venue, not a template."
    )


def _extract_json(text: str) -> Any:
    candidate = text.strip()
    fenced = _JSON_FENCE_RE.match(candidate)
    if fenced:
        candidate = fenced.group(1).strip()
    try:
        return json.loads(candidate)
    except (ValueError, TypeError):
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(candidate[start : end + 1])
            except (ValueError, TypeError):
                return None
        return None


def _render_template_fallback(template: str | None, venue_name: str) -> str:
    if not template:
        return ""
    return template.replace("{venue}", venue_name)


def parse_writer_brief_response(
    *,
    raw_text: str,
    venue_name: str,
    angle: ListicleAngle | None,
    angle_directive_template: str | None,
) -> tuple[WriterBrief, str | None]:
    """Parse a curator JSON response into a WriterBrief.

    Returns (brief, drop_reason). If the response cannot yield a usable brief
    the caller should fall back to the identity-only writer path.
    """
    parsed = _extract_json(raw_text)
    drop_reasons: list[str] = []

    fallback_directive = _render_template_fallback(angle_directive_template, venue_name)

    if not isinstance(parsed, dict):
        return (
            WriterBrief(
                angle_directive=fallback_directive,
                source_facts=[],
                angle=angle,
                venue=venue_name,
            ),
            "response was not a JSON object",
        )

    directive_raw = parsed.get("angle_directive")
    if isinstance(directive_raw, str) and directive_raw.strip():
        directive = directive_raw.strip().replace("{venue}", venue_name)
    else:
        drop_reasons.append("angle_directive missing; fell back to template")
        directive = fallback_directive

    facts_raw = parsed.get("source_facts")
    cleaned: list[SourceFact] = []
    if isinstance(facts_raw, list):
        for entry in facts_raw:
            if len(cleaned) >= MAX_SOURCE_FACTS:
                drop_reasons.append(
                    f"source_facts capped at {MAX_SOURCE_FACTS}; extras dropped"
                )
                break
            if not isinstance(entry, dict):
                drop_reasons.append("source_facts entry not an object")
                continue
            fact_raw = entry.get("fact")
            if not isinstance(fact_raw, str) or not fact_raw.strip():
                drop_reasons.append("source_facts entry missing fact text")
                continue
            citations_raw = entry.get("citations")
            citations = (
                [
                    citation.strip()
                    for citation in citations_raw
                    if isinstance(citation, str) and citation.strip()
                ]
                if isinstance(citations_raw, list)
                else []
            )
            cleaned.append(SourceFact(fact=fact_raw.strip(), citations=citations))
    else:
        drop_reasons.append("source_facts missing or not a list")

    return (
        WriterBrief(
            angle_directive=directive,
            source_facts=cleaned,
            angle=angle,
            venue=venue_name,
        ),
        "; ".join(drop_reasons) if drop_reasons else None,
    )


def _invoke_curator_model(
    *,
    prompt: str,
    model_name: str,
    max_tokens: int,
    temperature: float,
) -> tuple[str, str]:
    """Call the Vertex synthesis model. Returns (raw_text, resolved_model_name)."""
    from utils import get_vertex_llm  # type: ignore

    llm = get_vertex_llm(
        temperature=temperature,
        max_tokens=max_tokens,
        model_name=model_name,
    )
    raw = llm.invoke(prompt)
    text = raw if isinstance(raw, str) else str(raw)
    return text, model_name


def run_writer_brief(
    *,
    venue_name: str,
    location_label: str,
    category: str,
    angle: ListicleAngle | None,
    research_profile: ResearchProfile,
    model_name: str = "gemini-2.5-flash",
    max_tokens: int = 10240,
    temperature: float = 0.1,
) -> tuple[WriterBrief, WriterBriefTrace]:
    """Run the curator for a single blurb. Returns (brief, trace).

    The caller is responsible for checking `brief.is_usable` and falling back
    to the identity-only writer path when the curator could not produce a
    Writer Brief with at least MIN_SOURCE_FACTS facts.
    """
    category_directives = ANGLE_DIRECTIVES_BY_CATEGORY.get(category, {})
    angle_directive_template = (
        category_directives.get(angle) if angle is not None else None
    )
    prompt = build_curator_prompt(
        venue_name=venue_name,
        location_label=location_label,
        category=category,
        angle=angle,
        angle_directive_template=angle_directive_template,
        research_profile=research_profile,
    )

    try:
        raw_text, resolved_model = _invoke_curator_model(
            prompt=prompt,
            model_name=model_name,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Writer Brief curator call failed for venue %r", venue_name)
        fallback_directive = _render_template_fallback(angle_directive_template, venue_name)
        return (
            WriterBrief(
                angle_directive=fallback_directive,
                source_facts=[],
                angle=angle,
                venue=venue_name,
            ),
            WriterBriefTrace(
                prompt=prompt,
                model=model_name,
                error=f"curator call raised: {exc!r}",
            ),
        )

    if not raw_text.strip():
        fallback_directive = _render_template_fallback(angle_directive_template, venue_name)
        return (
            WriterBrief(
                angle_directive=fallback_directive,
                source_facts=[],
                angle=angle,
                venue=venue_name,
            ),
            WriterBriefTrace(
                prompt=prompt,
                raw_response=raw_text,
                model=resolved_model,
                error="curator returned empty text",
            ),
        )

    brief, drop_reason = parse_writer_brief_response(
        raw_text=raw_text,
        venue_name=venue_name,
        angle=angle,
        angle_directive_template=angle_directive_template,
    )
    return brief, WriterBriefTrace(
        prompt=prompt,
        raw_response=raw_text,
        model=resolved_model,
        parser_dropped_reason=drop_reason,
    )


def render_source_facts_block(brief: WriterBrief) -> str:
    """Render the Source Facts bullet list for the writer prompt.

    Citations are intentionally omitted from the writer-facing text; they live
    only in the inspector trace.
    """
    if not brief.source_facts:
        return ""
    bullets = "\n".join(f"- {entry.fact}" for entry in brief.source_facts)
    return f"Source facts (use only what you need):\n{bullets}"
