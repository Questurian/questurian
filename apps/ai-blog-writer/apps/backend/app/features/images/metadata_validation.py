"""Image variant and metadata validation."""

import json
import re
from collections import Counter
from typing import List, Optional

from .errors import _raise_http_error
from .image_processor import ImageVariantType, VARIANT_SPECS


REQUIRED_VARIANT_TYPES = tuple(variant.value for variant in ImageVariantType)
VARIANT_DIMENSIONS = {
    variant.value: (spec.width, spec.height) for variant, spec in VARIANT_SPECS.items()
}
UPLOAD_ORDER = list(REQUIRED_VARIANT_TYPES)


def _validate_variant_types(variant_types: List[str]) -> None:
    """Validate that each required variant type appears exactly once."""
    counts = Counter(variant_types)
    required = set(REQUIRED_VARIANT_TYPES)
    provided = set(variant_types)
    invalid_types = sorted(provided - required)
    missing_types = sorted(required - provided)
    duplicate_types = sorted(
        (variant_type for variant_type, count in counts.items() if count > 1)
    )
    if invalid_types or missing_types or duplicate_types:
        _raise_http_error(
            status_code=400,
            message='variant_types must include each required variant exactly once',
            step='validate_variant_types',
            required_types=list(REQUIRED_VARIANT_TYPES),
            invalid_types=invalid_types,
            missing_types=missing_types,
            duplicate_types=duplicate_types,
        )


def _normalize_tag_name(name: str) -> str:
    """Normalize user input to a valid Payload tag name (kebab-case)."""
    normalized = name.lower().strip()
    normalized = re.sub('[^a-z0-9]+', '-', normalized)
    return normalized.strip('-')


def _validate_location_ref(location_ref: int) -> Optional[int]:
    """Validate location reference for image metadata. Returns None when 0 (no location)."""
    if location_ref < 0:
        _raise_http_error(
            status_code=400,
            message='location_ref must be a non-negative integer (0 = no location)',
            step='validate_location_ref',
            location_ref=location_ref,
        )
    return location_ref if location_ref > 0 else None


def _parse_tag_ids(tags_json: Optional[str]) -> List[int]:
    """Parse JSON-encoded list of tag IDs. Returns empty list on None or parse failure."""
    if not tags_json:
        return []
    try:
        parsed = json.loads(tags_json)
    except (json.JSONDecodeError, ValueError):
        _raise_http_error(
            status_code=400,
            message='tags must be a JSON-encoded list of integer IDs',
            step='parse_tag_ids',
            tags=tags_json,
        )
    if not isinstance(parsed, list):
        _raise_http_error(
            status_code=400, message='tags must be a JSON array', step='parse_tag_ids'
        )
    result = []
    for item in parsed:
        if isinstance(item, int) and item > 0:
            result.append(item)
        elif isinstance(item, float) and item.is_integer() and (item > 0):
            result.append(int(item))
        else:
            _raise_http_error(
                status_code=400,
                message='Each tag ID must be a positive integer',
                step='parse_tag_ids',
                invalid_value=item,
            )
    return result


def _validate_photographer_credit(photographer_credit: str) -> str:
    """Ensure uploads always include photographer attribution."""
    normalized_credit = photographer_credit.strip()
    if not normalized_credit:
        _raise_http_error(
            status_code=400,
            message='photographer_credit is required',
            step='validate_photographer_credit',
        )
    return normalized_credit


def _validate_alt_text(alt_text: str) -> str:
    """Ensure uploads provide non-empty alt text."""
    normalized_alt_text = alt_text.strip()
    if not normalized_alt_text:
        _raise_http_error(
            status_code=400, message='alt_text is required', step='validate_alt_text'
        )
    return normalized_alt_text
