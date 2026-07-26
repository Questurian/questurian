"""Prompt construction for Writer Brief curation."""

from __future__ import annotations

from .angle_assignment import ListicleAngle
from .listicle_prompt_policy import format_location_for_prompt
from .research_profile import ResearchProfile
from .writer_brief_contracts import MAX_SOURCE_FACTS, MIN_SOURCE_FACTS
from .writer_brief_policy import render_angle_directive_template


def format_research_profile_for_curator(profile: ResearchProfile) -> str:
    lines: list[str] = []
    selected = profile.selected_angle
    if selected.status == "supported" and selected.angle and selected.summary:
        lines.append(f"selected-angle ({selected.angle}): {selected.summary}")
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
    findings_block = format_research_profile_for_curator(research_profile)
    location = format_location_for_prompt(location_label)
    if angle_directive_template:
        starting_point = render_angle_directive_template(
            angle_directive_template, venue_name
        )
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


__all__ = ["build_curator_prompt", "format_research_profile_for_curator"]
