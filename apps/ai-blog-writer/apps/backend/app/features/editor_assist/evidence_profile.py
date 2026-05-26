"""Evidence Profile — per-venue public-footprint probe.

One grounded LLM call per venue. Probes the venue's public footprint
internally (editorial coverage, social activity, community chatter, owned
web presence, temporal freshness, distinctiveness), then emits:

- bucket: rich/sparse/no public evidence (operator-facing summary)
- research_targets: subset of the category's Listicle Angle pool that has
  cited public evidence. Uncited validations are dropped.
- findings: per-target writer-ready summary + source URLs.

Runs as a parallel pre-pass over all CF-passing blurb targets so angle
rotation can spread angles across the full list's validated distribution.
See ADR 0005.
"""

from __future__ import annotations

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Literal

from .angle_assignment import (
    ACCOMMODATIONS_ANGLE_POOL,
    ATTRACTIONS_ANGLE_POOL,
    DINING_ANGLE_POOL,
    ListicleAngle,
    NIGHTLIFE_ANGLE_POOL,
)

logger = logging.getLogger(__name__)

EvidenceBucket = Literal[
    "rich-public-evidence", "sparse-public-evidence", "no-public-evidence"
]

EVIDENCE_TARGET_POOLS: dict[str, tuple[ListicleAngle, ...]] = {
    "dining": DINING_ANGLE_POOL,
    "accommodations": ACCOMMODATIONS_ANGLE_POOL,
    "attractions": ATTRACTIONS_ANGLE_POOL,
    "nightlife": NIGHTLIFE_ANGLE_POOL,
}

_VALID_BUCKETS: frozenset[str] = frozenset(
    {"rich-public-evidence", "sparse-public-evidence", "no-public-evidence"}
)


@dataclass(frozen=True)
class EvidenceFinding:
    summary: str
    citations: list[str]


@dataclass(frozen=True)
class EvidenceProfile:
    bucket: EvidenceBucket
    research_targets: list[ListicleAngle]
    findings: dict[ListicleAngle, EvidenceFinding] = field(default_factory=dict)


@dataclass(frozen=True)
class EvidenceProfileTrace:
    """Diagnostic capture for the EP step inspector.

    Populated on every call (success or failure) so operators can see exactly
    what was sent and returned. Surfaced in the inspect-run modal.
    """
    prompt: str
    raw_response: str = ""
    model: str = ""
    error: str | None = None
    parser_dropped_reason: str | None = None
    raw_bucket: str | None = None


def build_evidence_profile_prompt(
    *,
    venue_name: str,
    location_label: str,
    category: str,
    target_pool: tuple[ListicleAngle, ...],
) -> str:
    """Construct the single grounded prompt. Asks the model to search for the
    venue, validate each angle against cited public sources, and write a short
    writer-ready summary per validated angle.
    """
    pool_list = "\n".join(f'  - "{angle}"' for angle in target_pool)
    return (
        f"You are an evidence scout for editorial blurbs about a specific {category} venue.\n\n"
        f"Venue: {venue_name}\n"
        f"Location: {location_label}\n\n"
        "Your task:\n"
        "1. Use web search to investigate this venue's public footprint: editorial coverage "
        "(press, listicles, food/travel blogs), community chatter (Reddit, review platforms), "
        "social presence, owned web presence, and temporal freshness (last ~12 months).\n"
        "2. For each candidate angle below, decide whether public sources support a blurb "
        "framed around it. Only validate an angle if you can cite at least one specific URL.\n"
        "3. For each validated angle, write ONE short factual summary (one or two sentences) "
        "that a writer can lean on. No marketing language, no superlatives.\n"
        "4. Classify the venue's overall public footprint into one bucket.\n\n"
        "Candidate angles for this category:\n"
        f"{pool_list}\n\n"
        "Buckets:\n"
        '  - "rich-public-evidence": multiple independent sources, recent coverage, '
        "clear consensus on what this venue is known for.\n"
        '  - "sparse-public-evidence": a small number of sources, limited recent activity, '
        "or coverage only on the venue's own channels.\n"
        '  - "no-public-evidence": no usable public footprint found.\n\n'
        "Output rules:\n"
        "- Return ONE JSON object only, no prose before or after, no code fences.\n"
        '- Top-level keys: "bucket", "validated".\n'
        '- "validated" is an array of objects, each with "angle" (one of the candidates above), '
        '"summary" (one or two sentences), and "citations" (array of URLs, must be non-empty).\n'
        "- Omit any angle you cannot cite.\n"
        '- If no angle is supported, return "validated": [] and "bucket": "no-public-evidence".\n'
        "- Do not invent URLs. Every URL must be one you actually consulted."
    )


def _parse_evidence_profile_response(
    *,
    raw_text: str,
    target_pool: tuple[ListicleAngle, ...],
) -> tuple[EvidenceProfile, str | None, str | None]:
    """Returns (profile, parser_dropped_reason, raw_bucket).

    parser_dropped_reason is non-None when the response failed parsing in some
    notable way (not JSON, invalid bucket, every validation dropped) — these
    are surfaced in the EP step inspector to make failures self-explaining.
    """
    pool_set = set(target_pool)
    parsed = _extract_json(raw_text)
    if not isinstance(parsed, dict):
        logger.warning("Evidence Profile response was not a JSON object")
        return (
            EvidenceProfile(
                bucket="no-public-evidence", research_targets=[], findings={}
            ),
            "response was not a JSON object",
            None,
        )

    raw_bucket = parsed.get("bucket")
    bucket: EvidenceBucket = (
        raw_bucket if raw_bucket in _VALID_BUCKETS else "no-public-evidence"
    )

    validated = parsed.get("validated")
    research_targets: list[ListicleAngle] = []
    findings: dict[ListicleAngle, EvidenceFinding] = {}
    drop_reasons: list[str] = []
    seen: set[str] = set()

    if isinstance(validated, list):
        for entry in validated:
            if not isinstance(entry, dict):
                drop_reasons.append("entry not an object")
                continue
            angle = entry.get("angle")
            if angle not in pool_set:
                drop_reasons.append(f"unknown angle {angle!r}")
                continue
            if angle in seen:
                drop_reasons.append(f"duplicate angle {angle!r}")
                continue
            summary = entry.get("summary")
            citations = entry.get("citations")
            cleaned_citations = [
                c.strip()
                for c in citations
                if isinstance(c, str) and c.strip()
            ] if isinstance(citations, list) else []
            if not cleaned_citations:
                drop_reasons.append(f"{angle}: no citations (dropped)")
                continue
            if not isinstance(summary, str) or not summary.strip():
                drop_reasons.append(f"{angle}: empty summary (dropped)")
                continue
            seen.add(angle)
            research_targets.append(angle)  # type: ignore[arg-type]
            findings[angle] = EvidenceFinding(  # type: ignore[index]
                summary=summary.strip(), citations=cleaned_citations
            )
    elif validated is None:
        drop_reasons.append("response missing 'validated' field")
    else:
        drop_reasons.append("'validated' field was not an array")

    # Bucket sanity: if we dropped all validations, bucket must be no-public-evidence.
    if not research_targets:
        bucket = "no-public-evidence"

    parser_reason: str | None = None
    if not research_targets and drop_reasons:
        parser_reason = "; ".join(drop_reasons)
    elif raw_bucket not in _VALID_BUCKETS and raw_bucket is not None:
        parser_reason = f"invalid bucket {raw_bucket!r}; normalized to no-public-evidence"

    return (
        EvidenceProfile(
            bucket=bucket, research_targets=research_targets, findings=findings
        ),
        parser_reason,
        raw_bucket if isinstance(raw_bucket, str) else None,
    )


_JSON_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.S | re.I)


def _extract_json(text: str) -> Any:
    candidate = text.strip()
    fenced = _JSON_FENCE_RE.match(candidate)
    if fenced:
        candidate = fenced.group(1).strip()
    try:
        return json.loads(candidate)
    except (ValueError, TypeError):
        # Fallback: pull the first {...} block.
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(candidate[start : end + 1])
            except (ValueError, TypeError):
                return None
        return None


def _invoke_grounded(*args: Any, **kwargs: Any) -> Any:
    """Lazy import keeps route imports light under test stubs."""
    from utils import invoke_google_grounded_text as _invoke

    return _invoke(*args, **kwargs)


def run_evidence_profile(
    *,
    venue_name: str,
    location_label: str,
    category: str,
    grounded_model: str = "gemini-2.5-flash",
) -> tuple[EvidenceProfile, EvidenceProfileTrace]:
    """Returns (profile, trace). Trace is always populated so the EP step
    inspector can surface the exact prompt, raw response, and any error.
    """
    target_pool = EVIDENCE_TARGET_POOLS.get(category)
    empty_profile = EvidenceProfile(
        bucket="no-public-evidence", research_targets=[], findings={}
    )
    if not target_pool:
        return empty_profile, EvidenceProfileTrace(
            prompt="",
            error=f"category {category!r} has no Evidence Profile target pool",
        )

    prompt = build_evidence_profile_prompt(
        venue_name=venue_name,
        location_label=location_label,
        category=category,
        target_pool=target_pool,
    )
    try:
        result = _invoke_grounded(
            prompt,
            model_name=grounded_model,
            fallback_model_name="gemini-2.5-flash",
            max_tokens=8192,
            temperature=0.1,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Evidence Profile grounded call failed for venue %r", venue_name
        )
        return empty_profile, EvidenceProfileTrace(
            prompt=prompt,
            model=grounded_model,
            error=f"grounded call raised: {exc!r}",
        )

    raw_text = getattr(result, "text", "") if result is not None else ""
    model_used = getattr(result, "model_name", grounded_model) if result is not None else grounded_model
    if not raw_text.strip():
        return empty_profile, EvidenceProfileTrace(
            prompt=prompt,
            raw_response=raw_text,
            model=model_used,
            error="grounded call returned empty text",
        )

    profile, parser_reason, raw_bucket = _parse_evidence_profile_response(
        raw_text=raw_text, target_pool=target_pool
    )
    return profile, EvidenceProfileTrace(
        prompt=prompt,
        raw_response=raw_text,
        model=model_used,
        parser_dropped_reason=parser_reason,
        raw_bucket=raw_bucket,
    )


@dataclass(frozen=True)
class EvidenceProfileRequest:
    target_id: str
    venue_name: str
    location_label: str
    category: str


def run_evidence_profiles_concurrently(
    requests: list[EvidenceProfileRequest],
    *,
    grounded_model: str = "gemini-2.5-flash",
    max_workers: int | None = None,
) -> dict[str, tuple[EvidenceProfile, EvidenceProfileTrace]]:
    """Fan out one grounded call per request. Returns
    {target_id: (profile, trace)} so the per-target step recorder can surface
    the exact prompt and raw response in the inspector.
    """
    if not requests:
        return {}

    workers = max_workers or min(8, len(requests))
    results: dict[str, tuple[EvidenceProfile, EvidenceProfileTrace]] = {}

    def _run_one(
        req: EvidenceProfileRequest,
    ) -> tuple[str, EvidenceProfile, EvidenceProfileTrace]:
        profile, trace = run_evidence_profile(
            venue_name=req.venue_name,
            location_label=req.location_label,
            category=req.category,
            grounded_model=grounded_model,
        )
        return req.target_id, profile, trace

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for target_id, profile, trace in pool.map(_run_one, requests):
            results[target_id] = (profile, trace)

    return results
