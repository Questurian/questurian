"""
Robust JSON parsing utilities for LLM responses.

LLMs often return JSON wrapped in markdown code blocks or with
truncation issues. This module provides utilities to handle these cases.
"""
import json
import logging
import re
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def parse_json_response(
    response: str,
    raise_on_error: bool = True,
    default: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Parse JSON from an LLM response with multiple fallback strategies.

    Handles:
    1. Complete markdown code blocks (```json ... ```)
    2. Truncated markdown blocks (```json ... without closing ```)
    3. Raw JSON objects in text
    4. Truncated JSON (missing closing braces/quotes)

    Args:
        response: Raw LLM response text
        raise_on_error: If True, raises RuntimeError on parse failure.
                       If False, returns default value.
        default: Default value to return if parsing fails and raise_on_error=False

    Returns:
        Parsed JSON as a dictionary

    Raises:
        RuntimeError: If JSON parsing fails and raise_on_error=True
    """
    if not response or not response.strip():
        if raise_on_error:
            raise RuntimeError("Cannot parse JSON from empty response")
        return default or {}

    result_text = response.strip()
    original_text = result_text  # Keep original for error messages

    # Strategy 1: Extract from complete markdown code block
    json_match = re.search(r"```(?:json)?\s*(.*?)\s*```", result_text, re.DOTALL)
    if json_match:
        result_text = json_match.group(1).strip()
        logger.debug("Extracted JSON from complete markdown code block")
    else:
        # Strategy 2: Handle truncated markdown block (no closing ```)
        truncated_match = re.search(r"```(?:json)?\s*(\{.*)", result_text, re.DOTALL)
        if truncated_match:
            result_text = truncated_match.group(1).strip()
            logger.debug("Extracted JSON from truncated markdown block")
        # Strategy 3: Find raw JSON object
        elif not result_text.startswith("{"):
            json_obj_match = re.search(r"\{.*", result_text, re.DOTALL)
            if json_obj_match:
                result_text = json_obj_match.group(0).strip()
                logger.debug("Extracted JSON object from response")

    # Validate we have something that looks like JSON
    if not result_text or not result_text.startswith("{"):
        error_msg = f"No JSON found in LLM response: {original_text[:300]}..."
        if raise_on_error:
            raise RuntimeError(error_msg)
        logger.warning(error_msg)
        return default or {}

    # Try direct parsing
    try:
        return json.loads(result_text)
    except json.JSONDecodeError as e:
        logger.debug(f"Initial JSON parse failed: {e}")

        # Strategy 4: Try to fix truncated JSON by adding missing closing braces
        fixed_result = _try_fix_truncated_json(result_text)
        if fixed_result is not None:
            return fixed_result

        # All strategies failed
        error_msg = f"JSON parse failed: {e}. Response: {result_text[:300]}..."
        if raise_on_error:
            raise RuntimeError(error_msg) from e
        logger.warning(error_msg)
        return default or {}


def _try_fix_truncated_json(text: str) -> Optional[Dict[str, Any]]:
    """
    Attempt to fix truncated JSON by adding missing closing braces/quotes.

    Args:
        text: Potentially truncated JSON string

    Returns:
        Parsed JSON dict if fix was successful, None otherwise
    """
    open_braces = text.count("{")
    close_braces = text.count("}")

    if open_braces <= close_braces:
        return None

    # Try adding closing braces and quotes
    fixed_text = text.rstrip()

    # If ends mid-string, close the string
    if fixed_text.count('"') % 2 == 1:
        fixed_text += '"'

    # Add missing closing braces
    missing_braces = open_braces - close_braces
    fixed_text += "}" * missing_braces

    logger.debug(f"Attempting to fix truncated JSON (added {missing_braces} braces)")

    try:
        result = json.loads(fixed_text)
        logger.debug("Successfully parsed fixed JSON")
        return result
    except json.JSONDecodeError:
        logger.debug("Failed to parse fixed JSON")
        return None


def extract_json_field(
    response: str,
    field: str,
    default: Any = None,
) -> Any:
    """
    Extract a specific field from a JSON response.

    Convenience function that combines parsing with field extraction.

    Args:
        response: Raw LLM response text
        field: Field name to extract
        default: Default value if field not found or parsing fails

    Returns:
        The field value or default
    """
    try:
        parsed = parse_json_response(response, raise_on_error=False, default={})
        return parsed.get(field, default)
    except Exception:
        return default


def validate_json_structure(
    data: Dict[str, Any],
    required_fields: list[str],
) -> tuple[bool, list[str]]:
    """
    Validate that a parsed JSON dict contains required fields.

    Args:
        data: Parsed JSON dictionary
        required_fields: List of field names that must be present

    Returns:
        Tuple of (is_valid, missing_fields)
    """
    missing = [field for field in required_fields if field not in data]
    return len(missing) == 0, missing
