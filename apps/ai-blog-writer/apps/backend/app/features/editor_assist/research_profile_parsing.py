"""Sanitize and parse grounded Research Profile responses."""

from __future__ import annotations

import re
from typing import Any

from utils import parse_json_response

from .angle_assignment import ListicleAngle
from .research_profile_contracts import (
    STANDARD_RESEARCH_BUCKETS,
    ResearchFinding,
    ResearchProfile,
    SelectedAngleEvidence,
    empty_buckets,
    fallback_profile,
    has_usable_bucket_evidence,
)

_VALID_SELECTED_STATUSES = {"supported", "weak", "unsupported", "not-requested"}
_BUCKET_SET = set(STANDARD_RESEARCH_BUCKETS)

# Grounded models sometimes drop prose, sentence fragments, or empty strings
# into the citations array. We only trust entries that look like URLs.
_URL_RE = re.compile(r"^https?://\S+$", re.I)

# Inline Google-grounding markers like "[3]", "[3, 9, 10, 13]", or
# "[3, 9-12]" sometimes leak into summary text. Strip them before
# storing — the writer should never see grounded-response marker syntax.
_INLINE_CITATION_MARKER_RE = re.compile(r"\s*\[\s*\d+(?:\s*[,\-]\s*\d+)*\s*\]")


def clean_citations(raw: Any) -> list[str]:
    """Keep only entries that look like URLs. Drop prose contamination."""
    if not isinstance(raw, list):
        return []
    cleaned: list[str] = []
    for entry in raw:
        if not isinstance(entry, str):
            continue
        candidate = entry.strip()
        if _URL_RE.match(candidate):
            cleaned.append(candidate)
    return cleaned


def clean_summary(raw: Any) -> str:
    if not isinstance(raw, str):
        return ""
    stripped = _INLINE_CITATION_MARKER_RE.sub("", raw)
    # Collapse repeated whitespace introduced by marker removal.
    return re.sub(r"\s{2,}", " ", stripped).strip()


def extract_json(text: str) -> Any:
    try:
        return parse_json_response(text)
    except (RuntimeError, TypeError):
        return None


def parse_research_profile_response(
    *,
    raw_text: str,
    requested_angle: ListicleAngle | None,
) -> tuple[ResearchProfile, str | None]:
    parsed = extract_json(raw_text)
    if not isinstance(parsed, dict):
        return (
            fallback_profile(
                requested_angle, warning="Research Profile response was not JSON."
            ),
            "response was not a JSON object",
        )

    drop_reasons: list[str] = []
    selected_raw = parsed.get("selected_angle")
    selected = SelectedAngleEvidence(
        angle=requested_angle,
        status="not-requested" if requested_angle is None else "unsupported",
    )
    if isinstance(selected_raw, dict):
        status = selected_raw.get("status")
        if status not in _VALID_SELECTED_STATUSES:
            drop_reasons.append(f"selected_angle invalid status {status!r}")
            status = "not-requested" if requested_angle is None else "unsupported"
        angle_value = selected_raw.get("angle")
        angle = requested_angle if requested_angle is not None else None
        if requested_angle is not None and angle_value not in {requested_angle, None}:
            drop_reasons.append(f"selected_angle unexpected angle {angle_value!r}")
        citations = clean_citations(selected_raw.get("citations"))
        summary = clean_summary(selected_raw.get("summary"))
        reason = clean_summary(selected_raw.get("reason"))
        if requested_angle is None:
            status = "not-requested"
            angle = None
            summary = ""
            citations = []
        elif status == "supported" and (not summary or not citations):
            drop_reasons.append(
                "selected_angle supported without summary/citations; downgraded to unsupported"
            )
            status = "unsupported"
            summary = ""
            citations = []
        elif status != "supported":
            summary = ""
            citations = []
        selected = SelectedAngleEvidence(
            angle=angle,
            status=status,  # type: ignore[arg-type]
            summary=summary,
            citations=citations,
            reason=reason,
        )
    elif selected_raw is not None:
        drop_reasons.append("selected_angle was not an object")

    buckets = empty_buckets()
    raw_buckets = parsed.get("standard_buckets")
    if isinstance(raw_buckets, dict):
        for bucket_name, raw_findings in raw_buckets.items():
            if bucket_name not in _BUCKET_SET:
                drop_reasons.append(f"unknown bucket {bucket_name!r}")
                continue
            if not isinstance(raw_findings, list):
                drop_reasons.append(f"{bucket_name}: findings not an array")
                continue
            cleaned: list[ResearchFinding] = []
            for entry in raw_findings[:2]:
                if not isinstance(entry, dict):
                    drop_reasons.append(f"{bucket_name}: finding not an object")
                    continue
                summary = clean_summary(entry.get("summary"))
                citations = clean_citations(entry.get("citations"))
                if not summary:
                    drop_reasons.append(f"{bucket_name}: empty summary")
                    continue
                if not citations:
                    drop_reasons.append(
                        f"{bucket_name}: uncited finding dropped (no valid URL citations)"
                    )
                    continue
                cleaned.append(
                    ResearchFinding(
                        summary=summary,
                        citations=citations,
                    )
                )
            buckets[bucket_name] = cleaned  # type: ignore[index]
    elif raw_buckets is not None:
        drop_reasons.append("standard_buckets was not an object")

    warnings = (
        [
            warning.strip()
            for warning in parsed.get("warnings", [])
            if isinstance(warning, str) and warning.strip()
        ]
        if isinstance(parsed.get("warnings"), list)
        else []
    )

    if requested_angle and selected.status != "supported":
        warnings.append(f'Selected angle "{requested_angle}" lacked cited support.')

    usable_for_blurb = selected.status == "supported" or has_usable_bucket_evidence(
        buckets
    )
    return (
        ResearchProfile(
            selected_angle=selected,
            standard_buckets=buckets,
            usable_for_blurb=usable_for_blurb,
            warnings=warnings,
        ),
        "; ".join(drop_reasons) if drop_reasons else None,
    )


__all__ = [
    "clean_citations",
    "clean_summary",
    "extract_json",
    "parse_research_profile_response",
]
