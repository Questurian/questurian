"""Structured HTTP error construction and provider status mapping."""

from typing import Any, Dict

from fastapi import HTTPException

from .bfl_client import BflApiError
from .payload_client import PayloadUploadError


def _build_error_detail(message: str, **context: Any) -> Dict[str, Any]:
    """Build structured API error details while omitting empty values."""
    detail: Dict[str, Any] = {'message': message}
    for key, value in context.items():
        if value is None:
            continue
        if isinstance(value, (str, list, dict)) and (not value):
            continue
        detail[key] = value
    return detail


def _raise_http_error(status_code: int, message: str, **context: Any) -> None:
    """Raise a FastAPI HTTPException with structured error context."""
    raise HTTPException(
        status_code=status_code, detail=_build_error_detail(message, **context)
    )


def _status_from_payload_error(error: PayloadUploadError) -> int:
    """Map Payload-specific errors into API response status codes."""
    if error.status_code in {401, 403}:
        return error.status_code
    if 400 <= error.status_code < 500:
        return 400
    if error.status_code >= 500:
        return 502
    detail_text = f'{error.detail} {error}'.lower()
    if 'timed out' in detail_text:
        return 504
    return 503


def _status_from_bfl_error(error: BflApiError) -> int:
    """Map BFL-specific errors into API response status codes."""
    if error.status_code in {400, 402, 403, 422, 429, 500, 503, 504}:
        return error.status_code
    if 400 <= error.status_code < 500:
        return error.status_code
    if error.status_code >= 500:
        return 502
    return 502
