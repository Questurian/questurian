"""Google Search grounding helpers for Gemini models on Vertex AI."""

from __future__ import annotations

from dataclasses import dataclass
import logging
import os
import re
from typing import Any

try:
    import google.auth as google_auth
    from google.auth.transport.requests import AuthorizedSession
except Exception:  # pragma: no cover - optional runtime dependency
    google_auth = None
    AuthorizedSession = None

logger = logging.getLogger(__name__)

DEFAULT_LOCATION = "us-central1"
DEFAULT_DYNAMIC_THRESHOLD = 0.35
DEFAULT_AUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform"
DEFAULT_REQUEST_TIMEOUT_SECONDS = 60

_grounding_session: Any | None = None
_grounding_location: str | None = None
_grounding_project: str | None = None


@dataclass(frozen=True)
class GroundedGenerationResult:
    text: str
    source_urls: list[str]
    model_name: str


def _safe_text(value: Any) -> str:
    if isinstance(value, dict):
        return _extract_text_from_response_dict(value)
    if isinstance(value, str):
        return value.strip()
    content = getattr(value, "text", None)
    if isinstance(content, str):
        return content.strip()
    return ""


def _extract_text_from_response_dict(response_dict: dict[str, Any]) -> str:
    candidates = response_dict.get("candidates", [])
    if not isinstance(candidates, list):
        return ""

    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content", {})
        if not isinstance(content, dict):
            continue
        parts = content.get("parts", [])
        if not isinstance(parts, list):
            continue

        text_parts = [
            part.get("text", "").strip()
            for part in parts
            if isinstance(part, dict) and isinstance(part.get("text"), str) and part.get("text", "").strip()
        ]
        if text_parts:
            return "\n".join(text_parts).strip()

    return ""


def _resolve_grounding_context(location: str | None = None) -> tuple[str, str] | None:
    project = os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
    if not project:
        return None

    resolved_location = (location or os.getenv("GOOGLE_CLOUD_LOCATION", DEFAULT_LOCATION)).strip()
    if not resolved_location:
        resolved_location = DEFAULT_LOCATION

    return project, resolved_location


def _get_authorized_grounding_session(
    location: str | None = None,
) -> tuple[Any | None, str | None, str | None]:
    global _grounding_session
    global _grounding_location
    global _grounding_project

    if google_auth is None or AuthorizedSession is None:
        return None, None, None

    resolved_context = _resolve_grounding_context(location)
    if resolved_context is None:
        return None, None, None
    project, resolved_location = resolved_context

    if _grounding_session is not None and _grounding_project == project and _grounding_location == resolved_location:
        return _grounding_session, project, resolved_location

    try:
        credentials, _ = google_auth.default(scopes=[DEFAULT_AUTH_SCOPE])
        _grounding_session = AuthorizedSession(credentials)
    except Exception:  # pragma: no cover - network/runtime dependent
        logger.warning("Failed to initialize Google auth for grounding", exc_info=True)
        return None, None, None

    _grounding_project = project
    _grounding_location = resolved_location
    return _grounding_session, project, resolved_location


def _extract_urls_from_nested(value: Any) -> list[str]:
    collected: list[str] = []

    if isinstance(value, dict):
        for nested in value.values():
            collected.extend(_extract_urls_from_nested(nested))
        return collected

    if isinstance(value, list):
        for nested in value:
            collected.extend(_extract_urls_from_nested(nested))
        return collected

    if isinstance(value, str):
        candidates = re.findall(r"https?://[^\s\"'<>]+", value)
        for candidate in candidates:
            cleaned = candidate.rstrip(".,);]")
            if cleaned:
                collected.append(cleaned)
    return collected


def extract_grounded_urls_from_response(response: Any, max_urls: int = 12) -> list[str]:
    if response is None:
        return []

    urls: list[str] = []
    seen: set[str] = set()

    try:
        response_dict = response if isinstance(response, dict) else response.to_dict()
        for url in _extract_urls_from_nested(response_dict.get("candidates", [])):
            if url in seen:
                continue
            seen.add(url)
            urls.append(url)
            if len(urls) >= max_urls:
                return urls
    except Exception:
        pass

    try:
        candidates = getattr(response, "candidates", []) or []
        for candidate in candidates:
            candidate_dict = candidate.to_dict() if hasattr(candidate, "to_dict") else {}
            for url in _extract_urls_from_nested(candidate_dict.get("grounding_metadata", {})):
                if url in seen:
                    continue
                seen.add(url)
                urls.append(url)
                if len(urls) >= max_urls:
                    return urls
    except Exception:
        pass

    return urls


def _build_generate_content_url(
    *,
    project: str,
    location: str,
    model_name: str,
) -> str:
    return (
        f"https://{location}-aiplatform.googleapis.com/v1/"
        f"projects/{project}/locations/{location}/publishers/google/models/{model_name}:generateContent"
    )


def _generate_with_google_search(
    *,
    prompt: str,
    model_name: str,
    max_tokens: int,
    temperature: float,
) -> dict[str, Any] | None:
    session, project, location = _get_authorized_grounding_session()
    if session is None or not project or not location:
        return None

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "tools": [{"googleSearch": {}}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    url = _build_generate_content_url(
        project=project,
        location=location,
        model_name=model_name,
    )

    try:
        response = session.post(
            url,
            json=payload,
            timeout=DEFAULT_REQUEST_TIMEOUT_SECONDS,
        )
    except Exception:  # pragma: no cover - network/runtime dependent
        logger.warning(
            "Grounded Gemini REST generation failed",
            extra={"model_name": model_name},
            exc_info=True,
        )
        return None

    if not response.ok:
        logger.warning(
            "Grounded Gemini REST generation returned non-OK status",
            extra={
                "model_name": model_name,
                "status_code": response.status_code,
                "response_excerpt": response.text[:500],
            },
        )
        return None

    try:
        response_json = response.json()
    except Exception:  # pragma: no cover - malformed upstream response
        logger.warning(
            "Grounded Gemini REST response could not be parsed as JSON",
            extra={"model_name": model_name},
            exc_info=True,
        )
        return None

    return response_json


def invoke_google_grounded_text(
    prompt: str,
    *,
    model_name: str,
    fallback_model_name: str | None = None,
    max_tokens: int = 1024,
    temperature: float = 0.05,
    dynamic_threshold: float = DEFAULT_DYNAMIC_THRESHOLD,
) -> GroundedGenerationResult | None:
    del dynamic_threshold

    strict_prompt = prompt.strip()

    def _generate_with_model(resolved_model_name: str) -> dict[str, Any] | None:
        return _generate_with_google_search(
            prompt=strict_prompt,
            model_name=resolved_model_name,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    response = _generate_with_model(model_name)
    effective_model_name = model_name

    if response is None and fallback_model_name and fallback_model_name != model_name:
        response = _generate_with_model(fallback_model_name)
        effective_model_name = fallback_model_name

    if response is None:
        return None

    return GroundedGenerationResult(
        text=_safe_text(response),
        source_urls=extract_grounded_urls_from_response(response),
        model_name=response.get("modelVersion", effective_model_name),
    )
