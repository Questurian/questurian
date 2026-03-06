"""
Review2Blog API routes.

All routes are prefixed with /review2blog in the main router.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Body, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core import (
    clear_all_runs,
    read_output,
    read_stage_result,
    read_status,
    write_artifact,
    write_stage_result,
    write_status,
)
from utils import get_vertex_llm

from . import category_pipeline
from .graph import run_review2blog_graph
from .storage import get_all_completed_articles

router = APIRouter(prefix="/review2blog", tags=["review2blog"])
logger = logging.getLogger(__name__)
FEATURE_NAME = "review2blog"

DEFAULT_REVIEW2BLOG_MAX_TOKENS = 65536
MAX_REVIEW2BLOG_OUTPUT_TOKENS = 65536
DEFAULT_REVIEW2BLOG_PHASE1_BATCH_SIZE = 50
DEFAULT_REVIEW2BLOG_PHASE_RETRY_LIMIT = 1
DEFAULT_REVIEW2BLOG_RECENT_WINDOW_DAYS = 180

ASPECT_KEYS = ["food", "service", "atmosphere", "location", "value"]
ASPECT_LABELS = {
    "food": "food",
    "service": "service",
    "atmosphere": "atmosphere",
    "location": "location",
    "value": "value",
}
REVIEW_SENTIMENTS = {"positive", "mixed", "neutral", "negative"}
ASPECT_SENTIMENTS = {"positive", "mixed", "neutral", "negative", "unknown"}
SPECIFICITY_LEVELS = {"low", "medium", "high"}
CONFIDENCE_LEVELS = {"low", "medium", "high"}
INTENSITY_LEVELS = {"none", "low", "medium", "high"}
GROUP_VALUES = {
    "solo",
    "couple",
    "family",
    "friends",
    "business",
    "special_event",
    "other",
    "unknown",
}
MEAL_VALUES = {
    "breakfast",
    "brunch",
    "lunch",
    "dinner",
    "late_night",
    "drinks",
    "unknown",
}
OCCASION_VALUES = {
    "casual",
    "celebration",
    "date_night",
    "business_meal",
    "special_event",
    "unknown",
}
HYPE_WORD_PATTERN = re.compile(
    r"\b(best|must-try|world-class|can't miss|can’t miss|iconic|bucket list)\b",
    re.IGNORECASE,
)
EMOJI_PATTERN = re.compile(r"[\U0001F300-\U0001FAFF]")
SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[.!?])\s+")

REVIEW_SIGNAL_PROMPT = """You are an editorial restaurant analyst.

Convert each input review into a structured ReviewSignalV2 object.

INPUT
- Each input item contains: text (string), rating (number), date (YYYY-MM-DD)
- Return one output object for every input review.
- Preserve input order exactly.

RETURN ONLY VALID JSON.
Return a JSON array where each object matches this schema exactly:

{
  "date": "",
  "rating": 0,
  "review_sentiment": "positive | mixed | neutral | negative",
  "specificity": "low | medium | high",
  "contradictions": [],
  "dishes": [
    {
      "name": "",
      "sentiment": "positive | mixed | neutral | negative",
      "evidence_quote": ""
    }
  ],
  "visit_context": {
    "group": {
      "value": "solo | couple | family | friends | business | special_event | other | unknown",
      "confidence": "low | medium | high",
      "evidence": ""
    },
    "meal": {
      "value": "breakfast | brunch | lunch | dinner | late_night | drinks | unknown",
      "confidence": "low | medium | high",
      "evidence": ""
    },
    "occasion": {
      "value": "casual | celebration | date_night | business_meal | special_event | unknown",
      "confidence": "low | medium | high",
      "evidence": ""
    }
  },
  "food": {
    "mentioned": false,
    "sentiment": "positive | mixed | neutral | negative | unknown",
    "intensity": "none | low | medium | high",
    "descriptors": [],
    "evidence_quotes": []
  },
  "service": {
    "mentioned": false,
    "sentiment": "positive | mixed | neutral | negative | unknown",
    "intensity": "none | low | medium | high",
    "descriptors": [],
    "evidence_quotes": []
  },
  "atmosphere": {
    "mentioned": false,
    "sentiment": "positive | mixed | neutral | negative | unknown",
    "intensity": "none | low | medium | high",
    "descriptors": [],
    "evidence_quotes": []
  },
  "location": {
    "mentioned": false,
    "sentiment": "positive | mixed | neutral | negative | unknown",
    "intensity": "none | low | medium | high",
    "descriptors": [],
    "evidence_quotes": []
  },
  "value": {
    "mentioned": false,
    "sentiment": "positive | mixed | neutral | negative | unknown",
    "intensity": "none | low | medium | high",
    "descriptors": [],
    "evidence_quotes": []
  }
}

RULES
1. Copy date and rating from the input review.
2. Use unknown for visit context unless it is explicit or strongly implied.
3. Every aspect claim must be supported by direct review language.
4. Keep descriptors short and literal.
5. evidence_quotes must be verbatim snippets from the review, max 2 per aspect.
6. dishes must only include dishes named in the review.
7. Do not invent audiences, occasions, vibe, or dishes.
8. Return only valid JSON. No prose. No markdown fences.
"""

REVIEW_SIGNAL_RETRY_PROMPT = """Your previous response was invalid JSON.

Error:
{parse_error}

Return ONLY a valid JSON array for the same input reviews.

Requirements:
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

PHASE_2_SUMMARY_PROMPT = """You are an editorial restaurant analyst.

You receive deterministic aggregate metrics derived from structured diner review signals.
Do not change counts or numeric values. Do not invent dishes or unsupported claims.

Return ONLY valid JSON matching this schema:

{{
  "overall_vibe": "",
  "overall_confidence": "low | medium | high",
  "editorial_hooks": [],
  "food_summary": "",
  "service_summary": "",
  "atmosphere_summary": "",
  "location_summary": "",
  "value_summary": "",
  "crowd_summary": ""
}}

RULES
1. Summaries must be grounded in the provided metrics and evidence quotes.
2. overall_vibe should be one short phrase.
3. editorial_hooks should be concise, factual hooks for later listicle writing.
4. If evidence is thin, use restrained language.
5. Return only valid JSON. No prose. No markdown fences.

AGGREGATE INPUT:
{aggregate_input}
"""

PHASE_2_SUMMARY_RETRY_PROMPT = """Your previous response was invalid JSON.

Error:
{parse_error}

Return ONLY valid JSON for the same aggregate input.
- No markdown fences
- No trailing commas
- No commentary

Original prompt:
{original_prompt}

Invalid response:
{previous_response}
"""

PHASE_3_LISTICLE_PROMPT = """You are writing a short restaurant blurb for a curated food listicle.

LISTICLE CONTEXT
Type: {listicle_type}
Title: "{listicle_title}"
Goal: {listicle_goal}

RESTAURANT CONTEXT
Name: {name}
District: {district}
Neighborhood: {neighborhood_description}
Description: {description}
Reviews Summary: {reviews_summary}

REVIEW INTELLIGENCE
{aggregated_profile}

SUPPORTED DISHES
{supported_dishes}

RULES
1. Write one paragraph with 4 to 6 sentences.
2. Make the restaurant feel right for this listicle, but stay grounded in the review intelligence.
3. Only mention dishes from the SUPPORTED DISHES list.
4. If SUPPORTED DISHES is "None", do not mention any named dish.
5. Mention Barranco only if the restaurant context explicitly says Barranco.
6. Avoid hype words such as best, must-try, world-class, iconic, and bucket list.
7. Do not use bullets, headings, emojis, or markdown.
8. Do not invent facts, audiences, or claims not supported by the review intelligence.

Return only the paragraph.
"""

PHASE_3_LISTICLE_REWRITE_PROMPT = """Rewrite this restaurant blurb so it passes the validation rules.

VALIDATION FAILURES
{validation_errors}

LISTICLE CONTEXT
Type: {listicle_type}
Title: "{listicle_title}"
Goal: {listicle_goal}

RESTAURANT CONTEXT
Name: {name}
District: {district}
Neighborhood: {neighborhood_description}
Description: {description}
Reviews Summary: {reviews_summary}

REVIEW INTELLIGENCE
{aggregated_profile}

SUPPORTED DISHES
{supported_dishes}

CURRENT BLURB
{current_blurb}

Return only one corrected paragraph with 4 to 6 sentences.
"""

LEGACY_GROUP_MAP = {
    0: "other",
    1: "solo",
    2: "couple",
    3: "family",
    4: "friends",
    5: "business",
    6: "special_event",
}
LEGACY_MEAL_MAP = {
    0: "unknown",
    1: "breakfast",
    2: "brunch",
    3: "lunch",
    4: "dinner",
    5: "late_night",
    6: "drinks",
}
LEGACY_OCCASION_MAP = {
    0: "unknown",
    1: "casual",
    2: "celebration",
    3: "date_night",
    4: "business_meal",
}
LEGACY_SENTIMENT_MAP = {
    -1: "negative",
    0: "neutral",
    1: "positive",
}
LEGACY_SPECIFICITY_MAP = {1: "low", 2: "medium", 3: "high"}
LEGACY_INTENSITY_MAP = {0: "none", 1: "low", 2: "medium", 3: "high"}


class Review2BlogRunRequest(BaseModel):
    review_payload: dict[str, Any] = Field(..., description="Original review JSON payload")
    max_tokens: int | None = Field(default=None)


class Review2BlogResumeRequest(BaseModel):
    editorial: dict[str, Any] = Field(
        default_factory=dict,
        description="Editorial intent for legacy paused runs.",
    )
    listicle: dict[str, Any] = Field(
        default_factory=dict,
        description="Legacy listicle config for backward compatibility.",
    )
    max_tokens: int | None = Field(default=None)


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


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
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


def _normalize_enum(value: Any, allowed: set[str], default: str) -> str:
    normalized = _coerce_string(value).lower().replace(" ", "_")
    return normalized if normalized in allowed else default


def _normalize_sentiment(value: Any, default: str = "neutral") -> str:
    return _normalize_enum(value, REVIEW_SENTIMENTS, default)


def _normalize_aspect_sentiment(value: Any, default: str = "unknown") -> str:
    return _normalize_enum(value, ASPECT_SENTIMENTS, default)


def _normalize_specificity(value: Any, default: str = "low") -> str:
    return _normalize_enum(value, SPECIFICITY_LEVELS, default)


def _normalize_confidence(value: Any, default: str = "low") -> str:
    return _normalize_enum(value, CONFIDENCE_LEVELS, default)


def _normalize_intensity(value: Any, default: str = "none") -> str:
    return _normalize_enum(value, INTENSITY_LEVELS, default)


def _parse_review_date(value: Any) -> date | None:
    text = _coerce_string(value)
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _fallback_review_sentiment(rating: Any) -> str:
    rating_value = _coerce_float(rating, 0.0)
    if rating_value >= 4.5:
        return "positive"
    if rating_value <= 2.0:
        return "negative"
    if rating_value >= 3.5:
        return "positive"
    if rating_value <= 2.5:
        return "negative"
    if rating_value == 3:
        return "neutral"
    return "mixed"


def _fallback_specificity(source_review: dict[str, Any], dishes: list[dict[str, Any]]) -> str:
    text = _coerce_string(source_review.get("text"))
    if dishes or len(text.split()) >= 18:
        return "high"
    if len(text.split()) >= 8:
        return "medium"
    return "low"


def _default_aspect() -> dict[str, Any]:
    return {
        "mentioned": False,
        "sentiment": "unknown",
        "intensity": "none",
        "descriptors": [],
        "evidence_quotes": [],
    }


def _normalize_aspect(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return _default_aspect()

    mentioned = bool(value.get("mentioned"))
    descriptors = _normalize_string_list(value.get("descriptors"), limit=5)
    evidence_quotes = _normalize_string_list(value.get("evidence_quotes"), limit=2)
    sentiment_default = "neutral" if mentioned else "unknown"
    intensity_default = "low" if mentioned else "none"
    sentiment = _normalize_aspect_sentiment(value.get("sentiment"), sentiment_default)
    intensity = _normalize_intensity(value.get("intensity"), intensity_default)

    if not mentioned and (descriptors or evidence_quotes):
        mentioned = True
    if not mentioned:
        sentiment = "unknown"
        intensity = "none"

    return {
        "mentioned": mentioned,
        "sentiment": sentiment,
        "intensity": intensity,
        "descriptors": descriptors,
        "evidence_quotes": evidence_quotes,
    }


def _normalize_visit_context_field(
    value: Any,
    *,
    allowed: set[str],
) -> dict[str, str]:
    if not isinstance(value, dict):
        return {"value": "unknown", "confidence": "low", "evidence": ""}

    normalized_value = _normalize_enum(value.get("value"), allowed, "unknown")
    evidence = _coerce_string(value.get("evidence"))
    confidence_default = "medium" if normalized_value != "unknown" and evidence else "low"
    confidence = _normalize_confidence(value.get("confidence"), confidence_default)
    if normalized_value == "unknown":
        confidence = "low"
        evidence = ""
    return {
        "value": normalized_value,
        "confidence": confidence,
        "evidence": evidence,
    }


def _normalize_dish(value: Any) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    name = _coerce_string(value.get("name"))
    if not name:
        return None
    return {
        "name": name,
        "sentiment": _normalize_sentiment(value.get("sentiment"), "neutral"),
        "evidence_quote": _coerce_string(value.get("evidence_quote")),
    }


def _compact_block_to_aspect(value: Any, sentiment: str, standout_phrases: list[str]) -> dict[str, Any]:
    descriptors: list[str] = []
    intensity = "none"
    if isinstance(value, list) and len(value) >= 2:
        descriptors = _normalize_string_list(value[0], limit=5)
        intensity_code = _coerce_int(value[1], 0)
        intensity = LEGACY_INTENSITY_MAP.get(intensity_code, "none")
    mentioned = bool(descriptors) or intensity != "none"
    return {
        "mentioned": mentioned,
        "sentiment": sentiment if mentioned else "unknown",
        "intensity": intensity if mentioned else "none",
        "descriptors": descriptors,
        "evidence_quotes": standout_phrases[:2] if mentioned else [],
    }


def _looks_like_compact_signal(value: Any) -> bool:
    return isinstance(value, dict) and "d" in value and "vc" in value and "e" in value


def _rehydrate_compact_signal(value: dict[str, Any]) -> dict[str, Any]:
    review_sentiment = LEGACY_SENTIMENT_MAP.get(_coerce_int(value.get("s"), 0), "neutral")
    specificity = LEGACY_SPECIFICITY_MAP.get(_coerce_int(value.get("spc"), 1), "low")
    standout_phrases = _normalize_string_list(value.get("sp"), limit=2)
    visit_context_raw = value.get("vc") if isinstance(value.get("vc"), list) else []
    experience = value.get("e") if isinstance(value.get("e"), dict) else {}
    dishes = [
        {
            "name": dish,
            "sentiment": review_sentiment,
            "evidence_quote": standout_phrases[0] if standout_phrases else "",
        }
        for dish in _normalize_string_list(value.get("dm"), limit=8)
    ]
    return {
        "date": _coerce_string(value.get("d")),
        "rating": _coerce_float(value.get("r"), 0.0),
        "review_sentiment": review_sentiment,
        "specificity": specificity,
        "contradictions": [],
        "dishes": dishes,
        "visit_context": {
            "group": {
                "value": LEGACY_GROUP_MAP.get(_coerce_int(visit_context_raw[0] if len(visit_context_raw) > 0 else 0, 0), "unknown"),
                "confidence": "medium",
                "evidence": "",
            },
            "meal": {
                "value": LEGACY_MEAL_MAP.get(_coerce_int(visit_context_raw[1] if len(visit_context_raw) > 1 else 0, 0), "unknown"),
                "confidence": "medium",
                "evidence": "",
            },
            "occasion": {
                "value": LEGACY_OCCASION_MAP.get(_coerce_int(visit_context_raw[2] if len(visit_context_raw) > 2 else 0, 0), "unknown"),
                "confidence": "medium",
                "evidence": "",
            },
        },
        "food": _compact_block_to_aspect(experience.get("f"), review_sentiment, standout_phrases),
        "service": _compact_block_to_aspect(experience.get("sv"), review_sentiment, standout_phrases),
        "atmosphere": _compact_block_to_aspect(experience.get("a"), review_sentiment, standout_phrases),
        "location": _compact_block_to_aspect(experience.get("l"), review_sentiment, standout_phrases),
        "value": _compact_block_to_aspect(experience.get("v"), review_sentiment, standout_phrases),
    }


def _normalize_review_signal(value: Any, source_review: dict[str, Any]) -> dict[str, Any]:
    if isinstance(value, dict) and _looks_like_compact_signal(value):
        value = _rehydrate_compact_signal(value)

    if not isinstance(value, dict):
        raise RuntimeError("Phase 1 item must be an object.")

    dishes = [
        dish
        for dish in (
            _normalize_dish(item)
            for item in (value.get("dishes") if isinstance(value.get("dishes"), list) else [])
        )
        if dish is not None
    ]

    normalized = {
        "date": _coerce_string(value.get("date")) or _coerce_string(source_review.get("date")),
        "rating": _coerce_float(value.get("rating"), _coerce_float(source_review.get("rating"), 0.0)),
        "review_sentiment": _normalize_sentiment(
            value.get("review_sentiment"),
            _fallback_review_sentiment(source_review.get("rating")),
        ),
        "specificity": _normalize_specificity(
            value.get("specificity"),
            _fallback_specificity(source_review, dishes),
        ),
        "contradictions": _normalize_string_list(value.get("contradictions"), limit=4),
        "dishes": dishes,
        "visit_context": {
            "group": _normalize_visit_context_field(
                value.get("visit_context", {}).get("group") if isinstance(value.get("visit_context"), dict) else {},
                allowed=GROUP_VALUES,
            ),
            "meal": _normalize_visit_context_field(
                value.get("visit_context", {}).get("meal") if isinstance(value.get("visit_context"), dict) else {},
                allowed=MEAL_VALUES,
            ),
            "occasion": _normalize_visit_context_field(
                value.get("visit_context", {}).get("occasion") if isinstance(value.get("visit_context"), dict) else {},
                allowed=OCCASION_VALUES,
            ),
        },
    }

    for aspect_key in ASPECT_KEYS:
        normalized[aspect_key] = _normalize_aspect(value.get(aspect_key))

    return normalized


def _normalize_phase1_signals(parsed: Any, reviews: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(parsed, list):
        raise RuntimeError("Phase 1 output must be a JSON array.")
    if len(parsed) != len(reviews):
        raise RuntimeError(
            f"Phase 1 output count mismatch: expected {len(reviews)} items, received {len(parsed)}."
        )
    return [
        _normalize_review_signal(item, source_review)
        for item, source_review in zip(parsed, reviews, strict=False)
    ]


def _normalize_phase2_input_signals(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise HTTPException(status_code=400, detail="JSON root must be an array.")

    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(payload):
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Signal at index {index} must be an object.",
            )
        source_review = {
            "date": item.get("date") or item.get("d"),
            "rating": item.get("rating") if "rating" in item else item.get("r"),
            "text": "",
        }
        normalized.append(_normalize_review_signal(item, source_review))
    return normalized


def _default_phase2_profile() -> dict[str, Any]:
    return {
        "review_count": 0,
        "average_rating": 0.0,
        "date_range": {"earliest": None, "latest": None},
        "overall_vibe": "",
        "overall_confidence": "low",
        "contradictions": [],
        "editorial_hooks": [],
        "standout_dishes": [],
        "food": {
            "summary": "",
            "confidence": "low",
            "support_count": 0,
            "recent_support_count": 0,
            "positive_descriptors": [],
            "negative_descriptors": [],
            "evidence_quotes": [],
            "contradictions": [],
        },
        "service": {
            "summary": "",
            "confidence": "low",
            "support_count": 0,
            "recent_support_count": 0,
            "positive_descriptors": [],
            "negative_descriptors": [],
            "evidence_quotes": [],
            "contradictions": [],
            "reliability": "medium",
            "energy": "neutral",
        },
        "atmosphere": {
            "summary": "",
            "confidence": "low",
            "support_count": 0,
            "recent_support_count": 0,
            "positive_descriptors": [],
            "negative_descriptors": [],
            "evidence_quotes": [],
            "contradictions": [],
            "noise_level": "unknown",
            "best_for": [],
        },
        "location": {
            "summary": "",
            "confidence": "low",
            "support_count": 0,
            "recent_support_count": 0,
            "positive_descriptors": [],
            "negative_descriptors": [],
            "evidence_quotes": [],
            "contradictions": [],
        },
        "value": {
            "summary": "",
            "confidence": "low",
            "support_count": 0,
            "recent_support_count": 0,
            "positive_descriptors": [],
            "negative_descriptors": [],
            "evidence_quotes": [],
            "contradictions": [],
            "perception": "mixed",
        },
        "crowd": {
            "summary": "",
            "confidence": "low",
            "group_types": [],
            "common_occasions": [],
            "evidence_quotes": [],
        },
    }


def _looks_like_legacy_profile(payload: Any) -> bool:
    return isinstance(payload, dict) and "date_range" not in payload and "food" in payload


def _normalize_phase2_profile_input(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict) and not _looks_like_legacy_profile(payload):
        profile = _default_phase2_profile()
        profile["review_count"] = _coerce_int(payload.get("review_count"), 0)
        profile["average_rating"] = round(_coerce_float(payload.get("average_rating"), 0.0), 1)
        date_range = payload.get("date_range") if isinstance(payload.get("date_range"), dict) else {}
        profile["date_range"] = {
            "earliest": _coerce_string(date_range.get("earliest")) or None,
            "latest": _coerce_string(date_range.get("latest")) or None,
        }
        profile["overall_vibe"] = _coerce_string(payload.get("overall_vibe"))
        profile["overall_confidence"] = _normalize_confidence(payload.get("overall_confidence"), "low")
        profile["contradictions"] = payload.get("contradictions") if isinstance(payload.get("contradictions"), list) else []
        profile["editorial_hooks"] = _normalize_string_list(payload.get("editorial_hooks"), limit=5)
        dishes = payload.get("standout_dishes")
        if isinstance(dishes, list):
            normalized_dishes = []
            for item in dishes:
                if not isinstance(item, dict):
                    continue
                name = _coerce_string(item.get("name"))
                if not name:
                    continue
                normalized_dishes.append(
                    {
                        "name": name,
                        "positive_count": _coerce_int(item.get("positive_count"), 0),
                        "negative_count": _coerce_int(item.get("negative_count"), 0),
                        "support_count": _coerce_int(item.get("support_count"), 0),
                        "recent_support_count": _coerce_int(item.get("recent_support_count"), 0),
                        "evidence_quotes": _normalize_string_list(item.get("evidence_quotes"), limit=3),
                    }
                )
            profile["standout_dishes"] = normalized_dishes

        for aspect_key in ASPECT_KEYS + ["crowd"]:
            incoming = payload.get(aspect_key)
            if not isinstance(incoming, dict):
                continue
            target = profile[aspect_key]
            target["summary"] = _coerce_string(incoming.get("summary"))
            target["confidence"] = _normalize_confidence(incoming.get("confidence"), target["confidence"])
            if aspect_key != "crowd":
                target["support_count"] = _coerce_int(incoming.get("support_count"), 0)
                target["recent_support_count"] = _coerce_int(incoming.get("recent_support_count"), 0)
                target["positive_descriptors"] = _normalize_string_list(
                    incoming.get("positive_descriptors"),
                    limit=5,
                )
                target["negative_descriptors"] = _normalize_string_list(
                    incoming.get("negative_descriptors"),
                    limit=5,
                )
                target["evidence_quotes"] = _normalize_string_list(
                    incoming.get("evidence_quotes"),
                    limit=3,
                )
                target["contradictions"] = (
                    incoming.get("contradictions")
                    if isinstance(incoming.get("contradictions"), list)
                    else []
                )
                if aspect_key == "service":
                    target["reliability"] = _normalize_enum(
                        incoming.get("reliability"),
                        {"low", "medium", "high"},
                        "medium",
                    )
                    target["energy"] = _normalize_enum(
                        incoming.get("energy"),
                        {"cold", "neutral", "warm"},
                        "neutral",
                    )
                if aspect_key == "atmosphere":
                    target["noise_level"] = _normalize_enum(
                        incoming.get("noise_level"),
                        {"quiet", "moderate", "loud", "unknown"},
                        "unknown",
                    )
                    target["best_for"] = _normalize_string_list(incoming.get("best_for"), limit=5)
                if aspect_key == "value":
                    target["perception"] = _normalize_enum(
                        incoming.get("perception"),
                        {"poor", "fair", "good", "excellent", "mixed"},
                        "mixed",
                    )
            else:
                target["group_types"] = _normalize_string_list(incoming.get("group_types"), limit=5)
                target["common_occasions"] = _normalize_string_list(
                    incoming.get("common_occasions"),
                    limit=5,
                )
                target["evidence_quotes"] = _normalize_string_list(
                    incoming.get("evidence_quotes"),
                    limit=3,
                )
        return profile

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="aggregated_profile must be an object.")

    profile = _default_phase2_profile()
    profile["review_count"] = _coerce_int(payload.get("review_count"), 0)
    profile["average_rating"] = round(_coerce_float(payload.get("average_rating"), 0.0), 1)
    profile["overall_vibe"] = _coerce_string(payload.get("overall_vibe"))

    food = payload.get("food") if isinstance(payload.get("food"), dict) else {}
    profile["food"].update(
        {
            "positive_descriptors": _normalize_string_list(food.get("top_descriptors"), limit=5),
            "summary": _coerce_string(food.get("summary")),
        }
    )
    profile["standout_dishes"] = [
        {
            "name": name,
            "positive_count": 1,
            "negative_count": 0,
            "support_count": 1,
            "recent_support_count": 1,
            "evidence_quotes": [],
        }
        for name in _normalize_string_list(food.get("top_dishes"), limit=8)
    ]

    service = payload.get("service") if isinstance(payload.get("service"), dict) else {}
    profile["service"].update(
        {
            "positive_descriptors": _normalize_string_list(service.get("top_descriptors"), limit=5),
            "reliability": _normalize_enum(
                service.get("reliability"),
                {"low", "medium", "high"},
                "medium",
            ),
            "energy": _normalize_enum(
                service.get("energy"),
                {"cold", "neutral", "warm"},
                "neutral",
            ),
        }
    )

    atmosphere = payload.get("atmosphere") if isinstance(payload.get("atmosphere"), dict) else {}
    profile["atmosphere"].update(
        {
            "positive_descriptors": _normalize_string_list(
                atmosphere.get("top_descriptors"),
                limit=5,
            ),
            "noise_level": _normalize_enum(
                atmosphere.get("noise_level"),
                {"quiet", "moderate", "loud", "unknown"},
                "unknown",
            ),
            "best_for": _normalize_string_list(atmosphere.get("best_for"), limit=5),
        }
    )

    value = payload.get("value") if isinstance(payload.get("value"), dict) else {}
    profile["value"].update(
        {
            "perception": _normalize_enum(
                value.get("perception"),
                {"poor", "fair", "good", "excellent", "mixed"},
                "mixed",
            ),
            "positive_descriptors": _normalize_string_list(value.get("notes"), limit=5),
        }
    )

    crowd = payload.get("crowd") if isinstance(payload.get("crowd"), dict) else {}
    profile["crowd"].update(
        {
            "group_types": _normalize_string_list(crowd.get("group_types"), limit=5),
            "common_occasions": _normalize_string_list(crowd.get("common_occasions"), limit=5),
        }
    )

    return profile


def _validate_payload(payload: Any) -> dict[str, Any]:
    """Validate input payload with reviews array and optional restaurant context."""
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="JSON root must be an object with 'reviews' array.",
        )

    if "reviews" not in payload:
        raise HTTPException(status_code=400, detail="Missing 'reviews' field.")

    reviews = payload["reviews"]
    if not isinstance(reviews, list):
        raise HTTPException(status_code=400, detail="'reviews' must be an array.")

    for index, item in enumerate(reviews):
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Review at index {index} must be an object.",
            )
        missing_fields = [
            field for field in ("text", "rating", "date") if field not in item
        ]
        if missing_fields:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Review at index {index} missing fields: "
                    f"{', '.join(missing_fields)}."
                ),
            )

    return payload


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


def _strict_parse_object(raw_text: str) -> tuple[dict[str, Any] | None, str | None]:
    try:
        parsed = json.loads(raw_text.strip())
    except json.JSONDecodeError as exc:
        return None, str(exc)
    if not isinstance(parsed, dict):
        return None, "Expected a JSON object in LLM response."
    return parsed, None


def _strict_parse_array(raw_text: str) -> tuple[list[Any] | None, str | None]:
    try:
        parsed = json.loads(raw_text.strip())
    except json.JSONDecodeError as exc:
        return None, str(exc)
    if not isinstance(parsed, list):
        return None, "Expected a JSON array in LLM response."
    return parsed, None


def _repair_parse_object(raw_text: str) -> tuple[dict[str, Any] | None, str | None]:
    cleaned = _extract_json_payload(raw_text)
    if not cleaned:
        return None, "Empty response"
    obj_start = cleaned.find("{")
    if obj_start == -1:
        return None, "No JSON object found in response."
    trimmed = cleaned[obj_start:]
    try:
        parsed = json.loads(trimmed)
    except json.JSONDecodeError:
        sanitized = _strip_trailing_commas(trimmed)
        try:
            parsed = json.loads(sanitized)
        except json.JSONDecodeError as exc:
            return None, str(exc)
    if not isinstance(parsed, dict):
        return None, "Expected a JSON object in LLM response."
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


def _resolve_max_tokens(max_tokens: int | None) -> int:
    resolved = max_tokens
    if resolved is None:
        env_value = os.getenv("REVIEW2BLOG_MAX_TOKENS")
        if env_value:
            try:
                resolved = int(env_value)
            except ValueError:
                logger.warning(
                    "Invalid REVIEW2BLOG_MAX_TOKENS=%s; falling back to default=%s",
                    env_value,
                    DEFAULT_REVIEW2BLOG_MAX_TOKENS,
                )
                resolved = DEFAULT_REVIEW2BLOG_MAX_TOKENS
    resolved = resolved if resolved is not None else DEFAULT_REVIEW2BLOG_MAX_TOKENS
    if resolved > MAX_REVIEW2BLOG_OUTPUT_TOKENS:
        logger.warning(
            "Requested max_tokens=%s exceeds provider limit; clamping to %s",
            resolved,
            MAX_REVIEW2BLOG_OUTPUT_TOKENS,
        )
        return MAX_REVIEW2BLOG_OUTPUT_TOKENS
    return resolved


def _resolve_phase1_batch_size() -> int:
    env_value = os.getenv("REVIEW2BLOG_PHASE1_BATCH_SIZE")
    if not env_value:
        return DEFAULT_REVIEW2BLOG_PHASE1_BATCH_SIZE
    try:
        resolved = int(env_value)
    except ValueError:
        logger.warning(
            "Invalid REVIEW2BLOG_PHASE1_BATCH_SIZE=%s; falling back to default=%s",
            env_value,
            DEFAULT_REVIEW2BLOG_PHASE1_BATCH_SIZE,
        )
        return DEFAULT_REVIEW2BLOG_PHASE1_BATCH_SIZE
    return max(1, resolved)


def _resolve_phase_retry_limit() -> int:
    env_value = os.getenv("REVIEW2BLOG_PHASE_RETRY_LIMIT")
    if not env_value:
        return DEFAULT_REVIEW2BLOG_PHASE_RETRY_LIMIT
    try:
        resolved = int(env_value)
    except ValueError:
        logger.warning(
            "Invalid REVIEW2BLOG_PHASE_RETRY_LIMIT=%s; falling back to default=%s",
            env_value,
            DEFAULT_REVIEW2BLOG_PHASE_RETRY_LIMIT,
        )
        return DEFAULT_REVIEW2BLOG_PHASE_RETRY_LIMIT
    return max(0, resolved)


def _resolve_recent_window_days() -> int:
    env_value = os.getenv("REVIEW2BLOG_RECENT_WINDOW_DAYS")
    if not env_value:
        return DEFAULT_REVIEW2BLOG_RECENT_WINDOW_DAYS
    try:
        resolved = int(env_value)
    except ValueError:
        logger.warning(
            "Invalid REVIEW2BLOG_RECENT_WINDOW_DAYS=%s; falling back to default=%s",
            env_value,
            DEFAULT_REVIEW2BLOG_RECENT_WINDOW_DAYS,
        )
        return DEFAULT_REVIEW2BLOG_RECENT_WINDOW_DAYS
    return max(1, resolved)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_langgraph_trace(run_id: str) -> dict[str, str]:
    stage_payload = read_stage_result(run_id, "langgraph_trace")
    if not isinstance(stage_payload, dict):
        return {}
    data = stage_payload.get("data")
    if not isinstance(data, dict):
        return {}

    trace_payload: dict[str, str] = {}
    trace_url = data.get("langsmith_trace_url")
    if isinstance(trace_url, str) and trace_url.strip():
        trace_payload["langsmith_trace_url"] = trace_url.strip()
    trace_run_id = data.get("langsmith_trace_run_id")
    if isinstance(trace_run_id, str) and trace_run_id.strip():
        trace_payload["langsmith_trace_run_id"] = trace_run_id.strip()
    return trace_payload


def _write_running_status(run_id: str, stage: str) -> None:
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": stage,
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )


def _normalize_listicle(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {
            "listicle_type": "",
            "listicle_title": "",
            "listicle_goal": "",
        }
    return {
        "listicle_type": _coerce_string(value.get("listicle_type")),
        "listicle_title": _coerce_string(value.get("listicle_title")),
        "listicle_goal": _coerce_string(value.get("listicle_goal")),
    }


def _listicle_is_complete(listicle: dict[str, str]) -> bool:
    return all(_coerce_string(listicle.get(field)) for field in ("listicle_type", "listicle_title", "listicle_goal"))


def _legacy_editorial_from_resume_request(request: Review2BlogResumeRequest) -> dict[str, Any]:
    if isinstance(request.editorial, dict) and request.editorial:
        return category_pipeline._normalize_editorial_intent(request.editorial)

    listicle = _normalize_listicle(request.listicle)
    return category_pipeline._normalize_editorial_intent(
        {
            "placement_type": listicle.get("listicle_type", ""),
            "selection_angle": listicle.get("listicle_goal", ""),
            "audience": listicle.get("listicle_title", ""),
            "tone": "grounded_editorial",
            "must_mention": [],
            "avoid": [],
        }
    )


def _chunk_reviews(reviews: list[dict[str, Any]], batch_size: int) -> list[list[dict[str, Any]]]:
    return [reviews[index:index + batch_size] for index in range(0, len(reviews), batch_size)]


def _is_recent_signal(signal: dict[str, Any], latest_review_date: date | None) -> bool:
    if latest_review_date is None:
        return False
    signal_date = _parse_review_date(signal.get("date"))
    if signal_date is None:
        return False
    threshold = latest_review_date - timedelta(days=_resolve_recent_window_days())
    return signal_date >= threshold


def _top_values(counter: dict[str, int], limit: int = 5) -> list[str]:
    return [
        key
        for key, _value in sorted(
            counter.items(),
            key=lambda item: (-item[1], item[0]),
        )[:limit]
    ]


def _confidence_from_support(review_count: int, support_count: int) -> str:
    if review_count <= 1:
        return "medium" if support_count else "low"
    if support_count >= max(3, math.ceil(review_count / 2)):
        return "high"
    if support_count >= 2:
        return "medium"
    return "low"


def _build_aspect_contradictions(
    *,
    aspect_label: str,
    positive_count: int,
    negative_count: int,
    evidence_quotes: list[str],
) -> list[dict[str, Any]]:
    if positive_count <= 0 or negative_count <= 0:
        return []
    return [
        {
            "topic": aspect_label,
            "summary": f"Reviews split on {aspect_label}.",
            "evidence_quotes": evidence_quotes[:3],
        }
    ]


def _compute_service_reliability(service_sentiments: list[str]) -> str:
    if not service_sentiments:
        return "medium"
    counts = {
        key: service_sentiments.count(key)
        for key in {"positive", "mixed", "neutral", "negative"}
    }
    non_zero = [value for value in counts.values() if value > 0]
    if len(non_zero) <= 1:
        return "high"
    dominant = max(non_zero)
    ratio = dominant / len(service_sentiments)
    if ratio >= 0.7:
        return "medium"
    return "low"


def _compute_service_energy(positive_count: int, negative_count: int) -> str:
    if positive_count > negative_count:
        return "warm"
    if negative_count > positive_count and negative_count > 0:
        return "cold"
    return "neutral"


def _compute_noise_level(signals: list[dict[str, Any]]) -> str:
    quiet_hits = 0
    moderate_hits = 0
    loud_hits = 0
    for signal in signals:
        atmosphere = signal.get("atmosphere") if isinstance(signal.get("atmosphere"), dict) else {}
        texts = [
            *_normalize_string_list(atmosphere.get("descriptors")),
            *_normalize_string_list(atmosphere.get("evidence_quotes")),
        ]
        for text in texts:
            normalized = text.casefold()
            if any(word in normalized for word in ("quiet", "calm", "peaceful", "intimate", "hushed")):
                quiet_hits += 1
            if any(word in normalized for word in ("buzzy", "busy", "lively", "energetic")):
                moderate_hits += 1
            if any(word in normalized for word in ("loud", "noisy", "packed", "crowded", "thumping")):
                loud_hits += 1

    if loud_hits > 0 and loud_hits >= max(quiet_hits, moderate_hits):
        return "loud"
    if quiet_hits > 0 and quiet_hits > max(loud_hits, moderate_hits):
        return "quiet"
    if moderate_hits > 0:
        return "moderate"
    return "unknown"


def _compute_best_for(
    *,
    review_count: int,
    group_counts: dict[str, int],
    occasion_counts: dict[str, int],
) -> list[str]:
    minimum_support = 1 if review_count == 1 else 2
    values: list[str] = []
    for group_value, label in {
        "couple": "date night",
        "family": "family meals",
        "friends": "group dinners",
        "business": "business meals",
        "special_event": "celebrations",
    }.items():
        if group_counts.get(group_value, 0) >= minimum_support:
            values.append(label)
    for occasion_value, label in {
        "celebration": "celebrations",
        "date_night": "date night",
        "business_meal": "business meals",
        "casual": "casual outings",
        "special_event": "special occasions",
    }.items():
        if occasion_counts.get(occasion_value, 0) >= minimum_support and label not in values:
            values.append(label)
    return values[:5]


def _compute_value_perception(
    *,
    positive_count: int,
    negative_count: int,
    average_rating: float,
) -> str:
    if positive_count == negative_count and positive_count > 0:
        return "mixed"
    if positive_count > negative_count * 2 and average_rating >= 4.5:
        return "excellent"
    if positive_count > negative_count:
        return "good"
    if negative_count > positive_count * 2 and average_rating < 3.5:
        return "poor"
    if negative_count > positive_count:
        return "fair"
    if average_rating >= 4.5:
        return "good"
    if average_rating <= 2.5:
        return "fair"
    return "mixed"


def _build_phase2_base_profile(signals: list[dict[str, Any]]) -> dict[str, Any]:
    profile = _default_phase2_profile()
    review_count = len(signals)
    ratings = [_coerce_float(signal.get("rating"), 0.0) for signal in signals]
    average_rating = round(sum(ratings) / review_count, 1) if review_count else 0.0
    parsed_dates = [parsed for parsed in (_parse_review_date(signal.get("date")) for signal in signals) if parsed]
    earliest = min(parsed_dates).isoformat() if parsed_dates else None
    latest = max(parsed_dates).isoformat() if parsed_dates else None
    latest_review_date = max(parsed_dates) if parsed_dates else None

    profile["review_count"] = review_count
    profile["average_rating"] = average_rating
    profile["date_range"] = {"earliest": earliest, "latest": latest}

    overall_support_total = 0
    contradictions: list[dict[str, Any]] = []

    group_counts: dict[str, int] = {}
    occasion_counts: dict[str, int] = {}
    crowd_evidence: list[str] = []

    dish_stats: dict[str, dict[str, Any]] = {}

    for aspect_key in ASPECT_KEYS:
        positive_descriptor_counts: dict[str, int] = {}
        negative_descriptor_counts: dict[str, int] = {}
        evidence_quotes: list[str] = []
        support_count = 0
        recent_support_count = 0
        positive_count = 0
        negative_count = 0

        for signal in signals:
            aspect = signal.get(aspect_key)
            if not isinstance(aspect, dict) or not aspect.get("mentioned"):
                continue
            support_count += 1
            overall_support_total += 1
            if _is_recent_signal(signal, latest_review_date):
                recent_support_count += 1
            sentiment = _normalize_aspect_sentiment(aspect.get("sentiment"), "unknown")
            descriptors = _normalize_string_list(aspect.get("descriptors"))
            if sentiment == "positive":
                positive_count += 1
                for descriptor in descriptors:
                    positive_descriptor_counts[descriptor] = positive_descriptor_counts.get(descriptor, 0) + 1
            elif sentiment == "negative":
                negative_count += 1
                for descriptor in descriptors:
                    negative_descriptor_counts[descriptor] = negative_descriptor_counts.get(descriptor, 0) + 1
            elif sentiment == "mixed":
                positive_count += 1
                negative_count += 1
            evidence_quotes.extend(_normalize_string_list(aspect.get("evidence_quotes"), limit=2))

        profile[aspect_key].update(
            {
                "confidence": _confidence_from_support(review_count, support_count),
                "support_count": support_count,
                "recent_support_count": recent_support_count,
                "positive_descriptors": _top_values(positive_descriptor_counts, limit=5),
                "negative_descriptors": _top_values(negative_descriptor_counts, limit=5),
                "evidence_quotes": _normalize_string_list(evidence_quotes, limit=3),
            }
        )
        aspect_contradictions = _build_aspect_contradictions(
            aspect_label=ASPECT_LABELS[aspect_key],
            positive_count=positive_count,
            negative_count=negative_count,
            evidence_quotes=_normalize_string_list(evidence_quotes, limit=3),
        )
        profile[aspect_key]["contradictions"] = aspect_contradictions
        contradictions.extend(aspect_contradictions)

    service_sentiments = [
        _normalize_aspect_sentiment(signal.get("service", {}).get("sentiment"), "unknown")
        for signal in signals
        if isinstance(signal.get("service"), dict) and signal.get("service", {}).get("mentioned")
    ]
    profile["service"]["reliability"] = _compute_service_reliability(service_sentiments)
    profile["service"]["energy"] = _compute_service_energy(
        positive_count=sum(1 for sentiment in service_sentiments if sentiment == "positive"),
        negative_count=sum(1 for sentiment in service_sentiments if sentiment == "negative"),
    )
    profile["atmosphere"]["noise_level"] = _compute_noise_level(signals)

    value_sentiments = [
        _normalize_aspect_sentiment(signal.get("value", {}).get("sentiment"), "unknown")
        for signal in signals
        if isinstance(signal.get("value"), dict) and signal.get("value", {}).get("mentioned")
    ]
    profile["value"]["perception"] = _compute_value_perception(
        positive_count=sum(1 for sentiment in value_sentiments if sentiment == "positive"),
        negative_count=sum(1 for sentiment in value_sentiments if sentiment == "negative"),
        average_rating=average_rating,
    )

    for signal in signals:
        visit_context = signal.get("visit_context") if isinstance(signal.get("visit_context"), dict) else {}
        group = visit_context.get("group") if isinstance(visit_context.get("group"), dict) else {}
        group_value = _normalize_enum(group.get("value"), GROUP_VALUES, "unknown")
        if group_value != "unknown":
            group_counts[group_value] = group_counts.get(group_value, 0) + 1
            evidence = _coerce_string(group.get("evidence"))
            if evidence:
                crowd_evidence.append(evidence)

        occasion = visit_context.get("occasion") if isinstance(visit_context.get("occasion"), dict) else {}
        occasion_value = _normalize_enum(occasion.get("value"), OCCASION_VALUES, "unknown")
        if occasion_value != "unknown":
            occasion_counts[occasion_value] = occasion_counts.get(occasion_value, 0) + 1
            evidence = _coerce_string(occasion.get("evidence"))
            if evidence:
                crowd_evidence.append(evidence)

        for dish in signal.get("dishes", []) if isinstance(signal.get("dishes"), list) else []:
            if not isinstance(dish, dict):
                continue
            name = _coerce_string(dish.get("name"))
            if not name:
                continue
            key = name.casefold()
            bucket = dish_stats.setdefault(
                key,
                {
                    "name": name,
                    "positive_count": 0,
                    "negative_count": 0,
                    "support_count": 0,
                    "recent_support_count": 0,
                    "evidence_quotes": [],
                },
            )
            bucket["support_count"] += 1
            if _is_recent_signal(signal, latest_review_date):
                bucket["recent_support_count"] += 1
            sentiment = _normalize_sentiment(dish.get("sentiment"), "neutral")
            if sentiment == "positive":
                bucket["positive_count"] += 1
            elif sentiment == "negative":
                bucket["negative_count"] += 1
            bucket["evidence_quotes"].extend(
                _normalize_string_list(dish.get("evidence_quote"), limit=1)
            )

    profile["crowd"].update(
        {
            "group_types": _top_values(group_counts, limit=5),
            "common_occasions": _top_values(occasion_counts, limit=5),
            "evidence_quotes": _normalize_string_list(crowd_evidence, limit=3),
            "confidence": _confidence_from_support(
                review_count,
                max(sum(group_counts.values()), sum(occasion_counts.values())),
            ),
        }
    )
    profile["atmosphere"]["best_for"] = _compute_best_for(
        review_count=review_count,
        group_counts=group_counts,
        occasion_counts=occasion_counts,
    )

    dishes = sorted(
        dish_stats.values(),
        key=lambda item: (-item["support_count"], -item["positive_count"], item["name"]),
    )
    for dish in dishes:
        dish["evidence_quotes"] = _normalize_string_list(dish.get("evidence_quotes"), limit=3)
        if dish["positive_count"] > 0 and dish["negative_count"] > 0:
            contradictions.append(
                {
                    "topic": f"dish:{dish['name']}",
                    "summary": f"Reviews disagree on {dish['name']}.",
                    "evidence_quotes": dish["evidence_quotes"][:3],
                }
            )
    profile["standout_dishes"] = dishes[:8]

    overall_confidence = _confidence_from_support(
        review_count,
        max(1, round(overall_support_total / max(review_count, 1))) if review_count else 0,
    )
    if review_count >= 8:
        overall_confidence = "high"
    elif review_count >= 3 and overall_confidence == "low":
        overall_confidence = "medium"
    profile["overall_confidence"] = overall_confidence
    profile["contradictions"] = contradictions[:8]
    return profile


def _fallback_overall_vibe(profile: dict[str, Any]) -> str:
    descriptors: list[str] = []
    for aspect_key in ("food", "service", "atmosphere"):
        aspect = profile.get(aspect_key) if isinstance(profile.get(aspect_key), dict) else {}
        descriptors.extend(_normalize_string_list(aspect.get("positive_descriptors"), limit=2))
    if descriptors:
        return " / ".join(descriptors[:3])
    if profile.get("review_count"):
        return "review-backed neighborhood restaurant"
    return "restaurant profile pending"


def _fallback_aspect_summary(profile: dict[str, Any], aspect_key: str) -> str:
    aspect = profile.get(aspect_key) if isinstance(profile.get(aspect_key), dict) else {}
    positive_descriptors = _normalize_string_list(aspect.get("positive_descriptors"), limit=3)
    negative_descriptors = _normalize_string_list(aspect.get("negative_descriptors"), limit=3)
    support_count = _coerce_int(aspect.get("support_count"), 0)
    if support_count == 0:
        return "Limited direct review evidence."
    if positive_descriptors and negative_descriptors:
        return f"Reviews split between {', '.join(positive_descriptors)} and {', '.join(negative_descriptors)}."
    if positive_descriptors:
        return f"Reviews most often mention {', '.join(positive_descriptors)}."
    if negative_descriptors:
        return f"Reviews most often flag {', '.join(negative_descriptors)}."
    return "Reviews mention this aspect without a strong descriptor pattern."


def _build_phase2_summary_prompt(profile: dict[str, Any]) -> str:
    aggregate_input = json.dumps(profile, ensure_ascii=False, indent=2)
    return PHASE_2_SUMMARY_PROMPT.format(aggregate_input=aggregate_input)


def _build_phase2_retry_prompt(
    *,
    original_prompt: str,
    previous_response: str,
    parse_error: str,
) -> str:
    return PHASE_2_SUMMARY_RETRY_PROMPT.format(
        parse_error=parse_error,
        original_prompt=original_prompt,
        previous_response=previous_response,
    )


def _build_phase1_prompt(reviews: list[dict[str, Any]]) -> str:
    return (
        f"{REVIEW_SIGNAL_PROMPT}\n\nINPUT JSON ARRAY:\n"
        f"{json.dumps(reviews, ensure_ascii=False, indent=2)}"
    )


def _build_phase1_retry_prompt(
    *,
    original_prompt: str,
    previous_response: str,
    parse_error: str,
) -> str:
    return REVIEW_SIGNAL_RETRY_PROMPT.format(
        parse_error=parse_error,
        original_prompt=original_prompt,
        previous_response=previous_response,
    )


def _invoke_json_llm_with_retry(
    *,
    prompt: str,
    retry_prompt_builder: callable,
    strict_parser: callable,
    repair_parser: callable,
    temperature: float,
    max_tokens: int,
    label: str,
) -> tuple[str, Any, dict[str, Any]]:
    llm = get_vertex_llm(temperature=temperature, max_tokens=max_tokens)
    retry_limit = _resolve_phase_retry_limit()
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
        parsed, parse_error = strict_parser(last_raw)
        if parsed is not None:
            return last_raw, parsed, {"attempt_count": attempt + 1, "repair_used": False}
        last_error = parse_error or "Strict parse failed"

    repaired, repair_error = repair_parser(last_raw)
    if repaired is not None:
        return last_raw, repaired, {"attempt_count": retry_limit + 1, "repair_used": True}

    raise RuntimeError(
        f"{label} parse failed after retry and repair: {last_error}; repair error: {repair_error}"
    )


def _execute_phase1_single(
    *,
    reviews: list[dict[str, Any]],
    resolved_max_tokens: int,
) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    prompt = _build_phase1_prompt(reviews)
    raw_response, parsed_payload, attempt_meta = _invoke_json_llm_with_retry(
        prompt=prompt,
        retry_prompt_builder=_build_phase1_retry_prompt,
        strict_parser=_strict_parse_array,
        repair_parser=_repair_parse_array,
        temperature=0.1,
        max_tokens=resolved_max_tokens,
        label="Review2Blog phase 1",
    )
    return raw_response, _normalize_phase1_signals(parsed_payload, reviews), attempt_meta


def _execute_phase2_summary(
    *,
    phase1_parsed: list[dict[str, Any]],
    resolved_max_tokens: int,
) -> tuple[str, dict[str, Any], dict[str, Any]]:
    base_profile = _build_phase2_base_profile(phase1_parsed)
    prompt = _build_phase2_summary_prompt(base_profile)
    raw_response, parsed_payload, attempt_meta = _invoke_json_llm_with_retry(
        prompt=prompt,
        retry_prompt_builder=_build_phase2_retry_prompt,
        strict_parser=_strict_parse_object,
        repair_parser=_repair_parse_object,
        temperature=0.1,
        max_tokens=resolved_max_tokens,
        label="Review2Blog phase 2",
    )

    summary_payload = parsed_payload if isinstance(parsed_payload, dict) else {}
    base_profile["overall_vibe"] = _coerce_string(summary_payload.get("overall_vibe")) or _fallback_overall_vibe(base_profile)
    base_profile["overall_confidence"] = _normalize_confidence(
        summary_payload.get("overall_confidence"),
        base_profile["overall_confidence"],
    )
    base_profile["editorial_hooks"] = _normalize_string_list(
        summary_payload.get("editorial_hooks"),
        limit=5,
    )
    for aspect_key in ASPECT_KEYS:
        summary_key = f"{aspect_key}_summary"
        base_profile[aspect_key]["summary"] = _coerce_string(
            summary_payload.get(summary_key)
        ) or _fallback_aspect_summary(base_profile, aspect_key)
    base_profile["crowd"]["summary"] = _coerce_string(
        summary_payload.get("crowd_summary")
    ) or "Audience signals are based on repeated visit-context evidence."

    return raw_response, base_profile, attempt_meta


def _supported_dish_names(profile: dict[str, Any]) -> list[str]:
    review_count = _coerce_int(profile.get("review_count"), 0)
    minimum_support = 1 if review_count == 1 else 2
    supported: list[str] = []
    for dish in profile.get("standout_dishes", []) if isinstance(profile.get("standout_dishes"), list) else []:
        if not isinstance(dish, dict):
            continue
        name = _coerce_string(dish.get("name"))
        support_count = _coerce_int(dish.get("support_count"), 0)
        if name and support_count >= minimum_support:
            supported.append(name)
    return _normalize_string_list(supported, limit=8)


def _known_dish_names(profile: dict[str, Any]) -> list[str]:
    return _normalize_string_list(
        [
            _coerce_string(dish.get("name"))
            for dish in (
                profile.get("standout_dishes", [])
                if isinstance(profile.get("standout_dishes"), list)
                else []
            )
            if isinstance(dish, dict)
        ],
        limit=20,
    )


def _context_contains_barranco(restaurant_context: dict[str, Any]) -> bool:
    haystacks = [
        _coerce_string(restaurant_context.get("district")),
        _coerce_string(restaurant_context.get("neighborhoodDescription")),
        _coerce_string(restaurant_context.get("description")),
        _coerce_string(restaurant_context.get("reviews_summary")),
    ]
    return any("barranco" in text.casefold() for text in haystacks)


def _build_phase3_prompt(
    *,
    phase2_profile: dict[str, Any],
    listicle: dict[str, str],
    restaurant_context: dict[str, Any],
) -> str:
    supported_dishes = _supported_dish_names(phase2_profile)
    supported_dishes_text = ", ".join(supported_dishes) if supported_dishes else "None"
    return PHASE_3_LISTICLE_PROMPT.format(
        listicle_type=listicle.get("listicle_type", ""),
        listicle_title=listicle.get("listicle_title", ""),
        listicle_goal=listicle.get("listicle_goal", ""),
        aggregated_profile=json.dumps(phase2_profile, ensure_ascii=False, indent=2),
        supported_dishes=supported_dishes_text,
        name=restaurant_context.get("name", "Unknown"),
        district=restaurant_context.get("district", ""),
        neighborhood_description=restaurant_context.get("neighborhoodDescription", ""),
        description=restaurant_context.get("description", ""),
        reviews_summary=restaurant_context.get("reviews_summary", ""),
    )


def _build_phase3_rewrite_prompt(
    *,
    phase2_profile: dict[str, Any],
    listicle: dict[str, str],
    restaurant_context: dict[str, Any],
    current_blurb: str,
    validation_errors: list[str],
) -> str:
    supported_dishes = _supported_dish_names(phase2_profile)
    supported_dishes_text = ", ".join(supported_dishes) if supported_dishes else "None"
    return PHASE_3_LISTICLE_REWRITE_PROMPT.format(
        validation_errors="\n".join(f"- {item}" for item in validation_errors),
        listicle_type=listicle.get("listicle_type", ""),
        listicle_title=listicle.get("listicle_title", ""),
        listicle_goal=listicle.get("listicle_goal", ""),
        aggregated_profile=json.dumps(phase2_profile, ensure_ascii=False, indent=2),
        supported_dishes=supported_dishes_text,
        name=restaurant_context.get("name", "Unknown"),
        district=restaurant_context.get("district", ""),
        neighborhood_description=restaurant_context.get("neighborhoodDescription", ""),
        description=restaurant_context.get("description", ""),
        reviews_summary=restaurant_context.get("reviews_summary", ""),
        current_blurb=current_blurb,
    )


def _sentence_count(text: str) -> int:
    sentences = [item for item in SENTENCE_SPLIT_PATTERN.split(text.strip()) if item.strip()]
    return len(sentences)


def _validate_phase3_blurb(
    *,
    blurb: str,
    phase2_profile: dict[str, Any],
    restaurant_context: dict[str, Any],
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

    if not _context_contains_barranco(restaurant_context) and re.search(r"\bBarranco\b", stripped, re.IGNORECASE):
        errors.append("Blurb mentions Barranco without explicit support in restaurant context.")

    supported_dishes = {dish.casefold(): dish for dish in _supported_dish_names(phase2_profile)}
    known_dishes = _known_dish_names(phase2_profile)
    lower_blurb = stripped.casefold()
    unsupported_mentions = [
        dish
        for dish in known_dishes
        if dish.casefold() in lower_blurb and dish.casefold() not in supported_dishes
    ]
    if unsupported_mentions:
        errors.append(
            "Blurb mentions unsupported dishes: " + ", ".join(_normalize_string_list(unsupported_mentions, limit=5))
        )

    return errors


def _execute_phase3_generate(
    *,
    phase2_profile: dict[str, Any],
    listicle: dict[str, str],
    restaurant_context: dict[str, Any],
    resolved_max_tokens: int,
) -> str:
    prompt = _build_phase3_prompt(
        phase2_profile=phase2_profile,
        listicle=listicle,
        restaurant_context=restaurant_context,
    )
    llm = get_vertex_llm(temperature=0.7, max_tokens=resolved_max_tokens)
    result = llm.invoke(prompt)
    if not result or not result.strip():
        raise RuntimeError("Review2Blog phase 3 returned empty output")
    return result.strip()


def _execute_phase3_validation(
    *,
    initial_blurb: str,
    phase2_profile: dict[str, Any],
    listicle: dict[str, str],
    restaurant_context: dict[str, Any],
    resolved_max_tokens: int,
) -> tuple[str, dict[str, Any]]:
    initial_errors = _validate_phase3_blurb(
        blurb=initial_blurb,
        phase2_profile=phase2_profile,
        restaurant_context=restaurant_context,
    )
    if not initial_errors:
        return initial_blurb.strip(), {
            "rewrite_applied": False,
            "initial_validation_errors": [],
            "rewritten_response": None,
        }

    llm = get_vertex_llm(temperature=0.4, max_tokens=resolved_max_tokens)
    rewrite_prompt = _build_phase3_rewrite_prompt(
        phase2_profile=phase2_profile,
        listicle=listicle,
        restaurant_context=restaurant_context,
        current_blurb=initial_blurb,
        validation_errors=initial_errors,
    )
    rewritten = llm.invoke(rewrite_prompt)
    if not rewritten or not rewritten.strip():
        raise RuntimeError("Review2Blog phase 3 corrective rewrite returned empty output")
    rewritten = rewritten.strip()

    final_errors = _validate_phase3_blurb(
        blurb=rewritten,
        phase2_profile=phase2_profile,
        restaurant_context=restaurant_context,
    )
    if final_errors:
        raise RuntimeError(
            "Review2Blog phase 3 validation failed after rewrite: " + "; ".join(final_errors)
        )

    return rewritten, {
        "rewrite_applied": True,
        "initial_validation_errors": initial_errors,
        "rewritten_response": rewritten,
    }


def _build_phase1_summary(
    *,
    review_count: int,
    batch_mode: str,
    batch_size: int,
    batch_count: int,
) -> dict[str, Any]:
    return {
        "review_count": review_count,
        "signal_count": review_count,
        "batch_mode": batch_mode,
        "batch_size": batch_size,
        "batch_count": batch_count,
    }


def _build_partial_artifact(
    *,
    run_id: str,
    listicle: dict[str, str],
    restaurant_context: dict[str, Any],
    phase1_summary: dict[str, Any],
    phase2_profile: dict[str, Any],
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "restaurant_name": restaurant_context.get("name"),
        "restaurant_context": restaurant_context,
        "listicle": listicle,
        "phase_outputs": {
            "phase1_summary": phase1_summary,
            "phase2_profile": phase2_profile,
            "phase3": None,
        },
    }


def _finalize_review2blog_run(
    *,
    run_id: str,
    listicle: dict[str, str],
    restaurant_context: dict[str, Any],
    phase1_summary: dict[str, Any],
    phase2_parsed: dict[str, Any],
    blurb: str,
) -> None:
    title = (
        str(listicle.get("listicle_title", "")).strip()
        or str(restaurant_context.get("name", "")).strip()
        or "Review2Blog Draft"
    )
    markdown = f"# {title}\n\n{blurb}".strip()
    artifact_payload = {
        "run_id": run_id,
        "restaurant_name": restaurant_context.get("name"),
        "restaurant_context": restaurant_context,
        "listicle": listicle,
        "phase_outputs": {
            "phase1_summary": phase1_summary,
            "phase2_profile": phase2_parsed,
            "phase3": {"blurb": blurb},
        },
    }
    write_artifact(
        run_id,
        {
            "markdown": markdown,
            "review2blog_run": artifact_payload,
        },
    )

    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "completed",
            "stage": "complete",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )


def _run_review2blog_pipeline(run_id: str, request: Review2BlogRunRequest) -> None:
    category_pipeline.validate_and_normalize_export(request.review_payload)
    resolved_max_tokens = _resolve_max_tokens(request.max_tokens)
    phase1_batch_size = _resolve_phase1_batch_size()
    phase_retry_limit = _resolve_phase_retry_limit()
    recent_window_days = _resolve_recent_window_days()

    def _validate_input_runner(state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "routing")
        payload = category_pipeline.validate_and_normalize_export(state.get("review_payload"))
        reviews = payload["reviews"]
        phase1_mode = "single" if len(reviews) <= int(state["phase1_batch_size"]) else "batch"
        return {
            "category": payload["category"],
            "reviews": reviews,
            "location_context": payload["location_context"],
            "editorial_intent": payload["editorial_intent"],
            "phase1_mode": phase1_mode,
        }

    def _route_phase1_mode_runner(state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "routing")
        return {"phase1_mode": state.get("phase1_mode", "single")}

    def _phase1_single_runner(state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "stage_phase1_single")
        raw_response, phase1_claims, attempt_meta = category_pipeline.extract_claim_signals(
            reviews=state["reviews"],
            category=state["category"],
            max_tokens=int(state["resolved_max_tokens"]),
            retry_limit=phase_retry_limit,
        )
        phase1_summary = category_pipeline.build_phase1_summary(
            category=state["category"],
            review_count=len(state["reviews"]),
            claim_count=len(phase1_claims),
            batch_mode="single",
            batch_size=len(state["reviews"]),
            batch_count=1,
        )
        write_stage_result(
            run_id,
            "stage_phase1_single",
            {
                "created_at": _now_iso(),
                "data": {
                    "input_count": len(state["reviews"]),
                    "category": state["category"],
                    "location_context": state["location_context"],
                    "editorial_intent": state["editorial_intent"],
                    "raw_response": raw_response,
                    "parsed": phase1_claims,
                    "parse_error": None,
                    "attempt_meta": attempt_meta,
                },
            },
        )
        write_stage_result(
            run_id,
            "stage_phase1",
            {
                "created_at": _now_iso(),
                "data": {
                    "summary": phase1_summary,
                    "category": state["category"],
                    "location_context": state["location_context"],
                    "editorial_intent": state["editorial_intent"],
                    "reviews": state["reviews"],
                    "parsed": phase1_claims,
                },
            },
        )
        return {
            "phase1_claims": phase1_claims,
            "phase1_summary": phase1_summary,
        }

    def _phase1_batch_runner(state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "stage_phase1_batch")
        chunks = _chunk_reviews(state["reviews"], int(state["phase1_batch_size"]))
        chunk_results: list[list[dict[str, Any]]] = []
        chunk_payloads: list[dict[str, Any]] = []

        for index, chunk in enumerate(chunks):
            raw_response, parsed_chunk, attempt_meta = category_pipeline.extract_claim_signals(
                reviews=chunk,
                category=state["category"],
                max_tokens=int(state["resolved_max_tokens"]),
                retry_limit=phase_retry_limit,
            )
            chunk_results.append(parsed_chunk)
            chunk_payloads.append(
                {
                    "chunk_index": index,
                    "input_count": len(chunk),
                    "raw_response": raw_response,
                    "parsed": parsed_chunk,
                    "attempt_meta": attempt_meta,
                }
            )

        write_stage_result(
            run_id,
            "stage_phase1_batch",
            {
                "created_at": _now_iso(),
                "data": {
                    "category": state["category"],
                    "batch_size": int(state["phase1_batch_size"]),
                    "batch_count": len(chunks),
                    "chunks": chunk_payloads,
                },
            },
        )

        return {
            "phase1_batches": chunk_results,
            "phase1_batch_count": len(chunks),
        }

    def _phase1_merge_runner(state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "stage_phase1_merge")
        phase1_claims = [
            claim
            for batch in state.get("phase1_batches", [])
            for claim in (batch if isinstance(batch, list) else [])
        ]
        phase1_summary = category_pipeline.build_phase1_summary(
            category=state["category"],
            review_count=len(state["reviews"]),
            claim_count=len(phase1_claims),
            batch_mode="batch",
            batch_size=int(state["phase1_batch_size"]),
            batch_count=int(state.get("phase1_batch_count", 0)),
        )
        write_stage_result(
            run_id,
            "stage_phase1_merge",
            {
                "created_at": _now_iso(),
                "data": {
                    "summary": phase1_summary,
                    "input_count": len(state["reviews"]),
                    "parsed": phase1_claims,
                },
            },
        )
        write_stage_result(
            run_id,
            "stage_phase1",
            {
                "created_at": _now_iso(),
                "data": {
                    "summary": phase1_summary,
                    "category": state["category"],
                    "location_context": state["location_context"],
                    "editorial_intent": state["editorial_intent"],
                    "reviews": state["reviews"],
                    "parsed": phase1_claims,
                },
            },
        )
        return {
            "phase1_claims": phase1_claims,
            "phase1_summary": phase1_summary,
        }

    def _phase2_runner(state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "stage_phase2")
        phase2_profile = category_pipeline.build_evidence_profile(
            category=state["category"],
            claims=state["phase1_claims"],
            reviews=state["reviews"],
            location_context=state["location_context"],
            editorial_intent=state["editorial_intent"],
            recent_window_days=recent_window_days,
        )
        write_stage_result(
            run_id,
            "stage_phase2",
            {
                "created_at": _now_iso(),
                "data": {
                    "input_count": len(state["phase1_claims"]),
                    "parsed": phase2_profile,
                    "attempt_meta": {"source": "deterministic"},
                },
            },
        )
        return {"phase2_profile": phase2_profile}

    def _await_listicle_runner(state: dict[str, Any]) -> dict[str, Any]:
        return {"gate_decision": "continue"}

    def _phase3_generate_runner(state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "stage_phase3")
        writer_brief = category_pipeline.build_writer_brief(
            evidence_profile=state["phase2_profile"],
            location_context=state["location_context"],
            editorial_intent=state["editorial_intent"],
        )
        phase3_raw = category_pipeline.execute_category_writer(
            brief=writer_brief,
            max_tokens=int(state["resolved_max_tokens"]),
        )
        return {"writer_brief": writer_brief, "phase3_raw": phase3_raw}

    def _phase3_validate_runner(state: dict[str, Any]) -> dict[str, Any]:
        writer_brief = (
            state["writer_brief"] if isinstance(state.get("writer_brief"), dict) else {}
        )
        final_blurb, rewrite_meta = category_pipeline.validate_and_rewrite_category_blurb(
            initial_blurb=_coerce_string(state.get("phase3_raw")),
            brief=writer_brief,
            max_tokens=int(state["resolved_max_tokens"]),
        )
        write_stage_result(
            run_id,
            "stage_phase3",
            {
                "created_at": _now_iso(),
                "data": {
                    "raw_response": state.get("phase3_raw"),
                    "rewritten_response": rewrite_meta.get("rewritten_response"),
                    "blurb": final_blurb,
                    "writer_brief": writer_brief,
                    "rewrite_applied": rewrite_meta.get("rewrite_applied", False),
                    "initial_validation_errors": rewrite_meta.get("initial_validation_errors", []),
                },
            },
        )
        return {
            "blurb": final_blurb,
            "phase3_quality_meta": rewrite_meta,
        }

    def _finalize_runner(state: dict[str, Any]) -> dict[str, Any]:
        artifact_payload = category_pipeline.build_run_artifact(
            run_id=run_id,
            location_context=state["location_context"],
            editorial_intent=state["editorial_intent"],
            phase1_summary=state["phase1_summary"],
            phase2_profile=state["phase2_profile"],
            blurb=state["blurb"],
            quality_meta=state.get("phase3_quality_meta")
            if isinstance(state.get("phase3_quality_meta"), dict)
            else {},
        )
        write_artifact(
            run_id,
            {
                "markdown": category_pipeline.build_markdown(state["location_context"], state["blurb"]),
                "review2blog_run": artifact_payload,
            },
        )
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "completed",
                "stage": "complete",
                "error": None,
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )
        return {"completed": True}

    try:
        run_review2blog_graph(
            run_id=run_id,
            entrypoint="review2blog/run",
            initial_state={
                "mode": "initial",
                "review_payload": request.review_payload,
                "resolved_max_tokens": resolved_max_tokens,
                "phase1_batch_size": phase1_batch_size,
            },
            validate_input_runner=_validate_input_runner,
            route_phase1_mode_runner=_route_phase1_mode_runner,
            phase1_single_runner=_phase1_single_runner,
            phase1_batch_runner=_phase1_batch_runner,
            phase1_merge_runner=_phase1_merge_runner,
            phase2_runner=_phase2_runner,
            await_listicle_runner=_await_listicle_runner,
            phase3_generate_runner=_phase3_generate_runner,
            phase3_validate_runner=_phase3_validate_runner,
            finalize_runner=_finalize_runner,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Review2Blog graph pipeline failed", extra={"run_id": run_id})
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "failed",
                "stage": "failed",
                "error": str(exc),
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )


def _resume_review2blog_pipeline(run_id: str, request: Review2BlogResumeRequest) -> None:
    listicle = _normalize_listicle(request.listicle)
    resolved_max_tokens = _resolve_max_tokens(request.max_tokens)

    stage_phase1 = read_stage_result(run_id, "stage_phase1")
    stage_phase2 = read_stage_result(run_id, "stage_phase2")
    if not isinstance(stage_phase1, dict) or not isinstance(stage_phase2, dict):
        raise RuntimeError("Review2Blog resume data is incomplete.")

    phase1_data = stage_phase1.get("data") if isinstance(stage_phase1.get("data"), dict) else {}
    phase2_data = stage_phase2.get("data") if isinstance(stage_phase2.get("data"), dict) else {}
    restaurant_context = (
        phase1_data.get("restaurant_context")
        if isinstance(phase1_data.get("restaurant_context"), dict)
        else {}
    )
    phase1_summary = phase1_data.get("summary") if isinstance(phase1_data.get("summary"), dict) else {}
    phase2_parsed = phase2_data.get("parsed") if isinstance(phase2_data.get("parsed"), dict) else {}

    def _validate_input_runner(_state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "routing")
        return {
            "restaurant_context": restaurant_context,
            "phase1_summary": phase1_summary,
            "phase2_parsed": _normalize_phase2_profile_input(phase2_parsed),
            "listicle": listicle,
        }

    def _route_phase1_mode_runner(state: dict[str, Any]) -> dict[str, Any]:
        return state

    def _phase1_single_runner(state: dict[str, Any]) -> dict[str, Any]:
        return state

    def _phase1_batch_runner(state: dict[str, Any]) -> dict[str, Any]:
        return state

    def _phase1_merge_runner(state: dict[str, Any]) -> dict[str, Any]:
        return state

    def _phase2_runner(state: dict[str, Any]) -> dict[str, Any]:
        return state

    def _await_listicle_runner(_state: dict[str, Any]) -> dict[str, Any]:
        return {"gate_decision": "continue"}

    def _phase3_generate_runner(state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "stage_phase3")
        phase3_raw = _execute_phase3_generate(
            phase2_profile=state["phase2_parsed"],
            listicle=_normalize_listicle(state.get("listicle")),
            restaurant_context=state["restaurant_context"],
            resolved_max_tokens=int(state["resolved_max_tokens"]),
        )
        return {"phase3_raw": phase3_raw}

    def _phase3_validate_runner(state: dict[str, Any]) -> dict[str, Any]:
        final_blurb, rewrite_meta = _execute_phase3_validation(
            initial_blurb=_coerce_string(state.get("phase3_raw")),
            phase2_profile=state["phase2_parsed"],
            listicle=_normalize_listicle(state.get("listicle")),
            restaurant_context=state["restaurant_context"],
            resolved_max_tokens=int(state["resolved_max_tokens"]),
        )
        write_stage_result(
            run_id,
            "stage_phase3",
            {
                "created_at": _now_iso(),
                "data": {
                    "raw_response": state.get("phase3_raw"),
                    "rewritten_response": rewrite_meta.get("rewritten_response"),
                    "blurb": final_blurb,
                    "listicle": _normalize_listicle(state.get("listicle")),
                    "rewrite_applied": rewrite_meta.get("rewrite_applied", False),
                    "initial_validation_errors": rewrite_meta.get("initial_validation_errors", []),
                },
            },
        )
        return {"blurb": final_blurb}

    def _finalize_runner(state: dict[str, Any]) -> dict[str, Any]:
        _finalize_review2blog_run(
            run_id=run_id,
            listicle=_normalize_listicle(state.get("listicle")),
            restaurant_context=state["restaurant_context"],
            phase1_summary=phase1_summary,
            phase2_parsed=state["phase2_parsed"],
            blurb=state["blurb"],
        )
        return {"completed": True}

    try:
        run_review2blog_graph(
            run_id=run_id,
            entrypoint=f"review2blog/run/{run_id}/resume",
            initial_state={
                "mode": "resume",
                "restaurant_context": restaurant_context,
                "phase1_summary": phase1_summary,
                "phase2_parsed": _normalize_phase2_profile_input(phase2_parsed),
                "listicle": listicle,
                "resolved_max_tokens": resolved_max_tokens,
            },
            validate_input_runner=_validate_input_runner,
            route_phase1_mode_runner=_route_phase1_mode_runner,
            phase1_single_runner=_phase1_single_runner,
            phase1_batch_runner=_phase1_batch_runner,
            phase1_merge_runner=_phase1_merge_runner,
            phase2_runner=_phase2_runner,
            await_listicle_runner=_await_listicle_runner,
            phase3_generate_runner=_phase3_generate_runner,
            phase3_validate_runner=_phase3_validate_runner,
            finalize_runner=_finalize_runner,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Review2Blog resume pipeline failed", extra={"run_id": run_id})
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "failed",
                "stage": "failed",
                "error": str(exc),
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )


@router.post("/upload")
async def upload_json(
    file: UploadFile = File(...),
    max_tokens: int | None = None,
) -> JSONResponse:
    if not file.filename or not file.filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="Please upload a JSON file.")

    content = await file.read()
    try:
        payload = json.loads(content.decode("utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON file.") from exc

    validated_payload = _validate_payload(payload)
    reviews = validated_payload["reviews"]
    restaurant_context = {key: value for key, value in validated_payload.items() if key != "reviews"}

    try:
        resolved_max_tokens = _resolve_max_tokens(max_tokens)
        batch_size = _resolve_phase1_batch_size()
        chunks = _chunk_reviews(reviews, batch_size) if len(reviews) > batch_size else [reviews]
        parsed_output: list[dict[str, Any]] = []
        raw_payloads: list[dict[str, Any]] = []

        for index, chunk in enumerate(chunks):
            raw_response, parsed_chunk, attempt_meta = _execute_phase1_single(
                reviews=chunk,
                resolved_max_tokens=resolved_max_tokens,
            )
            parsed_output.extend(parsed_chunk)
            raw_payloads.append(
                {
                    "chunk_index": index,
                    "raw_response": raw_response,
                    "attempt_meta": attempt_meta,
                }
            )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Review2Blog phase 1 request failed")
        raise HTTPException(
            status_code=502,
            detail="Review2Blog phase 1 request failed",
        ) from exc

    return JSONResponse(
        {
            "message": "Review2Blog phase 1 completed",
            "input_count": len(reviews),
            "restaurant_context": restaurant_context,
            "max_tokens": resolved_max_tokens,
            "raw_response": json.dumps(raw_payloads, ensure_ascii=False),
            "parsed": parsed_output,
            "parse_error": None,
            "batch_size": batch_size,
            "batch_count": len(chunks),
            "batch_errors": [],
        }
    )


@router.post("/phase2")
async def aggregate_experience(
    payload: Any = Body(...),
    max_tokens: int | None = None,
) -> JSONResponse:
    try:
        normalized_signals = _normalize_phase2_input_signals(payload)
        resolved_max_tokens = _resolve_max_tokens(max_tokens)
        raw_response, parsed_output, attempt_meta = _execute_phase2_summary(
            phase1_parsed=normalized_signals,
            resolved_max_tokens=resolved_max_tokens,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Review2Blog phase 2 request failed")
        raise HTTPException(
            status_code=502,
            detail="Review2Blog phase 2 request failed",
        ) from exc

    return JSONResponse(
        {
            "message": "Review2Blog phase 2 completed",
            "input_count": len(normalized_signals),
            "max_tokens": resolved_max_tokens,
            "raw_response": raw_response,
            "parsed": parsed_output,
            "parse_error": None,
            "attempt_meta": attempt_meta,
        }
    )


@router.post("/phase3")
async def generate_listicle_blurb(
    payload: Any = Body(...),
    max_tokens: int | None = None,
) -> JSONResponse:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="JSON root must be an object.")

    required_fields = ["aggregated_profile", "restaurant_context", "listicle"]
    missing = [field for field in required_fields if field not in payload]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing)}",
        )

    listicle = _normalize_listicle(payload["listicle"])
    if not _listicle_is_complete(listicle):
        raise HTTPException(
            status_code=400,
            detail="listicle_type, listicle_title, and listicle_goal are required.",
        )

    restaurant_context = (
        payload["restaurant_context"]
        if isinstance(payload["restaurant_context"], dict)
        else {}
    )
    try:
        phase2_profile = _normalize_phase2_profile_input(payload["aggregated_profile"])
        resolved_max_tokens = _resolve_max_tokens(max_tokens)
        initial_blurb = _execute_phase3_generate(
            phase2_profile=phase2_profile,
            listicle=listicle,
            restaurant_context=restaurant_context,
            resolved_max_tokens=resolved_max_tokens,
        )
        final_blurb, rewrite_meta = _execute_phase3_validation(
            initial_blurb=initial_blurb,
            phase2_profile=phase2_profile,
            listicle=listicle,
            restaurant_context=restaurant_context,
            resolved_max_tokens=resolved_max_tokens,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Review2Blog phase 3 request failed")
        raise HTTPException(
            status_code=502,
            detail="Review2Blog phase 3 request failed",
        ) from exc

    return JSONResponse(
        {
            "message": "Review2Blog phase 3 completed",
            "blurb": final_blurb,
            "rewrite_applied": rewrite_meta.get("rewrite_applied", False),
        }
    )


@router.post("/run")
async def start_review2blog_run(
    request: Review2BlogRunRequest,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    normalized_payload = category_pipeline.validate_and_normalize_export(request.review_payload)
    run_id = str(uuid4())

    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": "queued",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )
    write_stage_result(
        run_id,
        "pipeline_input",
        {
            "created_at": _now_iso(),
            "data": {
                "category": normalized_payload["category"],
                "review_count": len(normalized_payload.get("reviews", [])),
                "location_context": normalized_payload["location_context"],
                "editorial_intent": normalized_payload["editorial_intent"],
                "max_tokens": request.max_tokens,
                "phase1_batch_size": _resolve_phase1_batch_size(),
            },
        },
    )

    background_tasks.add_task(
        _run_review2blog_pipeline,
        run_id,
        Review2BlogRunRequest(
            review_payload=request.review_payload,
            max_tokens=request.max_tokens,
        ),
    )
    return JSONResponse({"message": "Review2Blog run queued", "run_id": run_id})


@router.post("/run/{run_id}/resume")
async def resume_review2blog_run(
    run_id: str,
    request: Review2BlogResumeRequest,
) -> JSONResponse:
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")
    if status.get("state") != "awaiting_input" or status.get("stage") not in {
        "awaiting_listicle",
        "awaiting_editorial",
    }:
        raise HTTPException(
            status_code=409,
            detail="Review2Blog run is not waiting for additional input.",
        )

    editorial = _legacy_editorial_from_resume_request(request)
    listicle = _normalize_listicle(request.listicle)
    if not _listicle_is_complete(listicle):
        listicle = {
            "listicle_type": _coerce_string(editorial.get("placement_type")),
            "listicle_title": _coerce_string(editorial.get("audience")),
            "listicle_goal": _coerce_string(editorial.get("selection_angle")),
        }
    if not _listicle_is_complete(listicle):
        raise HTTPException(
            status_code=400,
            detail=(
                "Provide either legacy listicle fields or editorial fields "
                "(placement_type, selection_angle, audience, tone)."
            ),
        )

    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": "queued",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )
    write_stage_result(
        run_id,
        "pipeline_resume_input",
        {
            "created_at": _now_iso(),
            "data": {
                "listicle": listicle,
                "editorial_intent": editorial,
                "max_tokens": request.max_tokens,
            },
        },
    )

    _resume_review2blog_pipeline(
        run_id,
        Review2BlogResumeRequest(
            listicle=listicle,
            max_tokens=request.max_tokens,
        ),
    )
    return JSONResponse({"message": "Review2Blog resume queued", "run_id": run_id})


@router.get("/status/{run_id}")
async def get_status(run_id: str) -> JSONResponse:
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")
    return JSONResponse(status)


@router.get("/result/{run_id}")
async def get_result(run_id: str) -> JSONResponse:
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    output = read_output(run_id)
    if not output:
        raise HTTPException(status_code=404, detail="Result not available yet.")

    trace_payload = _read_langgraph_trace(run_id)
    artifact = output["artifact"]
    if trace_payload and isinstance(artifact, dict):
        artifact.update(trace_payload)

    response_payload: dict[str, Any] = {
        "run_id": run_id,
        "markdown": (
            None
            if status.get("state") == "awaiting_input" and not output["markdown"]
            else output["markdown"]
        ),
        "artifact": artifact,
    }
    response_payload.update(trace_payload)

    return JSONResponse(response_payload)


@router.post("/clear")
async def clear_database() -> JSONResponse:
    count = clear_all_runs(feature="review2blog")
    return JSONResponse(
        {
            "message": f"Cleared {count} runs from database",
            "deleted_runs": count,
        }
    )


@router.get("/articles")
async def get_articles() -> JSONResponse:
    return JSONResponse(get_all_completed_articles())
