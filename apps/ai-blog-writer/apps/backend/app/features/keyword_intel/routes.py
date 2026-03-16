"""Keyword-intel routes and market-aware pipeline orchestration."""

from __future__ import annotations

import hashlib
import json
import logging
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from app.core import (
    get_all_runs,
    read_output,
    read_stage_result,
    read_status,
    write_artifact,
    write_stage_result,
    write_status,
)
from utils import get_vertex_llm, parse_json_response

from .dataforseo_client import (
    DataForSEOClient,
    DataForSEOError,
    DataForSEORequestResult,
)
from .graph import run_keyword_intel_graph

router = APIRouter(prefix="/keyword-intel", tags=["keyword-intel"])
logger = logging.getLogger(__name__)

FEATURE_NAME = "keyword_intel"
DEFAULT_MODEL = "gemini-2.5-flash-lite"
MAX_INTENT_CLASSIFICATION_ATTEMPTS = 3
MAX_FILTERING_ATTEMPTS = 3
MAX_GROUPING_ATTEMPTS = 3
MAX_LABELING_ATTEMPTS = 3
MAX_JOBS_LIMIT = 100
NEAR_EQUIVALENT_JACCARD_THRESHOLD = 0.72
WORD_PATTERN = re.compile(r"[a-z0-9]+(?:['’][a-z0-9]+)?", re.I)
LANGUAGE_CODE_PATTERN = re.compile(r"^[a-z]{2,3}(?:-[a-z]{2})?$")
SEARCH_DOMAIN_PATTERN = re.compile(r"^[a-z0-9.-]+$")
QUESTION_STARTERS = {"how", "what", "when", "where", "who", "why"}
LOCATION_PREPOSITIONS = {"near", "in", "at", "around", "by"}
GENERIC_FEATURE_STOPWORDS = {
    "best",
    "cheap",
    "good",
    "great",
    "local",
    "near",
    "top",
}
STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "at",
    "best",
    "by",
    "for",
    "from",
    "how",
    "in",
    "is",
    "near",
    "of",
    "on",
    "or",
    "the",
    "to",
    "what",
    "where",
    "with",
}
PHRASE_JUNK_PATTERNS = (
    re.compile(r"\bview\s+\d+\+?\s+more\b", re.I),
    re.compile(r"\bview\s+more\b", re.I),
    re.compile(r"\bmore\s+results\b", re.I),
    re.compile(r"\bshow\s+more\b", re.I),
)
PHRASE_FIELD_KEYS = {"title", "keyword", "search_term", "text", "query"}
MARKET_PROFILE_DEFAULTS = {
    "us_planners_en": {"geo": "us", "language": "en"},
    "tourists_in_peru_en": {"geo": "pe", "language": "en"},
    "locals_peru_es": {"geo": "pe", "language": "es"},
    "custom": None,
}
INTENT_RELATION_VALUES = {"same_intent", "adjacent_intent", "irrelevant_intent"}
LODGING_KEYWORDS = {
    "stay",
    "hotel",
    "hotels",
    "hostel",
    "hostels",
    "accommodation",
    "accommodations",
    "lodging",
    "airbnb",
    "resort",
    "resorts",
}
DINING_KEYWORDS = {
    "restaurant",
    "restaurants",
    "eat",
    "food",
    "cafe",
    "cafes",
    "breakfast",
    "lunch",
    "dinner",
}
LOCATION_DEFINITION_KEYWORDS = {
    "district",
    "neighborhood",
    "neighbourhood",
    "area",
    "map",
    "located",
}
ATTRACTION_KEYWORDS = {
    "attractions",
    "attraction",
    "activities",
    "activity",
    "visit",
    "see",
    "do",
}
SAFETY_KEYWORDS = {"safe", "safest", "unsafe", "dangerous", "safety"}
PLATFORM_MODIFIER_KEYWORDS = {
    "reddit",
    "quora",
    "tripadvisor",
    "youtube",
    "tiktok",
    "instagram",
    "facebook",
    "forums",
    "forum",
}
INTENT_KEYWORDS = (
    LODGING_KEYWORDS
    | DINING_KEYWORDS
    | LOCATION_DEFINITION_KEYWORDS
    | ATTRACTION_KEYWORDS
    | SAFETY_KEYWORDS
    | PLATFORM_MODIFIER_KEYWORDS
    | {"where", "what", "things"}
)
INTENT_CLASSIFICATION_PROMPT = """You are classifying keyword-intel phrase records by topic and search intent relative to the seed.

Return strict JSON only:
{{
  "seed_intent": {{
    "topic_label": "string",
    "intent_label": "string"
  }},
  "phrases": [
    {{
      "phrase_id": "string",
      "topic_label": "string",
      "intent_label": "string",
      "intent_relation": "same_intent|adjacent_intent|irrelevant_intent",
      "reason": "short reason"
    }}
  ]
}}

Rules:
- Classify each phrase against the seed phrase and market context.
- `same_intent` means the phrase serves the same user task as the seed, even if it is a narrower variation.
- `adjacent_intent` means the phrase is about a nearby but different task in the same area or market.
- `irrelevant_intent` means the phrase is off-topic, a bad-provider match, or unrelated to the seed task.
- Use compact snake_case labels for topic_label and intent_label.
- Do not rewrite, normalize, translate, or paraphrase any phrase.
- Every input phrase_id must appear exactly once in `phrases`.
- Output valid JSON only.

Context:
- seed: {seed}
- market_context: {market_context}

Input phrases:
{phrases}
"""
INTENT_CLASSIFICATION_RETRY_PROMPT = """Your previous response did not satisfy the intent-classification contract.

Fix the JSON and return valid JSON only.

Contract issues:
{issues}

Original prompt:
{original_prompt}

Previous response:
{previous_response}
"""
FILTERING_PROMPT = """You are reviewing keyword-intel phrase records for semantic relevance after intent classification.

Return strict JSON only:
{{
  "retained_phrase_ids": ["..."],
  "filtered": [
    {{
      "phrase_id": "string",
      "reason": "short reason"
    }}
  ]
}}

Rules:
- Retain only phrases that match the seed intent.
- Filter adjacent-intent and irrelevant-intent phrases.
- Keep near-seed phrases when they still match the same intent.
- Do not rewrite, normalize, translate, or paraphrase any phrase.
- Every input phrase_id must appear exactly once, either in retained_phrase_ids or filtered.
- Output valid JSON only.

Context:
- seed: {seed}
- market_context: {market_context}
- seed_intent: {seed_intent}

Input phrases:
{phrases}
"""
FILTERING_RETRY_PROMPT = """Your previous response did not satisfy the relevance-filter contract.

Fix the JSON and return valid JSON only.

Contract issues:
{issues}

Original prompt:
{original_prompt}

Previous response:
{previous_response}
"""
GROUPING_PROMPT = """You are grouping retained keyword-intel phrase records into semantic opportunity clusters.

Return strict JSON only:
{{
  "groups": [
    {{
      "phrase_ids": ["..."]
    }}
  ]
}}

Rules:
- Every input phrase_id must appear exactly once.
- Group by semantic meaning and search intent.
- Merge near-equivalent phrases when they express the same topic and task, even if one
  variant adds or removes broader market qualifiers like city, district, or country tokens.
- Keep platform/source-specific phrases distinct from general phrases when platform
  modifiers differ.
- Keep groups tight. Single-phrase groups are allowed.
- Do not add, remove, rewrite, normalize, or paraphrase any phrase.
- Output valid JSON only.

Context:
- seed: {seed}
- market_context: {market_context}
- bucket_topic: {topic_label}
- bucket_intent: {intent_label}
- bucket_platform_modifiers: {platform_modifiers}

Input phrases:
{phrases}
"""
GROUPING_RETRY_PROMPT = """Your previous response did not satisfy the semantic-grouping contract.

Fix the JSON and return valid JSON only.

Contract issues:
{issues}

Original prompt:
{original_prompt}

Previous response:
{previous_response}
"""
LABELING_PROMPT = """You are labeling keyword-intel clusters.

Return strict JSON only:
{{
  "groups": [
    {{
      "group_id": "string",
      "label": "string"
    }}
  ]
}}

Rules:
- Return exactly one label for each input group_id.
- Do not rewrite or paraphrase the member phrases.
- Labels should be concise, readable, and in the requested language.
- Prefer 2 to 6 words.
- Avoid generic labels like "miscellaneous" or "other".
- Output valid JSON only.

Context:
- seed: {seed}
- language: {language}
- market_context: {market_context}

Input groups:
{groups}
"""
LABELING_RETRY_PROMPT = """Your previous response did not satisfy the labeling contract.

Fix the JSON and return valid JSON only.

Contract issues:
{issues}

Original prompt:
{original_prompt}

Previous response:
{previous_response}
"""


class KeywordIntelRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seed: str
    market_profile: str | None = None
    geo: str | None = None
    language: str | None = None
    device: str = "desktop"
    search_domain: str | None = None
    region: str | None = None
    city: str | None = None


@dataclass(frozen=True)
class ValidatedKeywordIntelRequest:
    seed: str
    market_profile: str
    geo: str
    language: str
    device: str
    search_domain: str | None
    region: str | None
    city: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "seed": self.seed,
            "market_profile": self.market_profile,
            "geo": self.geo,
            "language": self.language,
            "device": self.device,
            "search_domain": self.search_domain,
            "region": self.region,
            "city": self.city,
        }


@dataclass(frozen=True)
class ResolvedMarketContext:
    market_profile: str
    provider: str
    geo: str
    language: str
    device: str
    search_domain: str | None
    region: str | None
    city: str | None
    location_code: int
    location_name: str
    location_type: str
    language_code: str
    language_name: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "market_profile": self.market_profile,
            "provider": self.provider,
            "geo": self.geo,
            "language": self.language,
            "device": self.device,
            "search_domain": self.search_domain,
            "region": self.region,
            "city": self.city,
            "location_code": self.location_code,
            "location_name": self.location_name,
            "location_type": self.location_type,
            "language_code": self.language_code,
            "language_name": self.language_name,
        }


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _build_provider_client() -> DataForSEOClient:
    return DataForSEOClient()


def _safe_str(value: Any) -> str:
    return str(value or "").strip()


def _provider_text(value: Any) -> str:
    return str(value or "")


def _clean_optional_text(value: str | None) -> str | None:
    cleaned = _safe_str(value)
    return cleaned or None


def _validate_search_domain(value: str | None) -> str | None:
    cleaned = _clean_optional_text(value)
    if not cleaned:
        return None
    lowered = cleaned.lower()
    if not SEARCH_DOMAIN_PATTERN.fullmatch(lowered):
        raise HTTPException(status_code=400, detail="search_domain must be a valid domain.")
    return lowered


def _normalize_phrase_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower()
    ascii_text = re.sub(r"[^a-z0-9]+", " ", ascii_text)
    return re.sub(r"\s+", " ", ascii_text).strip()


def _normalize_phrase_output(value: str) -> str:
    cleaned = unicodedata.normalize("NFKC", value or "")
    cleaned = cleaned.replace("–", "-").replace("—", "-")
    cleaned = re.sub(r"\s+", " ", cleaned.strip())
    cleaned = re.sub(r"\s+([,.;:!?])", r"\1", cleaned)
    cleaned = re.sub(r"([(/])\s+", r"\1", cleaned)
    cleaned = re.sub(r"\s+([/)])", r"\1", cleaned)
    cleaned = re.sub(r"\s*-\s*", " - ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _tokenize(value: str) -> list[str]:
    return [token.lower() for token in WORD_PATTERN.findall(value or "")]


def _extract_platform_modifiers_from_tokens(tokens: list[str]) -> list[str]:
    return list(
        dict.fromkeys(token for token in tokens if token in PLATFORM_MODIFIER_KEYWORDS)
    )


def _extract_platform_modifiers(value: str) -> list[str]:
    return _extract_platform_modifiers_from_tokens(_tokenize(value))


def _phrase_signature_tokens(
    value: str,
    *,
    exclude_platform_modifiers: bool = True,
) -> tuple[str, ...]:
    platform_tokens = (
        set(_extract_platform_modifiers(value)) if exclude_platform_modifiers else set()
    )
    return tuple(
        token
        for token in _tokenize(value)
        if token not in STOPWORDS and len(token) > 2 and token not in platform_tokens
    )


def _normalize_label(value: str) -> str:
    normalized = _normalize_phrase_key(value)
    return normalized.replace(" ", "_") or "unknown"


def _contains_subsequence(tokens: list[str], subsequence: tuple[str, ...]) -> bool:
    if not subsequence or len(tokens) < len(subsequence):
        return False
    return any(
        tuple(tokens[index : index + len(subsequence)]) == subsequence
        for index in range(len(tokens) - len(subsequence) + 1)
    )


def _shared_anchor_tokens(seed: str) -> list[str]:
    return [
        token
        for token in _tokenize(seed)
        if token not in STOPWORDS and token not in INTENT_KEYWORDS and len(token) > 2
    ]


def _infer_topic_and_intent(tokens: list[str]) -> tuple[str, str]:
    token_set = set(tokens)
    if token_set & DINING_KEYWORDS:
        return "dining", "find_restaurants"
    if _contains_subsequence(tokens, ("where", "is")) or _contains_subsequence(tokens, ("what", "is")):
        return "location_definition", "define_location"
    if token_set & LOCATION_DEFINITION_KEYWORDS:
        return "location_definition", "define_location"
    if token_set & LODGING_KEYWORDS:
        if token_set & SAFETY_KEYWORDS:
            return "lodging", "evaluate_lodging_options"
        if any(token in {"best", "cheap", "luxury", "family", "romantic"} for token in token_set):
            return "lodging", "compare_lodging_options"
        return "lodging", "find_accommodation"
    if token_set & ATTRACTION_KEYWORDS or _contains_subsequence(tokens, ("things", "to", "do")):
        return "attractions", "find_things_to_do"
    if token_set & SAFETY_KEYWORDS:
        return "safety", "evaluate_safety"
    return "local_information", "general_local_information"


def _heuristic_seed_intent_profile(seed: str) -> dict[str, Any]:
    tokens = _tokenize(seed)
    topic_label, intent_label = _infer_topic_and_intent(tokens)
    return {
        "topic_label": topic_label,
        "intent_label": intent_label,
        "anchor_tokens": _shared_anchor_tokens(seed),
    }


def _heuristic_phrase_intent_profile(
    normalized_text: str,
    *,
    seed_intent_profile: dict[str, Any],
) -> dict[str, str]:
    tokens = _tokenize(normalized_text)
    topic_label, intent_label = _infer_topic_and_intent(tokens)
    phrase_anchor_tokens = {
        token
        for token in tokens
        if token not in STOPWORDS and token not in INTENT_KEYWORDS and len(token) > 2
    }
    seed_anchor_tokens = set(seed_intent_profile.get("anchor_tokens") or [])
    shared_anchors = sorted(seed_anchor_tokens & phrase_anchor_tokens)
    seed_topic_label = _safe_str(seed_intent_profile.get("topic_label")) or "unknown"

    if topic_label == seed_topic_label:
        intent_relation = "same_intent"
        reason = "same_vertical_intent_family"
    elif shared_anchors:
        intent_relation = "adjacent_intent"
        reason = f"adjacent_intent_{_normalize_label(intent_label)}"
    else:
        intent_relation = "irrelevant_intent"
        reason = "no_shared_seed_anchor"

    return {
        "topic_label": topic_label,
        "intent_label": intent_label,
        "intent_relation": intent_relation,
        "reason": reason,
    }


def _serialize_pattern_values(
    values: list[str] | list[tuple[str, ...]],
    *,
    limit: int = 5,
) -> list[str]:
    serialized: list[str] = []
    for item in values:
        if isinstance(item, tuple):
            text = " ".join(token for token in item if token).strip()
        else:
            text = _safe_str(item)
        if not text:
            continue
        serialized.append(text)
        if len(serialized) >= limit:
            break
    return serialized


def _is_obvious_garbage(normalized_text: str) -> bool:
    if not normalized_text:
        return True
    lowered = normalized_text.lower()
    if any(pattern.search(lowered) for pattern in PHRASE_JUNK_PATTERNS):
        return True
    if "http://" in lowered or "https://" in lowered or "www." in lowered:
        return True
    token_count = len(_tokenize(normalized_text))
    return token_count == 0 or len(_normalize_phrase_key(normalized_text)) < 2


def _is_near_seed(normalized_text: str, seed: str) -> bool:
    seed_tokens = set(_tokenize(seed))
    phrase_tokens = set(_tokenize(normalized_text))
    if not seed_tokens or not phrase_tokens:
        return False
    overlap = seed_tokens & phrase_tokens
    return len(overlap) >= 1


def _build_phrase_id(
    *,
    provider: str,
    source_type: str,
    market_profile: str,
    seed: str,
    source_rank: int | None,
    text: str,
) -> str:
    material = "|".join(
        [
            provider,
            source_type,
            market_profile,
            seed,
            str(source_rank or ""),
            text,
        ]
    )
    digest = hashlib.sha1(material.encode("utf-8")).hexdigest()[:16]
    return f"phrase_{digest}"


def _build_group_id(phrase_ids: list[str]) -> str:
    material = "|".join(sorted(phrase_ids))
    digest = hashlib.sha1(material.encode("utf-8")).hexdigest()[:16]
    return f"group_{digest}"


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


def _write_failed_status(run_id: str, error: Exception) -> None:
    current_status = read_status(run_id) or {}
    stage = _safe_str(current_status.get("stage")) or FEATURE_NAME
    error_message = _safe_str(error) or error.__class__.__name__
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "failed",
            "stage": stage,
            "error": error_message[:1500],
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )


def _write_stage(run_id: str, stage: str, data: dict[str, Any]) -> None:
    write_stage_result(
        run_id,
        stage,
        {
            "created_at": _now_iso(),
            "data": data,
        },
    )


def _validate_request(
    request: KeywordIntelRunRequest,
) -> ValidatedKeywordIntelRequest:
    seed = _safe_str(request.seed)
    if not seed:
        raise HTTPException(status_code=400, detail="seed is required.")

    market_profile = _safe_str(request.market_profile).lower() or "custom"
    if market_profile not in MARKET_PROFILE_DEFAULTS:
        raise HTTPException(
            status_code=400,
            detail=(
                "market_profile must be one of "
                "'us_planners_en', 'tourists_in_peru_en', 'locals_peru_es', or 'custom'."
            ),
        )

    geo = _safe_str(request.geo).lower() or None
    language = _safe_str(request.language).lower() or None
    preset = MARKET_PROFILE_DEFAULTS[market_profile]

    if preset:
        preset_geo = preset["geo"]
        preset_language = preset["language"]
        if geo and geo != preset_geo:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"market_profile '{market_profile}' requires geo='{preset_geo}', "
                    f"received '{geo}'."
                ),
            )
        if language and language != preset_language:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"market_profile '{market_profile}' requires language='{preset_language}', "
                    f"received '{language}'."
                ),
            )
        geo = preset_geo
        language = preset_language
    else:
        if not geo:
            raise HTTPException(
                status_code=400,
                detail="geo is required when market_profile is 'custom'.",
            )
        if not language:
            raise HTTPException(
                status_code=400,
                detail="language is required when market_profile is 'custom'.",
            )

    if not geo or not re.fullmatch(r"[a-z]{2}", geo):
        raise HTTPException(
            status_code=400,
            detail="geo must be a lowercase ISO alpha-2 country code.",
        )

    if not language or not LANGUAGE_CODE_PATTERN.fullmatch(language):
        raise HTTPException(
            status_code=400,
            detail="language must be a lowercase language code such as 'en' or 'pt-br'.",
        )

    device = _safe_str(request.device).lower() or "desktop"
    if device not in {"desktop", "mobile"}:
        raise HTTPException(
            status_code=400,
            detail="device must be either 'desktop' or 'mobile'.",
        )

    return ValidatedKeywordIntelRequest(
        seed=seed,
        market_profile=market_profile,
        geo=geo,
        language=language,
        device=device,
        search_domain=_validate_search_domain(request.search_domain),
        region=_clean_optional_text(request.region),
        city=_clean_optional_text(request.city),
    )


def resolve_market_context(
    validated_request: ValidatedKeywordIntelRequest,
    *,
    provider_client: DataForSEOClient | None = None,
) -> ResolvedMarketContext:
    client = provider_client or _build_provider_client()
    try:
        location = client.resolve_location(
            geo=validated_request.geo,
            region=validated_request.region,
            city=validated_request.city,
        )
        language_meta = client.resolve_language(validated_request.language)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DataForSEOError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ResolvedMarketContext(
        market_profile=validated_request.market_profile,
        provider="dataforseo",
        geo=validated_request.geo,
        language=validated_request.language,
        device=validated_request.device,
        search_domain=validated_request.search_domain,
        region=validated_request.region,
        city=validated_request.city,
        location_code=location.location_code,
        location_name=location.location_name,
        location_type=location.location_type,
        language_code=language_meta.language_code,
        language_name=language_meta.language_name,
    )


def _make_phrase_record(
    *,
    text: str,
    source_type: str,
    source_rank: int | None,
    seed: str,
    market_context: ResolvedMarketContext | dict[str, Any],
    provider: str = "dataforseo",
) -> dict[str, Any]:
    if isinstance(market_context, ResolvedMarketContext):
        market_payload = market_context.to_dict()
    else:
        market_payload = dict(market_context)
    normalized_text = _normalize_phrase_output(text)
    phrase_id = _build_phrase_id(
        provider=provider,
        source_type=source_type,
        market_profile=_safe_str(market_payload.get("market_profile")),
        seed=seed,
        source_rank=source_rank,
        text=text,
    )
    return {
        "phrase_id": phrase_id,
        "text": text,
        "normalized_text": normalized_text,
        "platform_modifiers": _extract_platform_modifiers(normalized_text),
        "source_type": source_type,
        "provider": provider,
        "source_rank": source_rank,
        "seed": seed,
        "market_profile": _safe_str(market_payload.get("market_profile")),
        "geo": _safe_str(market_payload.get("geo")),
        "language": _safe_str(market_payload.get("language")),
        "device": _clean_optional_text(market_payload.get("device")),
        "search_domain": _clean_optional_text(market_payload.get("search_domain")),
        "region": _clean_optional_text(market_payload.get("region")),
        "city": _clean_optional_text(market_payload.get("city")),
        "filter_reason": None,
        "is_near_seed": _is_near_seed(normalized_text, seed),
        "topic_label": None,
        "intent_label": None,
        "intent_relation": None,
        "classification_reason": None,
        "classification_source": None,
        "source_types": [source_type],
        "source_phrase_ids": [phrase_id],
        "source_ranks": [source_rank],
    }


def _extract_phrase_candidates(value: Any) -> list[str]:
    phrases: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key in PHRASE_FIELD_KEYS and isinstance(item, str):
                phrases.append(item)
            elif key == "items":
                phrases.extend(_extract_phrase_candidates(item))
            elif isinstance(item, (dict, list)):
                phrases.extend(_extract_phrase_candidates(item))
        return phrases

    if isinstance(value, list):
        for item in value:
            phrases.extend(_extract_phrase_candidates(item))
    return phrases


def build_autocomplete_phrase_records(
    suggestions: list[str],
    *,
    seed: str,
    market_context: ResolvedMarketContext | dict[str, Any],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index, suggestion in enumerate(suggestions, start=1):
        raw_text = _provider_text(suggestion)
        if not raw_text.strip():
            continue
        records.append(
            _make_phrase_record(
                text=raw_text,
                source_type="autocomplete",
                source_rank=index,
                seed=seed,
                market_context=market_context,
            )
        )
    return records


def parse_related_search_entries(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        item_type = _safe_str(item.get("type")).lower()
        if item_type not in {"related_searches", "people_also_search"}:
            continue
        source_rank = 0
        for candidate in _extract_phrase_candidates(item):
            raw_text = _provider_text(candidate)
            if not raw_text.strip():
                continue
            source_rank += 1
            entries.append(
                {
                    "text": raw_text,
                    "source_type": item_type,
                    "source_rank": source_rank,
                }
            )
    return entries


def build_related_phrase_records(
    items: list[dict[str, Any]],
    *,
    seed: str,
    market_context: ResolvedMarketContext | dict[str, Any],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for entry in parse_related_search_entries(items):
        records.append(
            _make_phrase_record(
                text=_provider_text(entry.get("text")),
                source_type=_safe_str(entry.get("source_type")),
                source_rank=entry.get("source_rank")
                if isinstance(entry.get("source_rank"), int)
                else None,
                seed=seed,
                market_context=market_context,
            )
        )
    return records


def normalize_phrase_records(
    raw_phrase_records: list[dict[str, Any]],
    *,
    seed: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    deduped_records: dict[str, dict[str, Any]] = {}
    dropped_records: list[dict[str, Any]] = []

    for record in raw_phrase_records:
        updated_record = dict(record)
        normalized_text = _normalize_phrase_output(_provider_text(record.get("text")))
        updated_record["normalized_text"] = normalized_text
        updated_record["platform_modifiers"] = _extract_platform_modifiers(normalized_text)
        updated_record["is_near_seed"] = _is_near_seed(normalized_text, seed)
        normalized_key = _normalize_phrase_key(normalized_text)

        if not normalized_key or _is_obvious_garbage(normalized_text):
            updated_record["filter_reason"] = "garbage_or_empty"
            dropped_records.append(updated_record)
            continue

        if normalized_key in deduped_records:
            existing = deduped_records[normalized_key]
            existing["source_phrase_ids"] = list(
                dict.fromkeys(existing.get("source_phrase_ids", []) + [updated_record["phrase_id"]])
            )
            existing["source_types"] = list(
                dict.fromkeys(existing.get("source_types", []) + [updated_record["source_type"]])
            )
            existing["source_ranks"] = list(existing.get("source_ranks", [])) + [
                updated_record.get("source_rank")
            ]
            existing["platform_modifiers"] = list(
                dict.fromkeys(
                    list(existing.get("platform_modifiers") or [])
                    + list(updated_record.get("platform_modifiers") or [])
                )
            )
            dropped_copy = dict(updated_record)
            dropped_copy["filter_reason"] = "exact_duplicate"
            dropped_records.append(dropped_copy)
            continue

        deduped_records[normalized_key] = updated_record

    return list(deduped_records.values()), dropped_records


def _compact_provider_response(result: DataForSEORequestResult) -> dict[str, Any]:
    compact_results: list[dict[str, Any]] = []
    for item in result.task_payload.get("result") or []:
        if not isinstance(item, dict):
            continue
        compact_results.append(
            {
                "keyword": item.get("keyword"),
                "type": item.get("type"),
                "items_count": len(item.get("items") or []),
                "items": item.get("items") or [],
            }
        )

    return {
        "status_code": result.response_payload.get("status_code"),
        "status_message": result.response_payload.get("status_message"),
        "task_id": result.task_payload.get("id"),
        "task_status_code": result.task_payload.get("status_code"),
        "task_status_message": result.task_payload.get("status_message"),
        "cost": result.task_payload.get("cost"),
        "path": result.path,
        "results": compact_results,
    }


def _provider_request_context(
    market_context: dict[str, Any],
    request_result: DataForSEORequestResult,
) -> dict[str, Any]:
    return {
        "method": request_result.method,
        "path": request_result.path,
        "payload": request_result.request_payload,
        "market_context": market_context,
    }


def _execute_autocomplete_request(
    provider_client: Any,
    *,
    keyword: str,
    market_context: dict[str, Any],
) -> DataForSEORequestResult:
    if hasattr(provider_client, "execute_autocomplete_request"):
        return provider_client.execute_autocomplete_request(
            keyword=keyword,
            location_code=int(market_context.get("location_code") or 0),
            language_code=_safe_str(market_context.get("language_code")),
            device=_safe_str(market_context.get("device")) or "desktop",
            search_domain=_clean_optional_text(market_context.get("search_domain")),
        )

    suggestions = provider_client.fetch_autocomplete_suggestions(
        keyword=keyword,
        location_code=int(market_context.get("location_code") or 0),
        language_code=_safe_str(market_context.get("language_code")),
        device=_safe_str(market_context.get("device")) or "desktop",
        search_domain=_clean_optional_text(market_context.get("search_domain")),
    )
    request_payload = None
    if hasattr(provider_client, "build_autocomplete_task"):
        request_payload = [
            provider_client.build_autocomplete_task(
                keyword=keyword,
                location_code=int(market_context.get("location_code") or 0),
                language_code=_safe_str(market_context.get("language_code")),
                device=_safe_str(market_context.get("device")) or "desktop",
                search_domain=_clean_optional_text(market_context.get("search_domain")),
            )
        ]
    return DataForSEORequestResult(
        method="POST",
        path="/v3/serp/google/autocomplete/live/advanced",
        request_payload=request_payload,
        response_payload={"status_code": 20000, "status_message": "OK"},
        task_payload={
            "id": "stub-autocomplete",
            "status_code": 20000,
            "status_message": "OK",
            "result": [
                {
                    "items": [{"suggestion": suggestion} for suggestion in suggestions],
                }
            ],
        },
    )


def _execute_organic_request(
    provider_client: Any,
    *,
    keyword: str,
    market_context: dict[str, Any],
) -> DataForSEORequestResult:
    if hasattr(provider_client, "execute_organic_request"):
        return provider_client.execute_organic_request(
            keyword=keyword,
            location_code=int(market_context.get("location_code") or 0),
            language_code=_safe_str(market_context.get("language_code")),
            device=_safe_str(market_context.get("device")) or "desktop",
            search_domain=_clean_optional_text(market_context.get("search_domain")),
        )

    organic_items = provider_client.fetch_organic_items(
        keyword=keyword,
        location_code=int(market_context.get("location_code") or 0),
        language_code=_safe_str(market_context.get("language_code")),
        device=_safe_str(market_context.get("device")) or "desktop",
        search_domain=_clean_optional_text(market_context.get("search_domain")),
    )
    request_payload = None
    if hasattr(provider_client, "build_organic_task"):
        request_payload = [
            provider_client.build_organic_task(
                keyword=keyword,
                location_code=int(market_context.get("location_code") or 0),
                language_code=_safe_str(market_context.get("language_code")),
                device=_safe_str(market_context.get("device")) or "desktop",
                search_domain=_clean_optional_text(market_context.get("search_domain")),
            )
        ]
    return DataForSEORequestResult(
        method="POST",
        path="/v3/serp/google/organic/live/advanced",
        request_payload=request_payload,
        response_payload={"status_code": 20000, "status_message": "OK"},
        task_payload={
            "id": "stub-organic",
            "status_code": 20000,
            "status_message": "OK",
            "result": [{"items": organic_items}],
        },
    )


def _invoke_json_llm(prompt: str) -> tuple[dict[str, Any], str]:
    llm = get_vertex_llm(
        temperature=0.1,
        max_tokens=4096,
        model_name=DEFAULT_MODEL,
    )
    raw_response = _safe_str(llm.invoke(prompt))
    parsed = parse_json_response(raw_response)
    if not isinstance(parsed, dict):
        raise ValueError("Expected JSON object response from LLM.")
    return parsed, raw_response


def _format_phrase_records_for_prompt(records: list[dict[str, Any]]) -> str:
    return "\n".join(
        (
            f"- {record['phrase_id']} | normalized={record.get('normalized_text')!r} "
            f"| text={record.get('text')!r} | source={record.get('source_type')} "
            f"| platforms={record.get('platform_modifiers') or []}"
        )
        for record in records
    )


def _validate_intent_classification_payload(
    payload: dict[str, Any],
    *,
    candidate_records: list[dict[str, Any]],
) -> tuple[bool, list[str], dict[str, str], list[dict[str, str]]]:
    candidate_ids = [record["phrase_id"] for record in candidate_records]
    candidate_id_set = set(candidate_ids)
    seed_intent = payload.get("seed_intent")
    phrases = payload.get("phrases")
    issues: list[str] = []

    if not isinstance(seed_intent, dict):
        return False, ["`seed_intent` must be an object."], {}, []
    if not isinstance(phrases, list):
        return False, ["`phrases` must be an array."], {}, []

    normalized_seed_intent = {
        "topic_label": _normalize_label(_safe_str(seed_intent.get("topic_label"))),
        "intent_label": _normalize_label(_safe_str(seed_intent.get("intent_label"))),
    }
    if not normalized_seed_intent["topic_label"] or not normalized_seed_intent["intent_label"]:
        issues.append("`seed_intent` must include non-empty topic_label and intent_label.")

    seen_ids: list[str] = []
    classifications: list[dict[str, str]] = []
    for index, item in enumerate(phrases):
        if not isinstance(item, dict):
            issues.append(f"phrase {index + 1} must be an object.")
            continue
        phrase_id = _safe_str(item.get("phrase_id"))
        topic_label = _normalize_label(_safe_str(item.get("topic_label")))
        intent_label = _normalize_label(_safe_str(item.get("intent_label")))
        intent_relation = _safe_str(item.get("intent_relation"))
        reason = _safe_str(item.get("reason"))
        if phrase_id not in candidate_id_set:
            issues.append(f"unknown phrase_id `{phrase_id}`.")
            continue
        if intent_relation not in INTENT_RELATION_VALUES:
            issues.append(
                f"phrase {index + 1} must use intent_relation from {sorted(INTENT_RELATION_VALUES)}."
            )
            continue
        if not topic_label or not intent_label or not reason:
            issues.append(
                f"phrase {index + 1} must include non-empty topic_label, intent_label, and reason."
            )
            continue
        classifications.append(
            {
                "phrase_id": phrase_id,
                "topic_label": topic_label,
                "intent_label": intent_label,
                "intent_relation": intent_relation,
                "reason": reason,
            }
        )
        seen_ids.append(phrase_id)

    duplicate_ids = [phrase_id for phrase_id, count in Counter(seen_ids).items() if count > 1]
    if duplicate_ids:
        issues.append("duplicate phrase assignments found: " + ", ".join(sorted(duplicate_ids)))

    missing_ids = [phrase_id for phrase_id in candidate_ids if phrase_id not in seen_ids]
    if missing_ids:
        issues.append("missing phrase_ids: " + ", ".join(missing_ids))

    return not issues, issues, normalized_seed_intent, classifications


def classify_phrase_intent_with_ai(
    *,
    seed: str,
    market_context: dict[str, Any],
    normalized_phrase_records: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if not normalized_phrase_records:
        return _heuristic_seed_intent_profile(seed), []

    fallback_seed_intent = _heuristic_seed_intent_profile(seed)
    fallback_lookup = {
        record["phrase_id"]: _heuristic_phrase_intent_profile(
            _safe_str(record.get("normalized_text")),
            seed_intent_profile=fallback_seed_intent,
        )
        for record in normalized_phrase_records
    }
    prompt = INTENT_CLASSIFICATION_PROMPT.format(
        seed=seed,
        market_context=json.dumps(market_context, ensure_ascii=False, sort_keys=True),
        phrases=_format_phrase_records_for_prompt(normalized_phrase_records),
    )
    current_prompt = prompt
    last_issues: list[str] = []

    try:
        for _attempt in range(MAX_INTENT_CLASSIFICATION_ATTEMPTS):
            parsed, raw_response = _invoke_json_llm(current_prompt)
            is_valid, issues, seed_intent_profile, classifications = (
                _validate_intent_classification_payload(
                    parsed,
                    candidate_records=normalized_phrase_records,
                )
            )
            if is_valid:
                classifications_by_id = {
                    item["phrase_id"]: item for item in classifications
                }
                classified_records: list[dict[str, Any]] = []
                for record in normalized_phrase_records:
                    classification = classifications_by_id[record["phrase_id"]]
                    classified_records.append(
                        {
                            **record,
                            "topic_label": classification["topic_label"],
                            "intent_label": classification["intent_label"],
                            "intent_relation": classification["intent_relation"],
                            "classification_reason": classification["reason"],
                            "classification_source": "ai",
                        }
                    )
                return seed_intent_profile, classified_records

            last_issues = issues
            current_prompt = INTENT_CLASSIFICATION_RETRY_PROMPT.format(
                issues="\n".join(f"- {issue}" for issue in issues),
                original_prompt=prompt,
                previous_response=raw_response,
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Keyword-intel intent classification fell back to heuristics: %s", exc)

    if last_issues:
        logger.warning(
            "Keyword-intel intent classification fell back to heuristics: %s",
            "; ".join(last_issues),
        )

    return (
        fallback_seed_intent,
        [
            {
                **record,
                "topic_label": fallback_lookup[record["phrase_id"]]["topic_label"],
                "intent_label": fallback_lookup[record["phrase_id"]]["intent_label"],
                "intent_relation": fallback_lookup[record["phrase_id"]]["intent_relation"],
                "classification_reason": fallback_lookup[record["phrase_id"]]["reason"],
                "classification_source": "heuristic",
            }
            for record in normalized_phrase_records
        ],
    )


def _filter_rule_reason(record: dict[str, Any]) -> str | None:
    normalized_text = _safe_str(record.get("normalized_text"))
    if _is_obvious_garbage(normalized_text):
        return "garbage_or_empty"
    return None


def _validate_filtering_payload(
    payload: dict[str, Any],
    *,
    candidate_records: list[dict[str, Any]],
) -> tuple[bool, list[str], list[str], dict[str, str]]:
    candidate_ids = [record["phrase_id"] for record in candidate_records]
    candidate_id_set = set(candidate_ids)
    retained_ids = payload.get("retained_phrase_ids")
    filtered_payload = payload.get("filtered")
    issues: list[str] = []

    if not isinstance(retained_ids, list):
        return False, ["`retained_phrase_ids` must be an array."], [], {}
    if not isinstance(filtered_payload, list):
        return False, ["`filtered` must be an array."], [], {}

    normalized_retained: list[str] = []
    filtered_map: dict[str, str] = {}
    seen_ids: list[str] = []

    for phrase_id in retained_ids:
        normalized_phrase_id = _safe_str(phrase_id)
        if normalized_phrase_id not in candidate_id_set:
            issues.append(f"unknown retained phrase_id `{normalized_phrase_id}`.")
            continue
        normalized_retained.append(normalized_phrase_id)
        seen_ids.append(normalized_phrase_id)

    for item in filtered_payload:
        if not isinstance(item, dict):
            issues.append("filtered items must be objects.")
            continue
        phrase_id = _safe_str(item.get("phrase_id"))
        reason = _safe_str(item.get("reason"))
        if phrase_id not in candidate_id_set:
            issues.append(f"unknown filtered phrase_id `{phrase_id}`.")
            continue
        if not reason:
            issues.append(f"filtered phrase `{phrase_id}` is missing a reason.")
            continue
        filtered_map[phrase_id] = reason
        seen_ids.append(phrase_id)

    duplicate_ids = [phrase_id for phrase_id, count in Counter(seen_ids).items() if count > 1]
    if duplicate_ids:
        issues.append("duplicate phrase assignments found: " + ", ".join(sorted(duplicate_ids)))

    missing_ids = [phrase_id for phrase_id in candidate_ids if phrase_id not in seen_ids]
    if missing_ids:
        issues.append("missing phrase_ids: " + ", ".join(missing_ids))

    return not issues, issues, normalized_retained, filtered_map


def filter_irrelevant_phrases_with_ai(
    *,
    seed: str,
    market_context: dict[str, Any],
    seed_intent_profile: dict[str, Any],
    classified_phrase_records: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    del seed
    del market_context
    del seed_intent_profile

    rule_filtered: list[dict[str, Any]] = []
    retained_records: list[dict[str, Any]] = []
    for record in classified_phrase_records:
        reason = _filter_rule_reason(record)
        if reason:
            filtered_record = dict(record)
            filtered_record["filter_reason"] = reason
            rule_filtered.append(filtered_record)
            continue
        if _safe_str(record.get("intent_relation")) == "same_intent":
            retained_records.append(dict(record))
            continue
        filtered_record = dict(record)
        filtered_record["filter_reason"] = _safe_str(record.get("classification_reason")) or (
            f"{_safe_str(record.get('intent_relation'))}:{_normalize_label(_safe_str(record.get('intent_label')))}"
        )
        rule_filtered.append(filtered_record)

    return retained_records, rule_filtered


def _validate_grouping_payload(
    payload: dict[str, Any],
    *,
    retained_phrase_records: list[dict[str, Any]],
) -> tuple[bool, list[str], list[list[str]]]:
    groups = payload.get("groups")
    issues: list[str] = []
    if not isinstance(groups, list) or not groups:
        return False, ["`groups` must be a non-empty array."], []

    retained_ids = [record["phrase_id"] for record in retained_phrase_records]
    retained_id_set = set(retained_ids)
    order_map = {phrase_id: index for index, phrase_id in enumerate(retained_ids)}
    seen_ids: list[str] = []
    normalized_groups: list[list[str]] = []

    for index, group in enumerate(groups):
        if not isinstance(group, dict):
            issues.append(f"group {index + 1} must be an object.")
            continue
        phrase_ids = group.get("phrase_ids")
        if not isinstance(phrase_ids, list) or not phrase_ids:
            issues.append(f"group {index + 1} must include a non-empty `phrase_ids` array.")
            continue
        normalized_phrase_ids: list[str] = []
        for phrase_id in phrase_ids:
            normalized_phrase_id = _safe_str(phrase_id)
            if normalized_phrase_id not in retained_id_set:
                issues.append(
                    f"group {index + 1} includes unknown phrase_id `{normalized_phrase_id}`."
                )
                continue
            normalized_phrase_ids.append(normalized_phrase_id)
            seen_ids.append(normalized_phrase_id)
        normalized_phrase_ids.sort(key=lambda phrase_id: order_map[phrase_id])
        normalized_groups.append(normalized_phrase_ids)

    duplicate_ids = [phrase_id for phrase_id, count in Counter(seen_ids).items() if count > 1]
    if duplicate_ids:
        issues.append("duplicate phrase assignments found: " + ", ".join(sorted(duplicate_ids)))

    missing_ids = [phrase_id for phrase_id in retained_ids if phrase_id not in seen_ids]
    if missing_ids:
        issues.append("missing phrase_ids: " + ", ".join(missing_ids))

    return not issues, issues, normalized_groups


def _market_hint_tokens(seed: str, market_context: dict[str, Any]) -> set[str]:
    values = [
        seed,
        _safe_str(market_context.get("location_name")),
        _safe_str(market_context.get("city")),
        _safe_str(market_context.get("region")),
    ]
    return {
        token
        for value in values
        for token in _phrase_signature_tokens(value)
    }


def _merge_phrase_ids_in_order(
    phrase_ids: list[str],
    *,
    order_map: dict[str, int],
) -> list[str]:
    return sorted(dict.fromkeys(phrase_ids), key=lambda phrase_id: order_map[phrase_id])


def _records_are_near_equivalent(
    left_record: dict[str, Any],
    right_record: dict[str, Any],
    *,
    market_tokens: set[str],
) -> bool:
    left_platforms = tuple(left_record.get("platform_modifiers") or [])
    right_platforms = tuple(right_record.get("platform_modifiers") or [])
    if left_platforms != right_platforms:
        return False

    left_tokens = set(_phrase_signature_tokens(_safe_str(left_record.get("normalized_text"))))
    right_tokens = set(_phrase_signature_tokens(_safe_str(right_record.get("normalized_text"))))
    if not left_tokens or not right_tokens:
        return False

    shared_tokens = left_tokens & right_tokens
    if len(shared_tokens) < 2:
        return False

    if left_tokens == right_tokens:
        return True

    smaller_tokens, larger_tokens = (
        (left_tokens, right_tokens)
        if len(left_tokens) <= len(right_tokens)
        else (right_tokens, left_tokens)
    )
    extra_tokens = larger_tokens - smaller_tokens
    if smaller_tokens <= larger_tokens and extra_tokens and extra_tokens <= market_tokens:
        return True

    left_stem = _extract_question_stem(_tokenize(_safe_str(left_record.get("normalized_text"))))
    right_stem = _extract_question_stem(
        _tokenize(_safe_str(right_record.get("normalized_text")))
    )
    if left_stem and left_stem == right_stem:
        union_size = len(left_tokens | right_tokens)
        jaccard_score = len(shared_tokens) / max(union_size, 1)
        if jaccard_score >= NEAR_EQUIVALENT_JACCARD_THRESHOLD:
            return True

    return False


def _groups_are_near_equivalent(
    left_group: dict[str, Any],
    right_group: dict[str, Any],
    *,
    retained_lookup: dict[str, dict[str, Any]],
    market_tokens: set[str],
) -> bool:
    left_records = [
        retained_lookup[phrase_id]
        for phrase_id in left_group.get("phrase_ids") or []
        if phrase_id in retained_lookup
    ]
    right_records = [
        retained_lookup[phrase_id]
        for phrase_id in right_group.get("phrase_ids") or []
        if phrase_id in retained_lookup
    ]
    if not left_records or not right_records:
        return False

    smaller_group, larger_group = (
        (left_records, right_records)
        if len(left_records) <= len(right_records)
        else (right_records, left_records)
    )
    return all(
        any(
            _records_are_near_equivalent(
                smaller_record,
                larger_record,
                market_tokens=market_tokens,
            )
            for larger_record in larger_group
        )
        for smaller_record in smaller_group
    )


def _merge_near_equivalent_groups(
    groups: list[dict[str, Any]],
    *,
    retained_lookup: dict[str, dict[str, Any]],
    market_tokens: set[str],
    order_map: dict[str, int],
) -> list[dict[str, Any]]:
    if len(groups) <= 1:
        return groups

    sorted_groups = sorted(
        groups,
        key=lambda group: min(order_map[phrase_id] for phrase_id in group.get("phrase_ids") or []),
    )
    merged_groups: list[dict[str, Any]] = []
    consumed_indexes: set[int] = set()

    for index, group in enumerate(sorted_groups):
        if index in consumed_indexes:
            continue

        merged_group = {
            "phrase_ids": _merge_phrase_ids_in_order(
                list(group.get("phrase_ids") or []),
                order_map=order_map,
            ),
            "modifier_tags": list(group.get("modifier_tags") or []),
        }
        consumed_indexes.add(index)

        merged = True
        while merged:
            merged = False
            for other_index, other_group in enumerate(sorted_groups):
                if other_index in consumed_indexes:
                    continue
                if not _groups_are_near_equivalent(
                    merged_group,
                    other_group,
                    retained_lookup=retained_lookup,
                    market_tokens=market_tokens,
                ):
                    continue

                merged_group["phrase_ids"] = _merge_phrase_ids_in_order(
                    merged_group["phrase_ids"] + list(other_group.get("phrase_ids") or []),
                    order_map=order_map,
                )
                merged_group["modifier_tags"] = list(
                    dict.fromkeys(
                        list(merged_group.get("modifier_tags") or [])
                        + list(other_group.get("modifier_tags") or [])
                    )
                )
                consumed_indexes.add(other_index)
                merged = True

        merged_groups.append(
            {
                "group_id": _build_group_id(merged_group["phrase_ids"]),
                "phrase_ids": merged_group["phrase_ids"],
                "modifier_tags": merged_group["modifier_tags"],
            }
        )

    return merged_groups


def semantic_group_phrases_with_ai(
    *,
    seed: str,
    market_context: dict[str, Any],
    retained_phrase_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not retained_phrase_records:
        return []

    order_map = {
        record["phrase_id"]: index for index, record in enumerate(retained_phrase_records)
    }
    retained_lookup = {
        record["phrase_id"]: record for record in retained_phrase_records
    }
    market_tokens = _market_hint_tokens(seed, market_context)
    buckets: dict[tuple[str, str, tuple[str, ...]], list[dict[str, Any]]] = {}
    for record in retained_phrase_records:
        bucket_key = (
            _normalize_label(_safe_str(record.get("topic_label"))),
            _normalize_label(_safe_str(record.get("intent_label"))),
            tuple(record.get("platform_modifiers") or []),
        )
        buckets.setdefault(bucket_key, []).append(record)

    groups: list[dict[str, Any]] = []
    for (topic_label, intent_label, platform_modifiers), bucket_records in buckets.items():
        if len(bucket_records) == 1:
            groups.append(
                {
                    "group_id": _build_group_id([bucket_records[0]["phrase_id"]]),
                    "phrase_ids": [bucket_records[0]["phrase_id"]],
                    "modifier_tags": list(platform_modifiers),
                }
            )
            continue

        prompt = GROUPING_PROMPT.format(
            seed=seed,
            market_context=json.dumps(market_context, ensure_ascii=False, sort_keys=True),
            topic_label=topic_label,
            intent_label=intent_label,
            platform_modifiers=json.dumps(list(platform_modifiers), ensure_ascii=False),
            phrases=_format_phrase_records_for_prompt(bucket_records),
        )
        current_prompt = prompt
        last_issues: list[str] = []
        bucket_groups: list[dict[str, Any]] | None = None

        try:
            for _attempt in range(MAX_GROUPING_ATTEMPTS):
                parsed, raw_response = _invoke_json_llm(current_prompt)
                is_valid, issues, grouped_phrase_ids = _validate_grouping_payload(
                    parsed,
                    retained_phrase_records=bucket_records,
                )
                if is_valid:
                    bucket_groups = [
                        {
                            "group_id": _build_group_id(phrase_ids),
                            "phrase_ids": phrase_ids,
                            "modifier_tags": list(platform_modifiers),
                        }
                        for phrase_ids in grouped_phrase_ids
                    ]
                    break

                last_issues = issues
                current_prompt = GROUPING_RETRY_PROMPT.format(
                    issues="\n".join(f"- {issue}" for issue in issues),
                    original_prompt=prompt,
                    previous_response=raw_response,
                )
            else:
                bucket_groups = [
                    {
                        "group_id": _build_group_id([record["phrase_id"]]),
                        "phrase_ids": [record["phrase_id"]],
                        "modifier_tags": list(platform_modifiers),
                    }
                    for record in bucket_records
                ]
        except Exception as exc:  # noqa: BLE001
            logger.warning("Keyword-intel grouping fell back to singleton groups: %s", exc)
            bucket_groups = [
                {
                    "group_id": _build_group_id([record["phrase_id"]]),
                    "phrase_ids": [record["phrase_id"]],
                    "modifier_tags": list(platform_modifiers),
                }
                for record in bucket_records
            ]

        if last_issues:
            logger.warning(
                "Keyword-intel grouping bucket fell back after issues: %s",
                "; ".join(last_issues),
            )

        bucket_groups = bucket_groups or [
            {
                "group_id": _build_group_id([record["phrase_id"]]),
                "phrase_ids": [record["phrase_id"]],
                "modifier_tags": list(platform_modifiers),
            }
            for record in bucket_records
        ]
        groups.extend(
            _merge_near_equivalent_groups(
                bucket_groups,
                retained_lookup=retained_lookup,
                market_tokens=market_tokens,
                order_map=order_map,
            )
        )

    groups.sort(
        key=lambda group: min(
            order_map[phrase_id] for phrase_id in group.get("phrase_ids", [])
        )
    )
    return groups


def _derive_fallback_label(phrases: list[str], seed: str) -> str:
    if not phrases:
        return "keyword cluster"
    first_phrase = phrases[0]
    first_tokens = [token for token in _tokenize(first_phrase) if token not in STOPWORDS]
    seed_tokens = set(_tokenize(seed))
    leading_tokens = [token for token in first_tokens if token not in seed_tokens]
    label_tokens = leading_tokens[:3] or first_tokens[:3]
    if not label_tokens:
        return first_phrase
    return " ".join(label_tokens)


def _validate_labeling_payload(
    payload: dict[str, Any],
    *,
    groups: list[dict[str, Any]],
) -> tuple[bool, list[str], dict[str, str]]:
    payload_groups = payload.get("groups")
    issues: list[str] = []
    if not isinstance(payload_groups, list) or len(payload_groups) != len(groups):
        return False, ["`groups` must match the input group count exactly."], {}

    expected_group_ids = [group["group_id"] for group in groups]
    labels_by_group_id: dict[str, str] = {}

    for index, item in enumerate(payload_groups):
        if not isinstance(item, dict):
            issues.append(f"group {index + 1} must be an object.")
            continue
        group_id = _safe_str(item.get("group_id"))
        label = _safe_str(item.get("label"))
        if group_id not in expected_group_ids:
            issues.append(f"group {index + 1} includes unknown group_id `{group_id}`.")
            continue
        if not label:
            issues.append(f"group {index + 1} is missing a label.")
            continue
        labels_by_group_id[group_id] = label

    missing_group_ids = [
        group_id for group_id in expected_group_ids if group_id not in labels_by_group_id
    ]
    if missing_group_ids:
        issues.append("missing group_ids: " + ", ".join(missing_group_ids))

    return not issues, issues, labels_by_group_id


def _phrases_for_group(
    phrase_ids: list[str],
    retained_lookup: dict[str, dict[str, Any]],
) -> list[str]:
    return [
        _provider_text(retained_lookup[phrase_id].get("text"))
        for phrase_id in phrase_ids
        if phrase_id in retained_lookup
    ]


def label_groups_with_ai(
    *,
    seed: str,
    language: str,
    market_context: dict[str, Any],
    groups: list[dict[str, Any]],
    retained_phrase_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not groups:
        return []

    retained_lookup = {
        record["phrase_id"]: record for record in retained_phrase_records
    }
    prompt_groups = [
        {
            "group_id": group["group_id"],
            "phrases": _phrases_for_group(group.get("phrase_ids") or [], retained_lookup),
        }
        for group in groups
    ]
    prompt = LABELING_PROMPT.format(
        seed=seed,
        language=language,
        market_context=json.dumps(market_context, ensure_ascii=False, sort_keys=True),
        groups=json.dumps(prompt_groups, ensure_ascii=False, indent=2),
    )
    current_prompt = prompt
    last_issues: list[str] = []

    try:
        for _attempt in range(MAX_LABELING_ATTEMPTS):
            parsed, raw_response = _invoke_json_llm(current_prompt)
            is_valid, issues, labels_by_group_id = _validate_labeling_payload(
                parsed,
                groups=groups,
            )
            if is_valid:
                labeled_groups: list[dict[str, Any]] = []
                for group in groups:
                    phrase_ids = list(group.get("phrase_ids") or [])
                    labeled_groups.append(
                        {
                            "group_id": group["group_id"],
                            "label": labels_by_group_id[group["group_id"]],
                            "phrase_ids": phrase_ids,
                            "phrases": _phrases_for_group(phrase_ids, retained_lookup),
                            "modifier_tags": list(group.get("modifier_tags") or []),
                        }
                    )
                return labeled_groups

            last_issues = issues
            current_prompt = LABELING_RETRY_PROMPT.format(
                issues="\n".join(f"- {issue}" for issue in issues),
                original_prompt=prompt,
                previous_response=raw_response,
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Keyword-intel labeling fell back to heuristic labels: %s", exc)

    if last_issues:
        logger.warning(
            "Keyword-intel labeling fell back to heuristic labels: %s",
            "; ".join(last_issues),
        )

    return [
        {
            "group_id": group["group_id"],
            "label": _derive_fallback_label(
                _phrases_for_group(list(group.get("phrase_ids") or []), retained_lookup),
                seed,
            ),
            "phrase_ids": list(group.get("phrase_ids") or []),
            "phrases": _phrases_for_group(list(group.get("phrase_ids") or []), retained_lookup),
            "modifier_tags": list(group.get("modifier_tags") or []),
        }
        for group in groups
    ]


def _extract_question_stem(tokens: list[str]) -> tuple[str, ...] | None:
    if not tokens or tokens[0] not in QUESTION_STARTERS:
        return None
    if len(tokens) >= 3 and tokens[1] == "to":
        return tuple(tokens[:3])
    if len(tokens) >= 2:
        return tuple(tokens[:2])
    return (tokens[0],)


def extract_pattern_summary(
    *,
    seed: str,
    retained_phrase_records: list[dict[str, Any]],
) -> dict[str, list[str]]:
    seed_tokens = _phrase_signature_tokens(seed)
    seed_token_set = set(seed_tokens)

    modifier_counter: Counter[tuple[str, ...]] = Counter()
    entity_counter: Counter[tuple[str, ...]] = Counter((token,) for token in seed_tokens)
    location_counter: Counter[tuple[str, ...]] = Counter()
    question_counter: Counter[tuple[str, ...]] = Counter()
    feature_counter: Counter[tuple[str, ...]] = Counter()
    platform_counter: Counter[tuple[str, ...]] = Counter()

    for record in retained_phrase_records:
        normalized_text = _safe_str(record.get("normalized_text"))
        tokens = _tokenize(normalized_text)
        platform_tokens = tuple(record.get("platform_modifiers") or _extract_platform_modifiers_from_tokens(tokens))
        for platform_token in platform_tokens:
            platform_counter[(platform_token,)] += 1

        informative_tokens = [
            token
            for token in tokens
            if token not in STOPWORDS
            and len(token) > 2
            and token not in PLATFORM_MODIFIER_KEYWORDS
        ]
        question_stem = _extract_question_stem(tokens)
        if question_stem:
            question_counter[question_stem] += 1

        location_anchors: set[str] = set()
        for index, token in enumerate(tokens[:-1]):
            if token not in LOCATION_PREPOSITIONS:
                continue
            anchor = tokens[index + 1]
            if anchor not in STOPWORDS and len(anchor) > 2:
                location_counter[(anchor,)] += 1
                location_anchors.add(anchor)

        for token in informative_tokens:
            if token in seed_token_set:
                entity_counter[(token,)] += 1
                continue
            modifier_counter[(token,)] += 1
            if token not in GENERIC_FEATURE_STOPWORDS and token not in location_anchors:
                feature_counter[(token,)] += 1

        for index in range(len(tokens) - 1):
            pair = tokens[index : index + 2]
            if any(
                token in STOPWORDS
                or len(token) <= 2
                or token in PLATFORM_MODIFIER_KEYWORDS
                for token in pair
            ):
                continue
            phrase_key = tuple(pair)
            if all(token in seed_token_set for token in phrase_key):
                continue
            feature_counter[phrase_key] += 1

    top_entities: list[tuple[str, ...]] = list(dict.fromkeys((token,) for token in seed_tokens))
    for token, _count in entity_counter.most_common(8):
        if token not in top_entities:
            top_entities.append(token)
        if len(top_entities) >= 5:
            break

    return {
        "top_modifiers": _serialize_pattern_values(
            [token for token, _count in modifier_counter.most_common(5)]
        ),
        "top_entities": _serialize_pattern_values(top_entities[:5]),
        "recurring_location_anchors": _serialize_pattern_values(
            [token for token, _count in location_counter.most_common(5)]
        ),
        "recurring_question_stems": _serialize_pattern_values(
            [token for token, _count in question_counter.most_common(5)]
        ),
        "recurring_feature_terms": _serialize_pattern_values(
            [token for token, _count in feature_counter.most_common(5)]
        ),
        "platform_modifiers": _serialize_pattern_values(
            [token for token, _count in platform_counter.most_common(5)]
        ),
    }


def score_groups(
    *,
    groups: list[dict[str, Any]],
    retained_phrase_records: list[dict[str, Any]],
    pattern_summary: dict[str, list[str]],
) -> list[dict[str, Any]]:
    if not groups:
        return []

    retained_lookup = {
        record["phrase_id"]: record for record in retained_phrase_records
    }
    total_clean_phrases = max(len(retained_phrase_records), 1)
    available_sources = {
        source
        for record in retained_phrase_records
        for source in (record.get("source_types") or [record.get("source_type")])
        if source
    }
    available_source_count = max(len(available_sources), 1)
    top_modifiers = set(pattern_summary.get("top_modifiers") or [])

    scored_groups: list[dict[str, Any]] = []
    for group in groups:
        phrase_ids = list(group.get("phrase_ids") or [])
        records = [
            retained_lookup[phrase_id]
            for phrase_id in phrase_ids
            if phrase_id in retained_lookup
        ]
        phrase_count = len(records)
        unique_sources = {
            source
            for record in records
            for source in (record.get("source_types") or [record.get("source_type")])
            if source
        }
        specificity_scores = [
            min(len(_tokenize(_safe_str(record.get("normalized_text")))) / 6.0, 1.0)
            for record in records
        ]
        matched_modifiers = {
            token
            for record in records
            for token in _tokenize(_safe_str(record.get("normalized_text")))
            if token in top_modifiers
        }
        modifier_denominator = max(len(top_modifiers), 1)
        coverage_score = phrase_count / total_clean_phrases
        source_diversity_score = len(unique_sources) / available_source_count
        specificity_score = (
            sum(specificity_scores) / len(specificity_scores) if specificity_scores else 0.0
        )
        modifier_strength_score = len(matched_modifiers) / modifier_denominator
        score = (
            0.40 * coverage_score
            + 0.20 * source_diversity_score
            + 0.25 * specificity_score
            + 0.15 * modifier_strength_score
        )
        scored_groups.append(
            {
                "group_id": group["group_id"],
                "label": _safe_str(group.get("label")),
                "phrase_ids": phrase_ids,
                "phrases": [record.get("text") for record in records],
                "modifier_tags": list(group.get("modifier_tags") or []),
                "score": round(min(score, 1.0), 2),
            }
        )

    scored_groups.sort(
        key=lambda group: (
            -float(group.get("score") or 0.0),
            -len(group.get("phrase_ids") or []),
            _safe_str(group.get("label")).lower(),
        )
    )
    return scored_groups


def _build_final_artifact(state: dict[str, Any]) -> dict[str, Any]:
    request_payload = dict(state.get("request") or {})
    market_context = dict(state.get("market_context") or {})
    raw_phrase_records = [dict(record) for record in state.get("raw_phrase_records") or []]
    normalized_phrase_records = [
        dict(record) for record in state.get("normalized_phrase_records") or []
    ]
    retained_phrase_records = [
        dict(record) for record in state.get("retained_phrase_records") or []
    ]
    filtered_out_phrase_records = [
        dict(record) for record in state.get("filtered_out_phrase_records") or []
    ]

    return {
        "seed": _safe_str(request_payload.get("seed")),
        "geo": _safe_str(market_context.get("geo")),
        "language": _safe_str(market_context.get("language")),
        "market_context": market_context,
        "raw_phrases": [_provider_text(record.get("text")) for record in raw_phrase_records],
        "clean_phrases": [
            _safe_str(record.get("normalized_text")) for record in retained_phrase_records
        ],
        "filtered_out_phrases": [
            _safe_str(record.get("normalized_text"))
            for record in filtered_out_phrase_records
        ],
        "pattern_summary": dict(state.get("pattern_summary") or {}),
        "groups": [dict(group) for group in state.get("scored_groups") or []],
        "raw_phrase_records": raw_phrase_records,
        "normalized_phrase_records": normalized_phrase_records,
        "retained_phrase_records": retained_phrase_records,
        "filtered_out_phrase_records": filtered_out_phrase_records,
        "debug_artifacts": {
            "collect_autocomplete_records": dict(state.get("autocomplete_debug") or {}),
            "collect_related_search_records": dict(state.get("related_debug") or {}),
            "normalize_exact_text": dict(state.get("normalization_debug") or {}),
            "classify_phrase_intent_ai": dict(state.get("intent_debug") or {}),
            "filter_irrelevant_phrases_ai": dict(state.get("filter_debug") or {}),
        },
    }


def build_jobs_summary(limit: int) -> list[dict[str, Any]]:
    recent_runs = get_all_runs(feature=FEATURE_NAME)[:limit]
    jobs: list[dict[str, Any]] = []
    for run in recent_runs:
        run_id = _safe_str(run.get("run_id"))
        ingest_stage = read_stage_result(run_id, "ingest_request") or {}
        resolve_stage = read_stage_result(run_id, "resolve_market_context") or {}
        request_data = (ingest_stage.get("data") or {}).get("request") or {}
        market_context = (resolve_stage.get("data") or {}).get("market_context") or {}
        output = read_output(run_id)
        artifact = output.get("artifact") if isinstance(output, dict) else {}
        artifact = artifact if isinstance(artifact, dict) else {}
        market_profile = _safe_str(
            artifact.get("market_context", {}).get("market_profile")
            if isinstance(artifact.get("market_context"), dict)
            else ""
        ) or _safe_str(market_context.get("market_profile"))
        jobs.append(
            {
                "run_id": run_id,
                "seed": _safe_str(artifact.get("seed")) or _safe_str(request_data.get("seed")),
                "market_profile": market_profile,
                "geo": _safe_str(artifact.get("geo")) or _safe_str(market_context.get("geo")),
                "language": _safe_str(artifact.get("language"))
                or _safe_str(market_context.get("language")),
                "state": _safe_str(run.get("status")),
                "stage": _safe_str(run.get("stage")),
                "updated_at": _safe_str(run.get("updated_at")),
                "raw_phrase_count": len(artifact.get("raw_phrase_records") or artifact.get("raw_phrases") or []),
                "clean_phrase_count": len(
                    artifact.get("retained_phrase_records") or artifact.get("clean_phrases") or []
                ),
                "filtered_out_phrase_count": len(
                    artifact.get("filtered_out_phrase_records")
                    or artifact.get("filtered_out_phrases")
                    or []
                ),
                "group_count": len(artifact.get("groups") or []),
            }
        )
    return jobs


def _run_keyword_intel_pipeline(
    run_id: str,
    validated_request: dict[str, Any],
    resolved_market_context: dict[str, Any],
) -> None:
    provider_client = _build_provider_client()

    def ingest_request_node(state: dict[str, Any]) -> dict[str, Any]:
        request_payload = dict(state.get("request") or {})
        _write_running_status(run_id, "ingest_request")
        _write_stage(run_id, "ingest_request", {"request": request_payload})
        return {"request": request_payload}

    def resolve_market_context_node(state: dict[str, Any]) -> dict[str, Any]:
        market_context = dict(state.get("market_context") or {})
        _write_running_status(run_id, "resolve_market_context")
        _write_stage(run_id, "resolve_market_context", {"market_context": market_context})
        return {"market_context": market_context}

    def collect_autocomplete_records_node(state: dict[str, Any]) -> dict[str, Any]:
        request_payload = dict(state.get("request") or {})
        market_context = dict(state.get("market_context") or {})
        _write_running_status(run_id, "collect_autocomplete_records")
        request_result = _execute_autocomplete_request(
            provider_client,
            keyword=_safe_str(request_payload.get("seed")),
            market_context=market_context,
        )
        suggestions = DataForSEOClient.extract_autocomplete_suggestions(
            request_result.task_payload
        )
        phrase_records = build_autocomplete_phrase_records(
            suggestions,
            seed=_safe_str(request_payload.get("seed")),
            market_context=market_context,
        )
        stage_data = {
            "market_context": market_context,
            "provider_request_context": _provider_request_context(
                market_context,
                request_result,
            ),
            "raw_provider_response": _compact_provider_response(request_result),
            "phrase_records": phrase_records,
            "count": len(phrase_records),
        }
        _write_stage(run_id, "collect_autocomplete_records", stage_data)
        return {
            "autocomplete_records": phrase_records,
            "autocomplete_debug": stage_data,
        }

    def collect_related_search_records_node(state: dict[str, Any]) -> dict[str, Any]:
        request_payload = dict(state.get("request") or {})
        market_context = dict(state.get("market_context") or {})
        _write_running_status(run_id, "collect_related_search_records")
        request_result = _execute_organic_request(
            provider_client,
            keyword=_safe_str(request_payload.get("seed")),
            market_context=market_context,
        )
        organic_items = DataForSEOClient.extract_organic_items(request_result.task_payload)
        phrase_records = build_related_phrase_records(
            organic_items,
            seed=_safe_str(request_payload.get("seed")),
            market_context=market_context,
        )
        stage_data = {
            "market_context": market_context,
            "provider_request_context": _provider_request_context(
                market_context,
                request_result,
            ),
            "raw_provider_response": _compact_provider_response(request_result),
            "phrase_records": phrase_records,
            "count": len(phrase_records),
        }
        _write_stage(run_id, "collect_related_search_records", stage_data)
        return {
            "related_search_records": phrase_records,
            "related_debug": stage_data,
        }

    def combine_raw_phrase_pool_node(state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "combine_raw_phrase_pool")
        raw_phrase_records = list(state.get("autocomplete_records") or []) + list(
            state.get("related_search_records") or []
        )
        raw_phrases = [_provider_text(record.get("text")) for record in raw_phrase_records]
        _write_stage(
            run_id,
            "combine_raw_phrase_pool",
            {
                "raw_phrase_count": len(raw_phrase_records),
                "raw_phrases": raw_phrases,
                "phrase_ids": [record.get("phrase_id") for record in raw_phrase_records],
            },
        )
        return {
            "raw_phrase_records": raw_phrase_records,
            "raw_phrases": raw_phrases,
        }

    def normalize_exact_text_node(state: dict[str, Any]) -> dict[str, Any]:
        request_payload = dict(state.get("request") or {})
        _write_running_status(run_id, "normalize_exact_text")
        normalized_records, dropped_records = normalize_phrase_records(
            list(state.get("raw_phrase_records") or []),
            seed=_safe_str(request_payload.get("seed")),
        )
        stage_data = {
            "normalized_phrase_records": normalized_records,
            "dropped_records": dropped_records,
            "count": len(normalized_records),
        }
        _write_stage(run_id, "normalize_exact_text", stage_data)
        return {
            "normalized_phrase_records": normalized_records,
            "normalization_debug": stage_data,
        }

    def classify_phrase_intent_ai_node(state: dict[str, Any]) -> dict[str, Any]:
        request_payload = dict(state.get("request") or {})
        market_context = dict(state.get("market_context") or {})
        _write_running_status(run_id, "classify_phrase_intent_ai")
        seed_intent_profile, classified_records = classify_phrase_intent_with_ai(
            seed=_safe_str(request_payload.get("seed")),
            market_context=market_context,
            normalized_phrase_records=list(state.get("normalized_phrase_records") or []),
        )
        stage_data = {
            "seed_intent_profile": seed_intent_profile,
            "classified_phrase_records": classified_records,
            "count": len(classified_records),
        }
        _write_stage(run_id, "classify_phrase_intent_ai", stage_data)
        return {
            "seed_intent_profile": seed_intent_profile,
            "classified_phrase_records": classified_records,
            "intent_debug": stage_data,
        }

    def filter_irrelevant_phrases_ai_node(state: dict[str, Any]) -> dict[str, Any]:
        request_payload = dict(state.get("request") or {})
        market_context = dict(state.get("market_context") or {})
        _write_running_status(run_id, "filter_irrelevant_phrases_ai")
        retained_records, filtered_records = filter_irrelevant_phrases_with_ai(
            seed=_safe_str(request_payload.get("seed")),
            market_context=market_context,
            seed_intent_profile=dict(state.get("seed_intent_profile") or {}),
            classified_phrase_records=list(state.get("classified_phrase_records") or []),
        )
        stage_data = {
            "seed_intent_profile": dict(state.get("seed_intent_profile") or {}),
            "retained_phrase_records": retained_records,
            "filtered_out_phrase_records": filtered_records,
            "retained_count": len(retained_records),
            "filtered_count": len(filtered_records),
        }
        _write_stage(run_id, "filter_irrelevant_phrases_ai", stage_data)
        return {
            "retained_phrase_records": retained_records,
            "filtered_out_phrase_records": filtered_records,
            "filter_debug": stage_data,
        }

    def semantic_group_phrases_ai_node(state: dict[str, Any]) -> dict[str, Any]:
        request_payload = dict(state.get("request") or {})
        market_context = dict(state.get("market_context") or {})
        _write_running_status(run_id, "semantic_group_phrases_ai")
        groups = semantic_group_phrases_with_ai(
            seed=_safe_str(request_payload.get("seed")),
            market_context=market_context,
            retained_phrase_records=list(state.get("retained_phrase_records") or []),
        )
        _write_stage(run_id, "semantic_group_phrases_ai", {"groups": groups})
        return {"groups": groups}

    def label_groups_ai_node(state: dict[str, Any]) -> dict[str, Any]:
        request_payload = dict(state.get("request") or {})
        market_context = dict(state.get("market_context") or {})
        _write_running_status(run_id, "label_groups_ai")
        labeled_groups = label_groups_with_ai(
            seed=_safe_str(request_payload.get("seed")),
            language=_safe_str(market_context.get("language")),
            market_context=market_context,
            groups=list(state.get("groups") or []),
            retained_phrase_records=list(state.get("retained_phrase_records") or []),
        )
        _write_stage(run_id, "label_groups_ai", {"groups": labeled_groups})
        return {"groups": labeled_groups}

    def extract_pattern_summary_node(state: dict[str, Any]) -> dict[str, Any]:
        request_payload = dict(state.get("request") or {})
        _write_running_status(run_id, "extract_pattern_summary")
        pattern_summary = extract_pattern_summary(
            seed=_safe_str(request_payload.get("seed")),
            retained_phrase_records=list(state.get("retained_phrase_records") or []),
        )
        _write_stage(run_id, "extract_pattern_summary", pattern_summary)
        return {"pattern_summary": pattern_summary}

    def score_groups_node(state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "score_groups")
        scored_groups = score_groups(
            groups=list(state.get("groups") or []),
            retained_phrase_records=list(state.get("retained_phrase_records") or []),
            pattern_summary=dict(state.get("pattern_summary") or {}),
        )
        _write_stage(run_id, "score_groups", {"groups": scored_groups})
        return {"scored_groups": scored_groups}

    def persist_results_node(state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "persist_results")
        artifact = _build_final_artifact(state)
        artifact_ref = write_artifact(run_id, {"markdown": "", **artifact})
        _write_stage(
            run_id,
            "persist_results",
            {
                "artifact_ref": artifact_ref,
                "artifact": artifact,
            },
        )
        return {"artifact": artifact, "artifact_ref": artifact_ref}

    def finalize_response_node(state: dict[str, Any]) -> dict[str, Any]:
        _write_running_status(run_id, "finalize_response")
        _write_stage(
            run_id,
            "finalize_response",
            {
                "artifact_ref": _safe_str(state.get("artifact_ref")),
                "completed": True,
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
        run_keyword_intel_graph(
            run_id=run_id,
            initial_state={
                "request": dict(validated_request),
                "market_context": dict(resolved_market_context),
            },
            node_builders=[
                ("ingest_request", ingest_request_node),
                ("resolve_market_context", resolve_market_context_node),
                ("collect_autocomplete_records", collect_autocomplete_records_node),
                ("collect_related_search_records", collect_related_search_records_node),
                ("combine_raw_phrase_pool", combine_raw_phrase_pool_node),
                ("normalize_exact_text", normalize_exact_text_node),
                ("classify_phrase_intent_ai", classify_phrase_intent_ai_node),
                ("filter_irrelevant_phrases_ai", filter_irrelevant_phrases_ai_node),
                ("semantic_group_phrases_ai", semantic_group_phrases_ai_node),
                ("label_groups_ai", label_groups_ai_node),
                ("extract_pattern_summary", extract_pattern_summary_node),
                ("score_groups", score_groups_node),
                ("persist_results", persist_results_node),
                ("finalize_response", finalize_response_node),
            ],
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Keyword-intel pipeline failed")
        _write_failed_status(run_id, exc)


@router.post("/run")
async def start_run(
    request: KeywordIntelRunRequest,
    background_tasks: BackgroundTasks,
) -> JSONResponse:
    """Queue a keyword-intel pipeline run."""
    validated_request = _validate_request(request)
    market_context = resolve_market_context(validated_request)
    request_payload = validated_request.to_dict()
    market_context_payload = market_context.to_dict()
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
    _write_stage(run_id, "ingest_request", {"request": request_payload})
    _write_stage(run_id, "resolve_market_context", {"market_context": market_context_payload})

    background_tasks.add_task(
        _run_keyword_intel_pipeline,
        run_id,
        request_payload,
        market_context_payload,
    )

    return JSONResponse(
        {
            "message": "Keyword-intel run queued",
            "run_id": run_id,
        }
    )


@router.get("/status/{run_id}")
async def get_status(run_id: str) -> JSONResponse:
    """Get status for a keyword-intel pipeline run."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")
    return JSONResponse(status)


@router.get("/result/{run_id}")
async def get_result(run_id: str) -> JSONResponse:
    """Get the final keyword-intel result artifact."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    output = read_output(run_id)
    if not output:
        raise HTTPException(status_code=404, detail="Result not available yet.")

    return JSONResponse(
        {
            "run_id": run_id,
            "artifact": output.get("artifact") or {},
        }
    )


@router.get("/jobs")
async def get_jobs(
    limit: int = Query(default=20, ge=1, le=MAX_JOBS_LIMIT),
) -> JSONResponse:
    """List recent keyword-intel runs for the UI history panel."""
    return JSONResponse(build_jobs_summary(limit))
