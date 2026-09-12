"""Google Search grounding helpers for Gemini models on Vertex AI."""

from __future__ import annotations

from dataclasses import dataclass, field
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
    # Where the answer actually came from, by name. Every `source_urls` entry
    # is a Google redirect that identifies nothing; the publication is in the
    # grounding chunk's `title` beside it. Default empty so a caller built
    # before this existed still constructs.
    source_titles: list[str] = field(default_factory=list)
    # What the call cost, straight off the response. Without this a grounded
    # call is invisible to any caller that meters spend: this path is raw REST,
    # so it never passes through the LangChain adapters the token ledger
    # watches. Prompt2Blog v4 puts grounded search on every run, and a per-run
    # ceiling that cannot see the most expensive stage is not a ceiling.
    #
    # None means the response carried no usage block, which is not the same as
    # zero -- a caller must be able to tell "cost nothing" from "cost unknown".
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    reasoning_tokens: int | None = None
    cached_input_tokens: int | None = None
    # What the provider says it actually searched, from
    # `groundingMetadata.webSearchQueries`. Distinct from anything the caller
    # asked for: a prompt naming four search directions is an instruction, and
    # this is the only evidence about what was really run. Empty means the
    # response did not say, which is not the same as "it searched nothing".
    search_queries: list[str] = field(default_factory=list)


def _usage_counts(response: Any) -> tuple[int | None, int | None, int | None]:
    """Read `usageMetadata` off a generateContent response."""
    if not isinstance(response, dict):
        return None, None, None
    usage = response.get("usageMetadata")
    if not isinstance(usage, dict):
        return None, None, None

    def _count(key: str) -> int | None:
        value = usage.get(key)
        return value if isinstance(value, int) and value >= 0 else None

    return (
        _count("promptTokenCount"),
        _count("candidatesTokenCount"),
        _count("totalTokenCount"),
    )


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


def extract_grounded_search_queries(response: Any, max_queries: int = 24) -> list[str]:
    """The searches the provider reports having run.

    Read off `groundingMetadata.webSearchQueries`, wherever the response
    happens to nest it -- the REST and SDK shapes differ, and both spell it
    with and without the underscore.

    Kept separate from whatever the prompt asked for. A caller that prints its
    own requested directions as though the provider had run them is claiming
    coverage nobody proved, and this is the field that makes the honest version
    possible.
    """
    if response is None:
        return []

    found: list[str] = []
    seen: set[str] = set()

    def walk(value: Any) -> None:
        if len(found) >= max_queries:
            return
        if isinstance(value, dict):
            for key in ("webSearchQueries", "web_search_queries"):
                queries = value.get(key)
                if isinstance(queries, list):
                    for query in queries:
                        text = str(query).strip()
                        if text and text not in seen:
                            seen.add(text)
                            found.append(text)
            for nested in value.values():
                walk(nested)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(response)
    return found[:max_queries]


def extract_grounded_source_titles(response: Any, max_titles: int = 24) -> list[str]:
    """The publications behind a grounded answer, as their own names.

    Google returns every citation as a `vertexaisearch.cloud.google.com`
    redirect, so the URLs a caller stores say nothing about where the answer
    came from. The domain lives in a sibling `title` on the same grounding
    chunk, and it was being discarded.

    That mattered the first time someone asked whether a search written to run
    in the local language actually reached local sources. Nothing stored could
    answer it: seventy-seven redirect URLs and no publication named among them.
    """
    if response is None:
        return []

    titles: list[str] = []
    seen: set[str] = set()

    def walk(value: Any) -> None:
        if len(titles) >= max_titles:
            return
        if isinstance(value, dict):
            # A grounding chunk is `{"web": {"uri": ..., "title": ...}}`, and
            # `retrievedContext` carries the same pair. Matched on the shape
            # rather than on a fixed path, because the REST and SDK responses
            # nest them differently.
            for key in ("web", "retrievedContext"):
                nested = value.get(key)
                if isinstance(nested, dict):
                    title = nested.get("title")
                    if isinstance(title, str) and title.strip():
                        cleaned = title.strip()
                        if cleaned not in seen:
                            seen.add(cleaned)
                            titles.append(cleaned)
            for nested in value.values():
                walk(nested)
            return
        if isinstance(value, list):
            for nested in value:
                walk(nested)

    try:
        walk(response if isinstance(response, dict) else response.to_dict())
    except Exception:
        pass
    return titles[:max_titles]


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
    timeout_seconds: int = DEFAULT_REQUEST_TIMEOUT_SECONDS,
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
            timeout=timeout_seconds,
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
    # Raised by callers whose searches are long. A listicle angle asks for a
    # dozen named places with evidence for each, and the default 60s cut one
    # of seven searches off entirely -- a whole angle missing from the list,
    # reported as an empty result rather than as a timeout.
    timeout_seconds: int = DEFAULT_REQUEST_TIMEOUT_SECONDS,
) -> GroundedGenerationResult | None:
    del dynamic_threshold

    strict_prompt = prompt.strip()

    def _generate_with_model(resolved_model_name: str) -> dict[str, Any] | None:
        return _generate_with_google_search(
            prompt=strict_prompt,
            model_name=resolved_model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout_seconds=timeout_seconds,
        )

    response = _generate_with_model(model_name)
    effective_model_name = model_name

    if response is None and fallback_model_name and fallback_model_name != model_name:
        response = _generate_with_model(fallback_model_name)
        effective_model_name = fallback_model_name

    if response is None:
        return None

    input_tokens, output_tokens, total_tokens = _usage_counts(response)
    return GroundedGenerationResult(
        text=_safe_text(response),
        source_urls=extract_grounded_urls_from_response(response),
        source_titles=extract_grounded_source_titles(response),
        search_queries=extract_grounded_search_queries(response),
        model_name=response.get("modelVersion", effective_model_name),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        reasoning_tokens=response.get("usageMetadata", {}).get("thoughtsTokenCount"),
        cached_input_tokens=response.get("usageMetadata", {}).get("cachedContentTokenCount"),
    )
