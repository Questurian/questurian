"""Section-plan normalization and scope guards for the v3 outline stage.

Everything here is pure. The plan is checked against the approved work order
and the exact evidence records before any prose exists, so scope drift and
unsupported sections are caught while they are still cheap to reject.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from ..support import _safe_dict, _safe_int, _safe_str

MIN_OUTLINE_SECTIONS = 3
MAX_OUTLINE_SECTIONS = 12


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_safe_str(item) for item in value if _safe_str(item)]


def _sanitize_section(raw: Any) -> dict[str, Any] | None:
    record = _safe_dict(raw)
    heading = _safe_str(record.get("heading"))
    if not heading:
        return None
    return {
        "heading": heading,
        "purpose": _safe_str(record.get("purpose")) or "Purpose not stated.",
        "claim_ids": _string_list(record.get("claim_ids")),
        "requirement_ids": _string_list(record.get("requirement_ids")),
        "target_words": max(0, _safe_int(record.get("target_words"), default=0)),
    }


def sanitize_v3_outline(parsed: dict[str, Any]) -> dict[str, Any]:
    sections_raw = parsed.get("sections")
    sections: list[dict[str, Any]] = []
    if isinstance(sections_raw, list):
        for item in sections_raw[:MAX_OUTLINE_SECTIONS]:
            section = _sanitize_section(item)
            if section:
                sections.append(section)

    return {
        "working_title": _safe_str(parsed.get("working_title")),
        "direct_answer_focus": _safe_str(parsed.get("direct_answer_focus")),
        "sections": sections,
        "takeaway_focus": _safe_str(parsed.get("takeaway_focus")),
        "brief_alignment": _safe_str(parsed.get("brief_alignment"))
        or "Brief alignment not stated.",
        "unsupported_requirements": _string_list(
            parsed.get("unsupported_requirements")
        ),
    }


def _mentions(text: str, name: str) -> bool:
    def normalize(value: str) -> str:
        decomposed = unicodedata.normalize("NFKD", value)
        unaccented = "".join(
            character
            for character in decomposed
            if not unicodedata.combining(character)
        )
        return " ".join(unaccented.casefold().split())

    normalized_text = normalize(text)
    # A work order stores geography canonically (for example, "Medellín,
    # Colombia") while natural headings use the locality alone. The leading
    # comma-delimited name is a valid shorthand; country alone is not.
    full_name = normalize(name)
    locality = normalize(name.split(",", maxsplit=1)[0])
    candidates = {candidate for candidate in (full_name, locality) if candidate}
    return any(
        re.search(rf"(?<!\w){re.escape(candidate)}(?!\w)", normalized_text)
        for candidate in candidates
    )


def validate_v3_outline(
    outline: dict[str, Any],
    *,
    work_order: dict[str, Any],
    claim_ids: set[str],
    requirement_ids: set[str],
    target_word_count: int,
) -> tuple[bool, dict[str, Any]]:
    """Check a plan against the work order's scope and the real evidence.

    A plan that drifts is discarded rather than fed to compose: an outline that
    organizes the article around a context-only place, or that cites a claim
    the evidence does not contain, would put the drift into the prose.
    """
    sections = outline.get("sections") or []
    planned_words = sum(_safe_int(s.get("target_words"), default=0) for s in sections)

    within_budget = True
    if target_word_count > 0 and planned_words > 0:
        tolerance = max(200, int(target_word_count * 0.35))
        within_budget = abs(planned_words - target_word_count) <= tolerance

    unknown_claim_ids = sorted(
        {
            claim_id
            for section in sections
            for claim_id in section["claim_ids"]
            if claim_id not in claim_ids
        }
    )
    unknown_requirement_ids = sorted(
        {
            requirement_id
            for section in sections
            for requirement_id in section["requirement_ids"]
            if requirement_id not in requirement_ids
        }
    )

    scope = _safe_dict(work_order.get("scope"))
    references = scope.get("references") or []
    context_only = [
        _safe_str(reference.get("name"))
        for reference in references
        if reference.get("role") == "context_only"
    ]
    context_only_headings = sorted(
        {
            section["heading"]
            for section in sections
            for name in context_only
            if name and _mentions(section["heading"], name)
        }
    )
    primary_subject = _safe_str(work_order.get("primary_subject"))
    # A well-built outline often names the subject once in its framing and then
    # relies on subject-specific detail in the sections ("El Poblado", "Museo de
    # Antioquia") rather than repeating the city in every heading. Genuine drift
    # still fails this, because a plan about another subject names that subject
    # in its framing too.
    subject_fields = [
        _safe_str(outline.get("working_title")),
        _safe_str(outline.get("direct_answer_focus")),
        _safe_str(outline.get("takeaway_focus")),
        _safe_str(outline.get("brief_alignment")),
        *(
            value
            for section in sections
            for value in (section["heading"], section["purpose"])
        ),
    ]
    covers_primary_subject = not primary_subject or any(
        _mentions(value, primary_subject) for value in subject_fields
    )

    checks = {
        "enough_sections": len(sections) >= MIN_OUTLINE_SECTIONS,
        "headings_unique": len({s["heading"].casefold() for s in sections})
        == len(sections),
        "within_word_budget": within_budget,
        "claims_resolve": not unknown_claim_ids,
        "requirements_resolve": not unknown_requirement_ids,
        # A context-only place may be discussed inside a section; it may never
        # be what a section is about.
        "no_context_only_sections": not context_only_headings,
        "covers_primary_subject": covers_primary_subject,
    }
    diagnostics = {
        **checks,
        "section_count": len(sections),
        "planned_word_count": planned_words,
        "target_word_count": target_word_count,
        "unknown_claim_ids": unknown_claim_ids,
        "unknown_requirement_ids": unknown_requirement_ids,
        "context_only_headings": context_only_headings,
    }
    return all(checks.values()), diagnostics


def drop_context_only_sections(
    outline: dict[str, Any], headings: list[str]
) -> dict[str, Any]:
    """Remove the sections a context-only place was organising, keep the rest.

    Rejecting the whole plan for one bad heading was throwing away six good
    sections to stop one, and it did not even stop it: run b29d66b4 lost its
    entire outline over a single heading about a ranking that does not exist,
    wrote its article with no plan, and discussed the ranking anyway. Dropping
    the section is what the check actually wanted -- that section never reaches
    compose -- and it costs nothing and asks no model.

    The dropped word budget is spread across what remains, or the repaired plan
    would fail `within_word_budget` for the crime of being repaired.
    """
    unwanted = {heading.casefold() for heading in headings}
    kept = [
        section
        for section in outline.get("sections") or []
        if section["heading"].casefold() not in unwanted
    ]
    if not kept:
        return {**outline, "sections": []}

    dropped_words = sum(
        _safe_int(section.get("target_words"), default=0)
        for section in outline.get("sections") or []
        if section["heading"].casefold() in unwanted
    )
    share, remainder = divmod(dropped_words, len(kept))
    repaired = []
    for index, section in enumerate(kept):
        extra = share + (1 if index < remainder else 0)
        repaired.append(
            {
                **section,
                "target_words": _safe_int(section.get("target_words"), default=0)
                + extra,
            }
        )
    return {**outline, "sections": repaired}


def outline_focus_only(outline: dict[str, Any]) -> dict[str, Any]:
    """What survives when the sections cannot be used.

    `direct_answer_focus` and `takeaway_focus` are separately valid and are the
    most valuable lines the outline produces -- b29d66b4's named the one stall
    to send the reader to, with its survival caveat, and it was deleted along
    with the sections over an unrelated heading. A bad heading is not a reason
    to throw away the answer.
    """
    return {
        "working_title": _safe_str(outline.get("working_title")),
        "direct_answer_focus": _safe_str(outline.get("direct_answer_focus")),
        "sections": [],
        "takeaway_focus": _safe_str(outline.get("takeaway_focus")),
        "brief_alignment": "Brief alignment not stated.",
        "unsupported_requirements": [],
    }


def format_v3_outline_for_prompt(outline: dict[str, Any]) -> str:
    """Render a validated plan as the section brief compose writes against."""
    sections = outline.get("sections") or []
    if not sections:
        # A plan whose sections were unusable can still carry the answer and
        # the takeaway. Handing compose nothing at all is how b29d66b4 came
        # back at 502 words against an 800 floor.
        focus = _safe_str(outline.get("direct_answer_focus"))
        takeaway = _safe_str(outline.get("takeaway_focus"))
        salvaged = []
        if focus:
            salvaged.append(f"Direct answer near the top should cover: {focus}")
        if takeaway:
            salvaged.append(f"The takeaways should land: {takeaway}")
        opening = (
            "No usable section plan was produced. Structure the article from "
            "the approved brief and the evidence records only."
        )
        return "\n\n".join([opening, *salvaged])

    lines: list[str] = []
    direct_answer = _safe_str(outline.get("direct_answer_focus"))
    if direct_answer:
        lines.append(f"Direct answer near the top should cover: {direct_answer}")
        lines.append("")

    lines.append("Planned sections (use these as the `##` headings, in order):")
    for index, section in enumerate(sections, start=1):
        target = section.get("target_words") or 0
        budget = f" (~{target} words)" if target else ""
        claims = ", ".join(section["claim_ids"]) or "none"
        requirements = ", ".join(section["requirement_ids"]) or "none"
        lines.append(f"{index}. {section['heading']}{budget}")
        lines.append(f"   Purpose: {section['purpose']}")
        lines.append(f"   Evidence claims: {claims}")
        lines.append(f"   Requirements served: {requirements}")

    takeaway = _safe_str(outline.get("takeaway_focus"))
    if takeaway:
        lines.append("")
        lines.append(f"Closing takeaways should land on: {takeaway}")

    unsupported = outline.get("unsupported_requirements") or []
    if unsupported:
        lines.append("")
        lines.append(
            "The evidence does not support the following. Say so plainly "
            "rather than inventing detail:"
        )
        lines.extend(f"- {item}" for item in unsupported)

    return "\n".join(lines)
