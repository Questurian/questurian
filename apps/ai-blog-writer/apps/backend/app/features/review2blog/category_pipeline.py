"""Category-aware Review2Blog pipeline helpers."""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException

from utils import get_vertex_llm

ROOT_STRING_FIELDS = ("category", "name", "type", "district", "locationKey")
REVIEW_FIELDS = ("reviewId", "source", "date", "rating", "text")
EDITORIAL_STRING_FIELDS = ("placement_type", "selection_angle", "audience", "tone")
IGNORED_GENERATION_FIELDS = {
    "title",
    "description",
    "reviews_summary",
    "neighborhoodDescription",
    "url",
    "website",
    "phoneNumber",
    "email",
    "lat",
    "lng",
    "placeId",
    "tripadvisorUrl",
}
CATEGORY_TOPICS = {
    "dining": ("food", "service", "atmosphere", "value", "location"),
    "accommodations": ("room", "cleanliness", "service", "amenities", "location", "value"),
    "attractions": ("experience", "exhibits", "crowds", "logistics", "value"),
    "nightlife": ("drinks", "music", "service", "crowd", "energy", "value"),
    "key_locations": (
        "logistics",
        "signage",
        "wait_times",
        "cleanliness",
        "safety",
        "convenience",
    ),
}
CATEGORY_REQUIRED_PATHS = {
    "dining": (
        "priceLevel",
        "idealFor",
        "tripadvisorCuisines",
        "tripadvisorMealTypes",
        "tripadvisorFeatures",
        "operationHours",
    ),
    "accommodations": (
        "priceLevel",
        "accommodationsDetails.the_stay.perfect_for",
        "accommodationsDetails.the_stay.kid_friendly",
        "accommodationsDetails.the_stay.wifi",
        "accommodationsDetails.the_stay.ac",
        "accommodationsDetails.the_stay.breakfast_served",
        "accommodationsDetails.the_stay.parking",
        "accommodationsDetails.the_experience.vibe",
        "accommodationsDetails.the_experience.workspace",
        "accommodationsDetails.the_experience.pool",
        "accommodationsDetails.the_experience.rooftop_lounge",
        "accommodationsDetails.the_experience.gym",
        "accommodationsDetails.the_details.walkability",
    ),
    "attractions": (
        "priceLevel",
        "idealFor",
        "attractionsDetails.core.attraction_type",
        "attractionsDetails.core.pricing",
        "attractionsDetails.visit.booking_required",
        "operationHours",
    ),
    "nightlife": (
        "nightlifeDetails.price_tier",
        "idealFor",
        "nightlifeDetails.music",
        "nightlifeDetails.details.theSpace.venueType.value",
        "nightlifeDetails.details.theSpace.venueSize.value",
        "nightlifeDetails.details.theSpace.vibe.value",
        "nightlifeDetails.details.theSpace.peakHours.value",
        "nightlifeDetails.details.theScene.dressCode.value",
        "nightlifeDetails.details.theScene.energyLevel.value",
        "nightlifeDetails.details.theScene.crowdProfile.value",
        "operationHours",
    ),
    "key_locations": (
        "keyLocationsDetails.location_type",
        "keyLocationsDetails.neighborhood",
        "keyLocationsDetails.status",
        "operationHours",
    ),
}
POLARITY_VALUES = {"positive", "mixed", "neutral", "negative"}
STRENGTH_VALUES = {"low", "medium", "high"}
SPECIFICITY_VALUES = {"low", "medium", "high"}
CONFIDENCE_VALUES = {"low", "medium", "high"}
HYPE_WORD_PATTERN = re.compile(
    r"\b(best|must-try|world-class|can't miss|can’t miss|iconic|bucket list)\b",
    re.IGNORECASE,
)
EMOJI_PATTERN = re.compile(r"[\U0001F300-\U0001FAFF]")
SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[.!?])\s+")
WORD_PATTERN = re.compile(r"[a-z0-9']+")
STOPWORDS = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "for",
    "from",
    "in",
    "into",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
}
TOPIC_PRIORITY = {
    "dining": {"food": 0, "service": 1, "atmosphere": 2, "value": 3, "location": 4},
    "accommodations": {
        "room": 0,
        "cleanliness": 1,
        "amenities": 2,
        "service": 3,
        "location": 4,
        "value": 5,
    },
    "attractions": {
        "experience": 0,
        "exhibits": 1,
        "logistics": 2,
        "crowds": 3,
        "value": 4,
    },
    "nightlife": {
        "drinks": 0,
        "music": 1,
        "crowd": 2,
        "energy": 3,
        "service": 4,
        "value": 5,
    },
    "key_locations": {
        "logistics": 0,
        "wait_times": 1,
        "signage": 2,
        "cleanliness": 3,
        "safety": 4,
        "convenience": 5,
    },
}
WRITER_GUIDANCE = {
    "dining": (
        "Lead with repeated food and service evidence. Atmosphere should support the case, "
        "not replace it. Named dishes are optional and only useful when they have repeated support."
    ),
    "accommodations": (
        "Focus on the actual stay experience: rooms, cleanliness, amenities, and service. "
        "Avoid generic hospitality language."
    ),
    "attractions": (
        "Emphasize visit value, exhibits or experiences, and practical visit friction like crowds "
        "or logistics when reviews mention them."
    ),
    "nightlife": (
        "Center the piece on repeated evidence about drinks, music, crowd, energy, and service. "
        "Avoid default nightlife hype."
    ),
    "key_locations": (
        "Write for utility. Highlight traveler convenience, wait times, signage, safety, or friction "
        "based on the review evidence."
    ),
}
EXTRACTION_GUIDANCE = {
    "dining": "Look for concrete claims about dishes, pacing, service, ambience, value, and location convenience.",
    "accommodations": "Look for concrete claims about rooms, cleanliness, service, amenities, and location convenience.",
    "attractions": "Look for concrete claims about the visit experience, exhibits, crowding, logistics, and value.",
    "nightlife": "Look for concrete claims about drinks, music, crowd, energy, service, and value.",
    "key_locations": "Look for concrete claims about signage, wait times, cleanliness, safety, convenience, and logistics.",
}
CLAIM_BUNDLE_PROMPT = """You are extracting evidence-backed review claims for a {category} location.

Allowed topics for this category:
{allowed_topics}

Category focus:
{category_guidance}

INPUT
- Each review includes reviewId, source, date, rating, and text.
- Return one output object per input review, in the same order.

RETURN ONLY VALID JSON.
Return a JSON array where each item matches this schema:

{{
  "review_id": "",
  "review_date": "",
  "review_sentiment": "positive | mixed | neutral | negative",
  "claims": [
    {{
      "topic": "",
      "subject": "",
      "polarity": "positive | mixed | neutral | negative",
      "strength": "low | medium | high",
      "specificity": "low | medium | high",
      "quote": "",
      "named_entity": ""
    }}
  ]
}}

RULES
1. topic must be one of the allowed topics above.
2. subject must be a short, literal phrase grounded in the review text.
3. quote must be a short verbatim snippet from the review, max 18 words.
4. named_entity is only for explicit named items like dishes, rooms, exhibits, cocktails, or transit points. Otherwise use "".
5. Do not invent audiences, vibes, or marketing language.
6. It is valid for a review to have zero claims.
7. Return only valid JSON. No prose. No markdown fences.
"""
CLAIM_BUNDLE_RETRY_PROMPT = """Your previous response was invalid JSON.

Error:
{parse_error}

Return ONLY a valid JSON array for the same input reviews.
- Same number of items as the input array
- Same item order as the input array
- No markdown fences
- No trailing commas
- No commentary

Original prompt:
{original_prompt}

Invalid response:
{previous_response}
"""
WRITER_PROMPT = """You are writing a short curated blurb for a {category} location.

Reviews are the primary source of truth.
The editorial block is a packaging constraint only. Do not copy or paraphrase placement_type or selection_angle.

CATEGORY GUIDANCE
{category_guidance}

LOCATION FACTS
{location_facts}

EDITORIAL CONSTRAINTS
{editorial_constraints}

TOP REVIEW-BACKED CLAIMS
{top_claims}

CAUTIONS OR CONTRADICTIONS
{cautions}

APPROVED NAMED ENTITIES
{approved_named_entities}

RULES
1. Write one paragraph with 4 to 6 sentences.
2. Mention at least {minimum_claims} concrete review-backed details unless there is only one review.
3. Only mention named entities from APPROVED NAMED ENTITIES.
4. Do not restate placement_type or selection_angle.
5. Avoid hype language, bullets, headings, emojis, and generic filler.
6. Respect the requested tone and avoid list.
7. Stay grounded in repeated reviewer evidence.

Return only the paragraph.
"""
WRITER_REWRITE_PROMPT = """Rewrite this curated blurb so it passes the validation rules.

VALIDATION FAILURES
{validation_errors}

CATEGORY GUIDANCE
{category_guidance}

LOCATION FACTS
{location_facts}

EDITORIAL CONSTRAINTS
{editorial_constraints}

TOP REVIEW-BACKED CLAIMS
{top_claims}

CAUTIONS OR CONTRADICTIONS
{cautions}

APPROVED NAMED ENTITIES
{approved_named_entities}

CURRENT BLURB
{current_blurb}

Return only one corrected paragraph with 4 to 6 sentences.
"""


def _coerce_string(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _coerce_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(parsed):
        return default
    return parsed


def _normalize_string_list(value: Any, *, limit: int | None = None) -> list[str]:
    if isinstance(value, list):
        items = value
    elif value in (None, ""):
        items = []
    else:
        items = [value]

    normalized: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = _coerce_string(item)
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(text)
        if limit is not None and len(normalized) >= limit:
            break
    return normalized


def _normalize_enum(value: Any, allowed: set[str] | tuple[str, ...], default: str) -> str:
    normalized = _coerce_string(value).lower().replace(" ", "_")
    if isinstance(allowed, tuple):
        allowed_values = set(allowed)
    else:
        allowed_values = allowed
    return normalized if normalized in allowed_values else default


def _parse_review_date(value: Any) -> date | None:
    text = _coerce_string(value)
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _path_value(payload: Any, path: str) -> Any:
    current = payload
    for segment in path.split("."):
        if not isinstance(current, dict) or segment not in current:
            return None
        current = current[segment]
    return current


def _has_required_value(payload: dict[str, Any], path: str) -> bool:
    value = _path_value(payload, path)
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _normalize_operation_hours(value: Any) -> list[dict[str, str]]:
    hours_payload = value.get("hours") if isinstance(value, dict) else []
    if not isinstance(hours_payload, list):
        return []

    normalized: list[dict[str, str]] = []
    for item in hours_payload:
        if not isinstance(item, dict):
            continue
        day = _coerce_string(item.get("day"))
        hours = _coerce_string(item.get("hours"))
        if not day or not hours:
            continue
        normalized.append({"day": day, "hours": hours})
    return normalized


def _review_sentiment_from_rating(rating: float) -> str:
    if rating >= 4.25:
        return "positive"
    if rating <= 2.25:
        return "negative"
    if rating >= 3.5:
        return "mixed"
    return "neutral"


def _normalize_editorial_intent(value: Any) -> dict[str, Any]:
    editorial = value if isinstance(value, dict) else {}
    return {
        "placement_type": _coerce_string(editorial.get("placement_type")),
        "selection_angle": _coerce_string(editorial.get("selection_angle")),
        "audience": _coerce_string(editorial.get("audience")),
        "tone": _coerce_string(editorial.get("tone")) or "grounded_editorial",
        "must_mention": _normalize_string_list(editorial.get("must_mention"), limit=8),
        "avoid": _normalize_string_list(editorial.get("avoid"), limit=12),
    }


def editorial_is_complete(editorial_intent: dict[str, Any]) -> bool:
    return all(
        _coerce_string(editorial_intent.get(field))
        for field in EDITORIAL_STRING_FIELDS
    )


def _validate_reviews(payload: dict[str, Any]) -> list[dict[str, Any]]:
    reviews = payload.get("reviews")
    if not isinstance(reviews, list) or not reviews:
        raise HTTPException(status_code=400, detail="'reviews' must be a non-empty array.")

    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(reviews):
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Review at index {index} must be an object.",
            )
        missing = [field for field in REVIEW_FIELDS if field not in item]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Review at index {index} missing fields: {', '.join(missing)}.",
            )
        review_id = _coerce_string(item.get("reviewId"))
        source = _coerce_string(item.get("source"))
        review_date = _coerce_string(item.get("date"))
        text = _coerce_string(item.get("text"))
        rating = _coerce_float(item.get("rating"), float("nan"))
        if not review_id or not source or not review_date or not text or not math.isfinite(rating):
            raise HTTPException(
                status_code=400,
                detail=f"Review at index {index} contains invalid values.",
            )
        if _parse_review_date(review_date) is None:
            raise HTTPException(
                status_code=400,
                detail=f"Review at index {index} has an invalid 'date' value.",
            )
        normalized.append(
            {
                "reviewId": review_id,
                "source": source,
                "date": review_date,
                "rating": rating,
                "text": text,
            }
        )
    return normalized


def _metadata_facts_for_category(category: str, payload: dict[str, Any]) -> dict[str, Any]:
    if category == "dining":
        return {
            "price_level": _coerce_string(payload.get("priceLevel")),
            "ideal_for": _normalize_string_list(payload.get("idealFor"), limit=8),
            "cuisines": _normalize_string_list(payload.get("tripadvisorCuisines"), limit=8),
            "meal_types": _normalize_string_list(payload.get("tripadvisorMealTypes"), limit=8),
            "features": _normalize_string_list(payload.get("tripadvisorFeatures"), limit=10),
            "operation_hours": _normalize_operation_hours(payload.get("operationHours")),
        }

    if category == "accommodations":
        return {
            "price_level": _coerce_string(payload.get("priceLevel")),
            "perfect_for": _normalize_string_list(
                _path_value(payload, "accommodationsDetails.the_stay.perfect_for"),
                limit=8,
            ),
            "kid_friendly": bool(_path_value(payload, "accommodationsDetails.the_stay.kid_friendly")),
            "wifi": bool(_path_value(payload, "accommodationsDetails.the_stay.wifi")),
            "ac": bool(_path_value(payload, "accommodationsDetails.the_stay.ac")),
            "breakfast_served": bool(
                _path_value(payload, "accommodationsDetails.the_stay.breakfast_served")
            ),
            "parking": _normalize_string_list(
                _path_value(payload, "accommodationsDetails.the_stay.parking"),
                limit=6,
            ),
            "vibe": _normalize_string_list(
                _path_value(payload, "accommodationsDetails.the_experience.vibe"),
                limit=6,
            ),
            "workspace": _coerce_string(
                _path_value(payload, "accommodationsDetails.the_experience.workspace")
            ),
            "pool": _normalize_string_list(
                _path_value(payload, "accommodationsDetails.the_experience.pool"),
                limit=4,
            ),
            "rooftop_lounge": bool(
                _path_value(payload, "accommodationsDetails.the_experience.rooftop_lounge")
            ),
            "gym": _coerce_string(_path_value(payload, "accommodationsDetails.the_experience.gym")),
            "walkability": _coerce_string(
                _path_value(payload, "accommodationsDetails.the_details.walkability")
            ),
        }

    if category == "attractions":
        return {
            "price_level": _coerce_string(payload.get("priceLevel")),
            "ideal_for": _normalize_string_list(payload.get("idealFor"), limit=8),
            "attraction_type": _coerce_string(
                _path_value(payload, "attractionsDetails.core.attraction_type")
            ),
            "pricing": _coerce_string(_path_value(payload, "attractionsDetails.core.pricing")),
            "booking_required": bool(
                _path_value(payload, "attractionsDetails.visit.booking_required")
            ),
            "operation_hours": _normalize_operation_hours(payload.get("operationHours")),
        }

    if category == "nightlife":
        return {
            "price_tier": _coerce_string(_path_value(payload, "nightlifeDetails.price_tier")),
            "ideal_for": _normalize_string_list(payload.get("idealFor"), limit=8),
            "music": _normalize_string_list(_path_value(payload, "nightlifeDetails.music"), limit=8),
            "venue_type": _coerce_string(
                _path_value(payload, "nightlifeDetails.details.theSpace.venueType.value")
            ),
            "venue_size": _coerce_string(
                _path_value(payload, "nightlifeDetails.details.theSpace.venueSize.value")
            ),
            "vibe": _normalize_string_list(
                _path_value(payload, "nightlifeDetails.details.theSpace.vibe.value"),
                limit=6,
            ),
            "peak_hours": _coerce_string(
                _path_value(payload, "nightlifeDetails.details.theSpace.peakHours.value")
            ),
            "dress_code": _normalize_string_list(
                _path_value(payload, "nightlifeDetails.details.theScene.dressCode.value"),
                limit=6,
            ),
            "energy_level": _coerce_string(
                _path_value(payload, "nightlifeDetails.details.theScene.energyLevel.value")
            ),
            "crowd_profile": _coerce_string(
                _path_value(payload, "nightlifeDetails.details.theScene.crowdProfile.value")
            ),
            "operation_hours": _normalize_operation_hours(payload.get("operationHours")),
        }

    return {
        "location_type": _coerce_string(_path_value(payload, "keyLocationsDetails.location_type")),
        "neighborhood": _coerce_string(_path_value(payload, "keyLocationsDetails.neighborhood")),
        "status": _coerce_string(_path_value(payload, "keyLocationsDetails.status")),
        "operation_hours": _normalize_operation_hours(payload.get("operationHours")),
    }


def validate_and_normalize_export(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="JSON root must be an object exported from Location Manager.",
        )

    missing_root = [field for field in ROOT_STRING_FIELDS if not _has_required_value(payload, field)]
    if missing_root:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing_root)}.",
        )

    category = _coerce_string(payload.get("category")).lower()
    if category not in CATEGORY_TOPICS:
        allowed = ", ".join(sorted(CATEGORY_TOPICS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported category '{payload.get('category')}'. Expected one of: {allowed}.",
        )

    editorial_intent = _normalize_editorial_intent(payload.get("editorial"))
    if not editorial_is_complete(editorial_intent):
        raise HTTPException(
            status_code=400,
            detail=(
                "Missing required editorial fields: placement_type, selection_angle, audience, tone."
            ),
        )

    missing_category = [
        path
        for path in CATEGORY_REQUIRED_PATHS[category]
        if not _has_required_value(payload, path)
    ]
    if missing_category:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Missing required {category} fields: "
                + ", ".join(missing_category)
                + "."
            ),
        )

    reviews = _validate_reviews(payload)
    facts = _metadata_facts_for_category(category, payload)
    location_context = {
        "name": _coerce_string(payload.get("name")),
        "category": category,
        "type": _coerce_string(payload.get("type")),
        "district": _coerce_string(payload.get("district")),
        "location_key": _coerce_string(payload.get("locationKey")),
        "facts": facts,
    }

    return {
        "category": category,
        "location_context": location_context,
        "editorial_intent": editorial_intent,
        "reviews": reviews,
        "ignored_fields_present": sorted(
            field for field in IGNORED_GENERATION_FIELDS if field in payload
        ),
    }


def _extract_json_payload(raw_text: str) -> str:
    if not raw_text:
        return ""
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", raw_text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return raw_text.strip()


def _strip_trailing_commas(text: str) -> str:
    previous = None
    current = text
    while previous != current:
        previous = current
        current = re.sub(r",(\s*[}\]])", r"\1", current)
    return current


def _strict_parse_array(raw_text: str) -> tuple[list[Any] | None, str | None]:
    try:
        parsed = json.loads(raw_text.strip())
    except json.JSONDecodeError as exc:
        return None, str(exc)
    if not isinstance(parsed, list):
        return None, "Expected a JSON array in LLM response."
    return parsed, None


def _repair_parse_array(raw_text: str) -> tuple[list[Any] | None, str | None]:
    cleaned = _extract_json_payload(raw_text)
    if not cleaned:
        return None, "Empty response"
    array_start = cleaned.find("[")
    if array_start == -1:
        return None, "No JSON array found in response."
    trimmed = cleaned[array_start:]
    try:
        parsed = json.loads(trimmed)
    except json.JSONDecodeError:
        sanitized = _strip_trailing_commas(trimmed)
        try:
            parsed = json.loads(sanitized)
        except json.JSONDecodeError as exc:
            return None, str(exc)
    if not isinstance(parsed, list):
        return None, "Expected a JSON array in LLM response."
    return parsed, None


def _invoke_json_llm_with_retry(
    *,
    prompt: str,
    retry_prompt_builder: callable,
    max_tokens: int,
    retry_limit: int,
    label: str,
) -> tuple[str, list[Any], dict[str, Any]]:
    llm = get_vertex_llm(temperature=0.1, max_tokens=max_tokens)
    last_raw = ""
    last_error = "Unknown parse error"

    for attempt in range(retry_limit + 1):
        current_prompt = (
            prompt
            if attempt == 0
            else retry_prompt_builder(
                original_prompt=prompt,
                previous_response=last_raw,
                parse_error=last_error,
            )
        )
        result = llm.invoke(current_prompt)
        if not result or not result.strip():
            raise RuntimeError(f"{label} returned empty output")
        last_raw = result.strip()
        parsed, parse_error = _strict_parse_array(last_raw)
        if parsed is not None:
            return last_raw, parsed, {"attempt_count": attempt + 1, "repair_used": False}
        last_error = parse_error or "Strict parse failed"

    repaired, repair_error = _repair_parse_array(last_raw)
    if repaired is not None:
        return last_raw, repaired, {"attempt_count": retry_limit + 1, "repair_used": True}

    raise RuntimeError(
        f"{label} parse failed after retry and repair: {last_error}; repair error: {repair_error}"
    )


def _build_claim_prompt(category: str, reviews: list[dict[str, Any]]) -> str:
    allowed_topics = ", ".join(CATEGORY_TOPICS[category])
    return (
        CLAIM_BUNDLE_PROMPT.format(
            category=category.replace("_", " "),
            allowed_topics=allowed_topics,
            category_guidance=EXTRACTION_GUIDANCE[category],
        )
        + "\n\nINPUT JSON ARRAY:\n"
        + json.dumps(reviews, ensure_ascii=False, indent=2)
    )


def _build_claim_retry_prompt(
    *,
    original_prompt: str,
    previous_response: str,
    parse_error: str,
) -> str:
    return CLAIM_BUNDLE_RETRY_PROMPT.format(
        parse_error=parse_error,
        original_prompt=original_prompt,
        previous_response=previous_response,
    )


def _normalize_claim_bundles(
    parsed_payload: Any,
    reviews: list[dict[str, Any]],
    category: str,
) -> list[dict[str, Any]]:
    bundles = parsed_payload if isinstance(parsed_payload, list) else []
    allowed_topics = set(CATEGORY_TOPICS[category])
    normalized_claims: list[dict[str, Any]] = []

    for index, review in enumerate(reviews):
        bundle = bundles[index] if index < len(bundles) and isinstance(bundles[index], dict) else {}
        review_sentiment = _normalize_enum(
            bundle.get("review_sentiment"),
            POLARITY_VALUES,
            _review_sentiment_from_rating(_coerce_float(review.get("rating"))),
        )
        raw_claims = bundle.get("claims") if isinstance(bundle.get("claims"), list) else []
        seen_keys: set[tuple[str, str, str]] = set()

        for raw_claim in raw_claims:
            if not isinstance(raw_claim, dict):
                continue
            topic = _normalize_enum(raw_claim.get("topic"), allowed_topics, "")
            subject = _coerce_string(raw_claim.get("subject"))[:120]
            polarity = _normalize_enum(raw_claim.get("polarity"), POLARITY_VALUES, "neutral")
            strength = _normalize_enum(raw_claim.get("strength"), STRENGTH_VALUES, "medium")
            specificity = _normalize_enum(raw_claim.get("specificity"), SPECIFICITY_VALUES, "medium")
            quote = _coerce_string(raw_claim.get("quote"))[:160]
            named_entity = _coerce_string(raw_claim.get("named_entity"))[:120]
            if not topic or not quote:
                continue
            if not subject:
                subject = named_entity or topic.replace("_", " ")
            dedupe_key = (topic, subject.casefold(), quote.casefold())
            if dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)
            normalized_claims.append(
                {
                    "review_id": review["reviewId"],
                    "review_source": review["source"],
                    "review_date": review["date"],
                    "rating": _coerce_float(review["rating"]),
                    "review_sentiment": review_sentiment,
                    "topic": topic,
                    "subject": subject,
                    "polarity": polarity,
                    "strength": strength,
                    "specificity": specificity,
                    "quote": quote,
                    "named_entity": named_entity,
                }
            )

    return normalized_claims


def extract_claim_signals(
    *,
    reviews: list[dict[str, Any]],
    category: str,
    max_tokens: int,
    retry_limit: int,
) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    prompt = _build_claim_prompt(category, reviews)
    raw_response, parsed_payload, meta = _invoke_json_llm_with_retry(
        prompt=prompt,
        retry_prompt_builder=_build_claim_retry_prompt,
        max_tokens=max_tokens,
        retry_limit=retry_limit,
        label="Review2Blog category-aware phase 1",
    )
    return raw_response, _normalize_claim_bundles(parsed_payload, reviews, category), meta


def build_phase1_summary(
    *,
    category: str,
    review_count: int,
    claim_count: int,
    batch_mode: str,
    batch_size: int,
    batch_count: int,
) -> dict[str, Any]:
    return {
        "category": category,
        "review_count": review_count,
        "claim_count": claim_count,
        "batch_mode": batch_mode,
        "batch_size": batch_size,
        "batch_count": batch_count,
    }


def _score_value(value: str, ordering: dict[str, int]) -> int:
    return ordering.get(value, 0)


def _confidence_from_support(review_count: int, support_count: int) -> str:
    if support_count <= 0:
        return "low"
    if review_count <= 1:
        return "medium"
    if support_count >= max(3, math.ceil(review_count / 2)):
        return "high"
    if support_count >= 2:
        return "medium"
    return "low"


def _claim_group_sort_key(category: str, claim: dict[str, Any]) -> tuple[Any, ...]:
    polarity_priority = {"positive": 0, "mixed": 1, "neutral": 2, "negative": 3}
    topic_rank = TOPIC_PRIORITY[category].get(_coerce_string(claim.get("topic")), 99)
    return (
        -int(claim.get("support_count", 0)),
        polarity_priority.get(_coerce_string(claim.get("dominant_polarity")), 9),
        -_score_value(_coerce_string(claim.get("strength")), {"high": 3, "medium": 2, "low": 1}),
        topic_rank,
        _coerce_string(claim.get("subject")).casefold(),
    )


def _named_entity_threshold(review_count: int) -> int:
    return 1 if review_count <= 1 else 2


def _recent_review_ids(
    reviews: list[dict[str, Any]],
    recent_window_days: int,
) -> set[str]:
    parsed_dates = [
        parsed
        for parsed in (_parse_review_date(review.get("date")) for review in reviews)
        if parsed is not None
    ]
    if not parsed_dates:
        return set()
    latest = max(parsed_dates)
    threshold = latest - timedelta(days=recent_window_days)
    return {
        review["reviewId"]
        for review in reviews
        if (parsed := _parse_review_date(review.get("date"))) is not None and parsed >= threshold
    }


def _metadata_highlights(location_context: dict[str, Any]) -> list[str]:
    facts = location_context.get("facts") if isinstance(location_context.get("facts"), dict) else {}
    highlights = [
        _coerce_string(location_context.get("type")),
        _coerce_string(location_context.get("district")),
    ]
    for key in (
        "price_level",
        "price_tier",
        "attraction_type",
        "location_type",
        "workspace",
        "walkability",
        "energy_level",
    ):
        value = _coerce_string(facts.get(key))
        if value:
            highlights.append(value)
    for key in (
        "ideal_for",
        "cuisines",
        "meal_types",
        "features",
        "perfect_for",
        "vibe",
        "music",
        "dress_code",
    ):
        highlights.extend(_normalize_string_list(facts.get(key), limit=3))
    return _normalize_string_list(highlights, limit=10)


def build_evidence_profile(
    *,
    category: str,
    claims: list[dict[str, Any]],
    reviews: list[dict[str, Any]],
    location_context: dict[str, Any],
    editorial_intent: dict[str, Any],
    recent_window_days: int,
) -> dict[str, Any]:
    review_count = len(reviews)
    recent_review_ids = _recent_review_ids(reviews, recent_window_days)
    dates = [
        parsed for parsed in (_parse_review_date(review.get("date")) for review in reviews) if parsed
    ]
    date_range = {
        "earliest": min(dates).isoformat() if dates else None,
        "latest": max(dates).isoformat() if dates else None,
    }

    claim_groups: dict[tuple[str, str], dict[str, Any]] = {}
    topic_review_ids: dict[str, set[str]] = defaultdict(set)
    topic_quotes: dict[str, list[str]] = defaultdict(list)
    named_entities: dict[str, dict[str, Any]] = {}

    for claim in claims:
        topic = _coerce_string(claim.get("topic"))
        subject = _coerce_string(claim.get("subject")) or topic.replace("_", " ")
        group_key = (topic, subject.casefold())
        group = claim_groups.setdefault(
            group_key,
            {
                "topic": topic,
                "subject": subject,
                "support_review_ids": set(),
                "recent_review_ids": set(),
                "positive_count": 0,
                "negative_count": 0,
                "mixed_count": 0,
                "neutral_count": 0,
                "strength_scores": [],
                "specificity_scores": [],
                "quotes": [],
                "named_entities": set(),
            },
        )
        review_id = _coerce_string(claim.get("review_id"))
        topic_review_ids[topic].add(review_id)
        group["support_review_ids"].add(review_id)
        if review_id in recent_review_ids:
            group["recent_review_ids"].add(review_id)
        polarity = _coerce_string(claim.get("polarity"))
        count_key = f"{polarity}_count"
        if count_key in group:
            group[count_key] += 1
        group["strength_scores"].append(
            _score_value(_coerce_string(claim.get("strength")), {"low": 1, "medium": 2, "high": 3})
        )
        group["specificity_scores"].append(
            _score_value(_coerce_string(claim.get("specificity")), {"low": 1, "medium": 2, "high": 3})
        )
        quote = _coerce_string(claim.get("quote"))
        if quote and quote.casefold() not in {item.casefold() for item in group["quotes"]}:
            group["quotes"].append(quote)
        topic_quotes[topic].append(quote)
        named_entity = _coerce_string(claim.get("named_entity"))
        if named_entity:
            group["named_entities"].add(named_entity)
            entity_bucket = named_entities.setdefault(
                named_entity.casefold(),
                {
                    "name": named_entity,
                    "topic": topic,
                    "support_review_ids": set(),
                    "recent_review_ids": set(),
                    "positive_count": 0,
                    "negative_count": 0,
                    "mixed_count": 0,
                    "neutral_count": 0,
                    "quotes": [],
                },
            )
            entity_bucket["support_review_ids"].add(review_id)
            if review_id in recent_review_ids:
                entity_bucket["recent_review_ids"].add(review_id)
            if count_key in entity_bucket:
                entity_bucket[count_key] += 1
            if quote and quote.casefold() not in {item.casefold() for item in entity_bucket["quotes"]}:
                entity_bucket["quotes"].append(quote)

    ranked_claims: list[dict[str, Any]] = []
    contradictions: list[dict[str, Any]] = []

    for group in claim_groups.values():
        polarity_counts = {
            "positive": group["positive_count"],
            "mixed": group["mixed_count"],
            "neutral": group["neutral_count"],
            "negative": group["negative_count"],
        }
        dominant_polarity = sorted(
            polarity_counts.items(),
            key=lambda item: (-item[1], item[0]),
        )[0][0]
        support_count = len(group["support_review_ids"])
        recent_support_count = len(group["recent_review_ids"])
        normalized_claim = {
            "topic": group["topic"],
            "subject": group["subject"],
            "dominant_polarity": dominant_polarity,
            "support_count": support_count,
            "recent_support_count": recent_support_count,
            "positive_count": group["positive_count"],
            "negative_count": group["negative_count"],
            "mixed_count": group["mixed_count"],
            "neutral_count": group["neutral_count"],
            "confidence": _confidence_from_support(review_count, support_count),
            "strength": {1: "low", 2: "medium", 3: "high"}.get(
                round(sum(group["strength_scores"]) / max(len(group["strength_scores"]), 1)),
                "medium",
            ),
            "specificity": {1: "low", 2: "medium", 3: "high"}.get(
                max(group["specificity_scores"], default=2),
                "medium",
            ),
            "quotes": group["quotes"][:3],
            "named_entities": _normalize_string_list(list(group["named_entities"]), limit=6),
        }
        ranked_claims.append(normalized_claim)
        if group["positive_count"] > 0 and group["negative_count"] > 0:
            contradictions.append(
                {
                    "topic": group["topic"],
                    "subject": group["subject"],
                    "positive_count": group["positive_count"],
                    "negative_count": group["negative_count"],
                    "quotes": group["quotes"][:3],
                }
            )

    ranked_claims.sort(key=lambda item: _claim_group_sort_key(category, item))
    contradictions.sort(key=lambda item: (-int(item["positive_count"]) - int(item["negative_count"]), item["subject"].casefold()))

    named_entity_support: list[dict[str, Any]] = []
    for entity in named_entities.values():
        support_count = len(entity["support_review_ids"])
        named_entity_support.append(
            {
                "name": entity["name"],
                "topic": entity["topic"],
                "support_count": support_count,
                "recent_support_count": len(entity["recent_review_ids"]),
                "positive_count": entity["positive_count"],
                "negative_count": entity["negative_count"],
                "quotes": entity["quotes"][:3],
            }
        )
    named_entity_support.sort(
        key=lambda item: (
            -int(item["support_count"]),
            -int(item["positive_count"]),
            _coerce_string(item["name"]).casefold(),
        )
    )

    topic_breakdown = []
    for topic in CATEGORY_TOPICS[category]:
        claims_for_topic = [claim for claim in ranked_claims if claim["topic"] == topic]
        if not claims_for_topic:
            continue
        topic_breakdown.append(
            {
                "topic": topic,
                "support_count": len(topic_review_ids.get(topic, set())),
                "top_subjects": [claim["subject"] for claim in claims_for_topic[:3]],
                "quote_samples": _normalize_string_list(topic_quotes.get(topic, []), limit=3),
            }
        )

    overall_confidence = _confidence_from_support(
        review_count,
        max((claim["support_count"] for claim in ranked_claims), default=0),
    )
    if review_count >= 8 and ranked_claims:
        overall_confidence = "high"

    return {
        "category": category,
        "review_count": review_count,
        "claim_count": len(claims),
        "date_range": date_range,
        "overall_confidence": overall_confidence,
        "ranked_claims": ranked_claims[:14],
        "contradictions": contradictions[:8],
        "named_entity_support": named_entity_support[:10],
        "topic_breakdown": topic_breakdown,
        "factual_fit": {
            "type": _coerce_string(location_context.get("type")),
            "district": _coerce_string(location_context.get("district")),
            "metadata_highlights": _metadata_highlights(location_context),
            "placement_type": _coerce_string(editorial_intent.get("placement_type")),
            "selection_angle": _coerce_string(editorial_intent.get("selection_angle")),
        },
    }


def build_writer_brief(
    *,
    evidence_profile: dict[str, Any],
    location_context: dict[str, Any],
    editorial_intent: dict[str, Any],
) -> dict[str, Any]:
    category = _coerce_string(location_context.get("category"))
    review_count = int(evidence_profile.get("review_count") or 0)
    ranked_claims = [
        claim
        for claim in evidence_profile.get("ranked_claims", [])
        if isinstance(claim, dict)
    ]
    positive_claims = [
        claim for claim in ranked_claims if _coerce_string(claim.get("dominant_polarity")) != "negative"
    ][:6]
    caution_claims = [
        claim for claim in ranked_claims if _coerce_string(claim.get("dominant_polarity")) == "negative"
    ][:2]
    contradictions = [
        item for item in evidence_profile.get("contradictions", []) if isinstance(item, dict)
    ][:2]
    minimum_named_support = _named_entity_threshold(review_count)
    supported_named_entities = [
        entity
        for entity in evidence_profile.get("named_entity_support", [])
        if isinstance(entity, dict)
        and int(entity.get("support_count", 0)) >= minimum_named_support
        and int(entity.get("positive_count", 0)) >= int(entity.get("negative_count", 0))
    ][:6]

    return {
        "category": category,
        "review_count": review_count,
        "minimum_claims": 1 if review_count <= 1 else 2,
        "location_context": location_context,
        "editorial_intent": editorial_intent,
        "top_claims": positive_claims,
        "cautions": caution_claims,
        "contradictions": contradictions,
        "supported_named_entities": supported_named_entities,
        "known_named_entities": [
            entity
            for entity in evidence_profile.get("named_entity_support", [])
            if isinstance(entity, dict)
        ],
        "category_guidance": WRITER_GUIDANCE[category],
    }


def _render_location_facts(location_context: dict[str, Any]) -> str:
    lines = [
        f"- Name: {_coerce_string(location_context.get('name'))}",
        f"- Category: {_coerce_string(location_context.get('category'))}",
        f"- Type: {_coerce_string(location_context.get('type'))}",
        f"- District: {_coerce_string(location_context.get('district'))}",
        f"- Location key: {_coerce_string(location_context.get('location_key'))}",
    ]
    facts = location_context.get("facts") if isinstance(location_context.get("facts"), dict) else {}
    for key, value in facts.items():
        label = key.replace("_", " ")
        if isinstance(value, list):
            if value and all(isinstance(item, dict) for item in value):
                rendered = ", ".join(
                    f"{_coerce_string(item.get('day'))} {_coerce_string(item.get('hours'))}".strip()
                    for item in value
                    if isinstance(item, dict)
                )
            else:
                rendered = ", ".join(_normalize_string_list(value, limit=8))
        elif isinstance(value, bool):
            rendered = "yes" if value else "no"
        else:
            rendered = _coerce_string(value)
        if not rendered:
            continue
        lines.append(f"- {label.title()}: {rendered}")
    return "\n".join(lines)


def _render_editorial_constraints(editorial_intent: dict[str, Any]) -> str:
    lines = [
        f"- Placement type: {_coerce_string(editorial_intent.get('placement_type'))}",
        f"- Selection angle: {_coerce_string(editorial_intent.get('selection_angle'))}",
        f"- Audience: {_coerce_string(editorial_intent.get('audience'))}",
        f"- Tone: {_coerce_string(editorial_intent.get('tone'))}",
        f"- Must mention: {', '.join(_normalize_string_list(editorial_intent.get('must_mention'), limit=8)) or 'None'}",
        f"- Avoid: {', '.join(_normalize_string_list(editorial_intent.get('avoid'), limit=12)) or 'None'}",
    ]
    return "\n".join(lines)


def _render_claims(claims: list[dict[str, Any]]) -> str:
    if not claims:
        return "None"
    rendered = []
    for claim in claims:
        rendered.append(
            (
                f"- {claim['topic']}: {claim['subject']} "
                f"(support={claim['support_count']}, recent={claim['recent_support_count']}, "
                f"polarity={claim['dominant_polarity']}) "
                f"quotes={json.dumps(claim.get('quotes', []), ensure_ascii=False)}"
            )
        )
    return "\n".join(rendered)


def _render_cautions(
    caution_claims: list[dict[str, Any]],
    contradictions: list[dict[str, Any]],
) -> str:
    entries: list[str] = []
    for claim in caution_claims:
        entries.append(
            (
                f"- caution: {claim['topic']} / {claim['subject']} "
                f"(support={claim['support_count']}, polarity={claim['dominant_polarity']})"
            )
        )
    for contradiction in contradictions:
        entries.append(
            (
                f"- contradiction: {contradiction['topic']} / {contradiction['subject']} "
                f"(positive={contradiction['positive_count']}, negative={contradiction['negative_count']}) "
                f"quotes={json.dumps(contradiction.get('quotes', []), ensure_ascii=False)}"
            )
        )
    return "\n".join(entries) or "None"


def _render_supported_named_entities(named_entities: list[dict[str, Any]]) -> str:
    if not named_entities:
        return "None"
    return "\n".join(
        (
            f"- {entity['name']} (topic={entity['topic']}, support={entity['support_count']}, "
            f"positive={entity['positive_count']}, negative={entity['negative_count']})"
        )
        for entity in named_entities
    )


def build_writer_prompt(brief: dict[str, Any]) -> str:
    return WRITER_PROMPT.format(
        category=_coerce_string(brief.get("category")).replace("_", " "),
        category_guidance=_coerce_string(brief.get("category_guidance")),
        location_facts=_render_location_facts(
            brief.get("location_context") if isinstance(brief.get("location_context"), dict) else {}
        ),
        editorial_constraints=_render_editorial_constraints(
            brief.get("editorial_intent") if isinstance(brief.get("editorial_intent"), dict) else {}
        ),
        top_claims=_render_claims(
            brief.get("top_claims") if isinstance(brief.get("top_claims"), list) else []
        ),
        cautions=_render_cautions(
            brief.get("cautions") if isinstance(brief.get("cautions"), list) else [],
            brief.get("contradictions") if isinstance(brief.get("contradictions"), list) else [],
        ),
        approved_named_entities=_render_supported_named_entities(
            brief.get("supported_named_entities")
            if isinstance(brief.get("supported_named_entities"), list)
            else []
        ),
        minimum_claims=int(brief.get("minimum_claims") or 1),
    )


def _build_rewrite_prompt(
    *,
    brief: dict[str, Any],
    current_blurb: str,
    validation_errors: list[str],
) -> str:
    return WRITER_REWRITE_PROMPT.format(
        validation_errors="\n".join(f"- {item}" for item in validation_errors),
        category_guidance=_coerce_string(brief.get("category_guidance")),
        location_facts=_render_location_facts(
            brief.get("location_context") if isinstance(brief.get("location_context"), dict) else {}
        ),
        editorial_constraints=_render_editorial_constraints(
            brief.get("editorial_intent") if isinstance(brief.get("editorial_intent"), dict) else {}
        ),
        top_claims=_render_claims(
            brief.get("top_claims") if isinstance(brief.get("top_claims"), list) else []
        ),
        cautions=_render_cautions(
            brief.get("cautions") if isinstance(brief.get("cautions"), list) else [],
            brief.get("contradictions") if isinstance(brief.get("contradictions"), list) else [],
        ),
        approved_named_entities=_render_supported_named_entities(
            brief.get("supported_named_entities")
            if isinstance(brief.get("supported_named_entities"), list)
            else []
        ),
        current_blurb=current_blurb,
    )


def _sentence_count(text: str) -> int:
    sentences = [item for item in SENTENCE_SPLIT_PATTERN.split(text.strip()) if item.strip()]
    return len(sentences)


def _content_words(text: str) -> set[str]:
    return {
        word
        for word in WORD_PATTERN.findall(text.casefold())
        if word and word not in STOPWORDS
    }


def _count_concrete_terms(blurb: str, brief: dict[str, Any]) -> tuple[int, list[str]]:
    lower_blurb = blurb.casefold()
    concrete_terms: list[str] = []
    for claim in brief.get("top_claims", []) if isinstance(brief.get("top_claims"), list) else []:
        if not isinstance(claim, dict):
            continue
        concrete_terms.append(_coerce_string(claim.get("subject")))
    for entity in (
        brief.get("supported_named_entities")
        if isinstance(brief.get("supported_named_entities"), list)
        else []
    ):
        if not isinstance(entity, dict):
            continue
        concrete_terms.append(_coerce_string(entity.get("name")))
    matched = [
        term
        for term in _normalize_string_list(concrete_terms, limit=20)
        if len(term) >= 4 and term.casefold() in lower_blurb
    ]
    return len(set(term.casefold() for term in matched)), matched


def validate_category_blurb(
    *,
    blurb: str,
    brief: dict[str, Any],
) -> list[str]:
    errors: list[str] = []
    stripped = blurb.strip()
    if not stripped:
        return ["Blurb is empty."]

    if any(line.lstrip().startswith(("-", "*", "#")) for line in stripped.splitlines()) or "\n\n" in stripped:
        errors.append("Blurb must be a single paragraph without bullets or headings.")

    sentence_count = _sentence_count(stripped)
    if sentence_count < 4 or sentence_count > 6:
        errors.append("Blurb must contain 4 to 6 sentences.")

    if HYPE_WORD_PATTERN.search(stripped):
        errors.append("Blurb uses banned hype language.")

    if EMOJI_PATTERN.search(stripped):
        errors.append("Blurb contains emoji.")

    editorial_intent = (
        brief.get("editorial_intent") if isinstance(brief.get("editorial_intent"), dict) else {}
    )
    for avoid_term in _normalize_string_list(editorial_intent.get("avoid"), limit=12):
        if avoid_term.casefold() in stripped.casefold():
            errors.append(f"Blurb uses an avoid-term from editorial intent: {avoid_term}.")

    concrete_match_count, matched_terms = _count_concrete_terms(stripped, brief)
    minimum_claims = int(brief.get("minimum_claims") or 1)
    if concrete_match_count < minimum_claims:
        errors.append(
            "Blurb does not include enough concrete review-backed details "
            f"(matched: {', '.join(matched_terms) or 'none'})."
        )

    supported_entities = {
        _coerce_string(entity.get("name")).casefold(): _coerce_string(entity.get("name"))
        for entity in (
            brief.get("supported_named_entities")
            if isinstance(brief.get("supported_named_entities"), list)
            else []
        )
        if isinstance(entity, dict)
    }
    known_entities = {
        _coerce_string(entity.get("name")).casefold(): _coerce_string(entity.get("name"))
        for entity in (
            brief.get("known_named_entities")
            if isinstance(brief.get("known_named_entities"), list)
            else []
        )
        if isinstance(entity, dict)
    }
    lower_blurb = stripped.casefold()
    unsupported_mentions = [
        entity_name
        for key, entity_name in known_entities.items()
        if key in lower_blurb and key not in supported_entities
    ]
    if unsupported_mentions:
        errors.append(
            "Blurb mentions unsupported named entities: "
            + ", ".join(_normalize_string_list(unsupported_mentions, limit=6))
        )

    source_fields = [
        _coerce_string(editorial_intent.get("selection_angle")),
        _coerce_string(editorial_intent.get("placement_type")),
    ]
    for source_value in source_fields:
        if len(source_value) >= 6 and source_value.casefold() in lower_blurb:
            errors.append("Blurb restates editorial framing too directly.")
            break
        source_words = _content_words(source_value)
        if len(source_words) >= 3 and len(source_words & _content_words(stripped)) / len(source_words) >= 0.8:
            errors.append("Blurb tracks too closely to the editorial framing language.")
            break

    location_context = (
        brief.get("location_context") if isinstance(brief.get("location_context"), dict) else {}
    )
    metadata_terms = [
        _coerce_string(location_context.get("district")),
        _coerce_string(location_context.get("type")),
    ]
    if any(term and term.casefold() in lower_blurb for term in metadata_terms) and concrete_match_count < minimum_claims:
        errors.append("Blurb leans on metadata instead of review evidence.")

    return errors


def execute_category_writer(
    *,
    brief: dict[str, Any],
    max_tokens: int,
) -> str:
    llm = get_vertex_llm(temperature=0.6, max_tokens=max_tokens)
    prompt = build_writer_prompt(brief)
    result = llm.invoke(prompt)
    if not result or not result.strip():
        raise RuntimeError("Review2Blog category writer returned empty output")
    return result.strip()


def validate_and_rewrite_category_blurb(
    *,
    initial_blurb: str,
    brief: dict[str, Any],
    max_tokens: int,
) -> tuple[str, dict[str, Any]]:
    initial_errors = validate_category_blurb(blurb=initial_blurb, brief=brief)
    if not initial_errors:
        return initial_blurb.strip(), {
            "rewrite_applied": False,
            "initial_validation_errors": [],
            "rewritten_response": None,
        }

    llm = get_vertex_llm(temperature=0.4, max_tokens=max_tokens)
    rewrite_prompt = _build_rewrite_prompt(
        brief=brief,
        current_blurb=initial_blurb,
        validation_errors=initial_errors,
    )
    rewritten = llm.invoke(rewrite_prompt)
    if not rewritten or not rewritten.strip():
        raise RuntimeError("Review2Blog category writer rewrite returned empty output")
    rewritten = rewritten.strip()

    final_errors = validate_category_blurb(blurb=rewritten, brief=brief)
    if final_errors:
        raise RuntimeError(
            "Review2Blog category writer failed validation after rewrite: "
            + "; ".join(final_errors)
        )

    return rewritten, {
        "rewrite_applied": True,
        "initial_validation_errors": initial_errors,
        "rewritten_response": rewritten,
    }


def build_run_artifact(
    *,
    run_id: str,
    location_context: dict[str, Any],
    editorial_intent: dict[str, Any],
    phase1_summary: dict[str, Any],
    phase2_profile: dict[str, Any],
    blurb: str | None,
    quality_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "location_name": _coerce_string(location_context.get("name")),
        "location_context": location_context,
        "editorial_intent": editorial_intent,
        "phase_outputs": {
            "phase1_summary": phase1_summary,
            "phase2_profile": phase2_profile,
            "phase3": (
                None
                if blurb is None
                else {
                    "blurb": blurb,
                    "quality_gate": quality_meta or {},
                }
            ),
        },
    }


def build_markdown(location_context: dict[str, Any], blurb: str) -> str:
    title = _coerce_string(location_context.get("name")) or "Review2Blog Draft"
    return f"# {title}\n\n{blurb}".strip()
