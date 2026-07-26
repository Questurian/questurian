"""Prompt construction for grounded Research Profiles."""

from __future__ import annotations

from .angle_assignment import ListicleAngle
from .research_profile_contracts import (
    CATEGORY_BUCKET_PRIORITIES,
    STANDARD_RESEARCH_BUCKETS,
)


def build_research_profile_prompt(
    *,
    venue_name: str,
    location_label: str,
    category: str,
    requested_angle: ListicleAngle | None,
) -> str:
    bucket_list = "\n".join(f'  - "{bucket}"' for bucket in STANDARD_RESEARCH_BUCKETS)
    priority = CATEGORY_BUCKET_PRIORITIES.get(category, ())
    priority_line = ", ".join(priority) if priority else "none"
    angle_line = (
        f'Research selected angle "{requested_angle}" and decide whether it is supported.'
        if requested_angle
        else "No angle is selected. Do not evaluate angle framing; gather standard buckets only."
    )
    selected_angle_shape = (
        '{ "angle": "selected-angle", "status": "supported|weak|unsupported", '
        '"summary": "one short writer-ready finding when supported", '
        '"citations": ["https://..."], "reason": "short explanation" }'
        if requested_angle
        else '{ "angle": null, "status": "not-requested", "summary": "", "citations": [], "reason": "" }'
    )
    return (
        "You are building a cited Research Profile for one travel listicle blurb.\n\n"
        f"Venue: {venue_name}\n"
        f"Location: {location_label}\n"
        f"Category: {category}\n\n"
        f"{angle_line}\n"
        "Use web search. Return facts only when backed by URLs you actually consulted. "
        "Do not write blurb prose.\n\n"
        "Standard Research Buckets:\n"
        f"{bucket_list}\n\n"
        f"Category priorities: {priority_line}. Keep low-signal buckets empty rather than padded.\n\n"
        "Bucket boundaries:\n"
        "- best-for means audience/use-case evidence, not angle framing.\n"
        "- timing-tips means practical timing facts, not an insider-tip lead.\n"
        "- visual-assets means visual details for prose only, not media selection.\n"
        "- caveats-or-fit-warnings must be factual and restrained.\n"
        "- standout-hook is strongest concise fact found, but must not override the selected angle.\n\n"
        "Output one JSON object only, no code fences, with this shape:\n"
        "{\n"
        f'  "selected_angle": {selected_angle_shape},\n'
        '  "standard_buckets": {\n'
        '    "bucket-name": [{ "summary": "one short finding", "citations": ["https://..."] }]\n'
        "  },\n"
        '  "warnings": ["optional warning"]\n'
        "}\n\n"
        "Rules:\n"
        "- Every selected-angle supported finding requires citations.\n"
        "- Every bucket finding requires citations; uncited findings are invalid.\n"
        "- Each bucket may return zero, one, or two findings.\n"
        "- If selected angle is weak or unsupported, explain why in reason and do not provide a leading summary.\n"
        "- If no angle is selected, selected_angle.status must be not-requested."
    )


__all__ = ["build_research_profile_prompt"]
