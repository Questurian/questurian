"""Writer-ready grounded research profile for one listicle blurb."""

from __future__ import annotations

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Literal

from .angle_assignment import ListicleAngle

logger = logging.getLogger(__name__)

SelectedAngleStatus = Literal["supported", "weak", "unsupported", "not-requested"]
ResearchBucketName = Literal[
    "reputation-summary",
    "specific-offerings",
    "experience-texture",
    "history-or-ownership",
    "practical-usefulness",
    "best-for",
    "standout-hook",
    "social-proof",
    "visual-assets",
    "caveats-or-fit-warnings",
    "timing-tips",
    "neighborhood-context",
    "crowd-and-vibe",
]

STANDARD_RESEARCH_BUCKETS: tuple[ResearchBucketName, ...] = (
    "reputation-summary",
    "specific-offerings",
    "experience-texture",
    "history-or-ownership",
    "practical-usefulness",
    "best-for",
    "standout-hook",
    "social-proof",
    "visual-assets",
    "caveats-or-fit-warnings",
    "timing-tips",
    "neighborhood-context",
    "crowd-and-vibe",
)

CATEGORY_BUCKET_PRIORITIES: dict[str, tuple[ResearchBucketName, ...]] = {
    "dining": (
        "specific-offerings",        # signature-dish
        "experience-texture",        # atmosphere
        "history-or-ownership",      # founders-backstory
        "standout-hook",             # insider-tip + whats-different
        "best-for",                  # best-for
        "social-proof",              # cross-angle reputation evidence
        "caveats-or-fit-warnings",   # cross-angle restraint
    ),
    "nightlife": (
        "experience-texture",
        "timing-tips",
        "best-for",
        "social-proof",
    ),
    "attractions": (
        "timing-tips",
        "standout-hook",
        "visual-assets",
        "caveats-or-fit-warnings",
    ),
    "accommodations": (
        "neighborhood-context",
        "specific-offerings",
        "experience-texture",
        "crowd-and-vibe",
        "best-for",
        "visual-assets",
        "caveats-or-fit-warnings",
    ),
}

_VALID_SELECTED_STATUSES = {"supported", "weak", "unsupported", "not-requested"}
_BUCKET_SET = set(STANDARD_RESEARCH_BUCKETS)


@dataclass(frozen=True)
class ResearchFinding:
    summary: str
    citations: list[str]


@dataclass(frozen=True)
class SelectedAngleEvidence:
    angle: ListicleAngle | None
    status: SelectedAngleStatus
    summary: str = ""
    citations: list[str] = field(default_factory=list)
    reason: str = ""


@dataclass(frozen=True)
class ResearchProfile:
    selected_angle: SelectedAngleEvidence
    standard_buckets: dict[ResearchBucketName, list[ResearchFinding]]
    usable_for_blurb: bool
    warnings: list[str] = field(default_factory=list)

    @property
    def effective_angle(self) -> ListicleAngle | None:
        if self.selected_angle.status == "supported":
            return self.selected_angle.angle
        return None

    @property
    def bucket_findings_count(self) -> int:
        return sum(len(findings) for findings in self.standard_buckets.values())

    @property
    def source_urls(self) -> list[str]:
        merged: list[str] = []
        seen: set[str] = set()
        groups = [self.selected_angle.citations]
        groups.extend(finding.citations for findings in self.standard_buckets.values() for finding in findings)
        for group in groups:
            for url in group:
                if url in seen:
                    continue
                seen.add(url)
                merged.append(url)
        return merged


@dataclass(frozen=True)
class ResearchProfileTrace:
    prompt: str
    raw_response: str = ""
    model: str = ""
    error: str | None = None
    parser_dropped_reason: str | None = None


@dataclass(frozen=True)
class ResearchProfileRequest:
    target_id: str
    venue_name: str
    location_label: str
    category: str
    requested_angle: ListicleAngle | None


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


def _invoke_grounded(*args: Any, **kwargs: Any) -> Any:
    from utils import invoke_google_grounded_text as _invoke

    return _invoke(*args, **kwargs)


_JSON_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.S | re.I)

# Grounded models sometimes drop prose, sentence fragments, or empty strings
# into the citations array. We only trust entries that look like URLs.
_URL_RE = re.compile(r"^https?://\S+$", re.I)


def _clean_citations(raw: Any) -> list[str]:
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


# Inline Google-grounding markers like "[3]", "[3, 9, 10, 13]", or
# "[3, 9-12]" sometimes leak into summary text. Strip them before
# storing — the writer should never see grounded-response marker syntax.
_INLINE_CITATION_MARKER_RE = re.compile(r"\s*\[\s*\d+(?:\s*[,\-]\s*\d+)*\s*\]")


def _clean_summary(raw: Any) -> str:
    if not isinstance(raw, str):
        return ""
    stripped = _INLINE_CITATION_MARKER_RE.sub("", raw)
    # Collapse repeated whitespace introduced by marker removal.
    return re.sub(r"\s{2,}", " ", stripped).strip()


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


def _empty_buckets() -> dict[ResearchBucketName, list[ResearchFinding]]:
    return {bucket: [] for bucket in STANDARD_RESEARCH_BUCKETS}


def _fallback_profile(
    requested_angle: ListicleAngle | None,
    *,
    warning: str | None = None,
) -> ResearchProfile:
    warnings = [warning] if warning else []
    return ResearchProfile(
        selected_angle=SelectedAngleEvidence(
            angle=requested_angle,
            status="unsupported" if requested_angle else "not-requested",
        ),
        standard_buckets=_empty_buckets(),
        usable_for_blurb=False,
        warnings=warnings,
    )


def _has_usable_bucket_evidence(
    buckets: dict[ResearchBucketName, list[ResearchFinding]]
) -> bool:
    total = sum(len(findings) for findings in buckets.values())
    if total >= 2:
        return True
    return len(buckets.get("standout-hook", [])) >= 1


def _parse_research_profile_response(
    *,
    raw_text: str,
    requested_angle: ListicleAngle | None,
) -> tuple[ResearchProfile, str | None]:
    parsed = _extract_json(raw_text)
    if not isinstance(parsed, dict):
        return (
            _fallback_profile(requested_angle, warning="Research Profile response was not JSON."),
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
        citations = _clean_citations(selected_raw.get("citations"))
        summary = _clean_summary(selected_raw.get("summary"))
        reason = _clean_summary(selected_raw.get("reason"))
        if requested_angle is None:
            status = "not-requested"
            angle = None
            summary = ""
            citations = []
        elif status == "supported" and (not summary or not citations):
            drop_reasons.append("selected_angle supported without summary/citations; downgraded to unsupported")
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

    buckets = _empty_buckets()
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
                summary = _clean_summary(entry.get("summary"))
                citations = _clean_citations(entry.get("citations"))
                if not summary:
                    drop_reasons.append(f"{bucket_name}: empty summary")
                    continue
                if not citations:
                    drop_reasons.append(f"{bucket_name}: uncited finding dropped (no valid URL citations)")
                    continue
                cleaned.append(ResearchFinding(
                    summary=summary,
                    citations=citations,
                ))
            buckets[bucket_name] = cleaned  # type: ignore[index]
    elif raw_buckets is not None:
        drop_reasons.append("standard_buckets was not an object")

    warnings = [
        warning.strip()
        for warning in parsed.get("warnings", [])
        if isinstance(warning, str) and warning.strip()
    ] if isinstance(parsed.get("warnings"), list) else []

    if requested_angle and selected.status != "supported":
        warnings.append(f'Selected angle "{requested_angle}" lacked cited support.')

    usable_for_blurb = selected.status == "supported" or _has_usable_bucket_evidence(buckets)
    return (
        ResearchProfile(
            selected_angle=selected,
            standard_buckets=buckets,
            usable_for_blurb=usable_for_blurb,
            warnings=warnings,
        ),
        "; ".join(drop_reasons) if drop_reasons else None,
    )


def run_research_profile(
    *,
    venue_name: str,
    location_label: str,
    category: str,
    requested_angle: ListicleAngle | None,
    grounded_model: str = "gemini-2.5-flash",
) -> tuple[ResearchProfile, ResearchProfileTrace]:
    prompt = build_research_profile_prompt(
        venue_name=venue_name,
        location_label=location_label,
        category=category,
        requested_angle=requested_angle,
    )
    try:
        result = _invoke_grounded(
            prompt,
            model_name=grounded_model,
            fallback_model_name="gemini-2.5-flash",
            max_tokens=16384,
            temperature=0.1,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Research Profile grounded call failed for venue %r", venue_name)
        return (
            _fallback_profile(requested_angle, warning="Research Profile grounded call failed."),
            ResearchProfileTrace(
                prompt=prompt,
                model=grounded_model,
                error=f"grounded call raised: {exc!r}",
            ),
        )

    raw_text = getattr(result, "text", "") if result is not None else ""
    model_used = getattr(result, "model_name", grounded_model) if result is not None else grounded_model
    if not raw_text.strip():
        return (
            _fallback_profile(requested_angle, warning="Research Profile returned empty text."),
            ResearchProfileTrace(
                prompt=prompt,
                raw_response=raw_text,
                model=model_used,
                error="grounded call returned empty text",
            ),
        )

    profile, parser_reason = _parse_research_profile_response(
        raw_text=raw_text,
        requested_angle=requested_angle,
    )
    return profile, ResearchProfileTrace(
        prompt=prompt,
        raw_response=raw_text,
        model=model_used,
        parser_dropped_reason=parser_reason,
    )


def run_research_profiles_concurrently(
    requests: list[ResearchProfileRequest],
    *,
    grounded_model: str = "gemini-2.5-flash",
    max_workers: int | None = None,
) -> dict[str, tuple[ResearchProfile, ResearchProfileTrace]]:
    if not requests:
        return {}

    workers = max_workers or min(8, len(requests))
    results: dict[str, tuple[ResearchProfile, ResearchProfileTrace]] = {}

    def _run_one(
        req: ResearchProfileRequest,
    ) -> tuple[str, ResearchProfile, ResearchProfileTrace]:
        profile, trace = run_research_profile(
            venue_name=req.venue_name,
            location_label=req.location_label,
            category=req.category,
            requested_angle=req.requested_angle,
            grounded_model=grounded_model,
        )
        return req.target_id, profile, trace

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for target_id, profile, trace in pool.map(_run_one, requests):
            results[target_id] = (profile, trace)

    return results
