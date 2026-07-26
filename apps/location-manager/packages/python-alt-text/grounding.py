"""Grounded response parsing and URL validation."""

import json


def is_valid_http_url(value: object) -> bool:
    if not isinstance(value, str):
        return False
    trimmed = value.strip()
    return trimmed.startswith("http://") or trimmed.startswith("https://")


def parse_json_object(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").strip()
        cleaned = cleaned.removesuffix("```").strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("Model did not return a JSON object.")
    parsed = json.loads(cleaned[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("Model JSON response must be an object.")
    return parsed


def extract_grounding_sources(response) -> list[dict]:
    sources: list[dict] = []
    for candidate in getattr(response, "candidates", []) or []:
        metadata = getattr(candidate, "grounding_metadata", None)
        if not metadata:
            continue
        chunks = list(getattr(metadata, "grounding_chunks", []) or [])
        snippets_by_chunk: dict[int, str] = {}
        for support in getattr(metadata, "grounding_supports", []) or []:
            segment = getattr(support, "segment", None)
            text = (getattr(segment, "text", "") or "").strip()
            if not text:
                continue
            for chunk_index in getattr(support, "grounding_chunk_indices", []) or []:
                snippets_by_chunk.setdefault(chunk_index, text)
        for i, chunk in enumerate(chunks):
            web = getattr(chunk, "web", None)
            if not web:
                continue
            url = (getattr(web, "uri", "") or "").strip()
            title = (getattr(web, "title", "") or "").strip()
            if not url and (not title):
                continue
            entry: dict = {"label": title or url, "url": url}
            snippet = snippets_by_chunk.get(i, "").strip()
            if snippet:
                entry["snippet"] = snippet
            sources.append(entry)
    return sources[:5]


def merge_grounded_snippets(parsed: dict, response) -> dict:
    grounded = extract_grounding_sources(response)
    model_sources = (
        parsed.get("sources") if isinstance(parsed.get("sources"), list) else None
    )
    if not model_sources:
        parsed["sources"] = grounded
        return parsed
    snippets_by_url = {
        source["url"]: source.get("snippet", "")
        for source in grounded
        if source.get("url")
    }
    enriched: list[dict] = []
    for source in model_sources:
        if not isinstance(source, dict):
            continue
        url = (source.get("url") or "").strip()
        snippet = (source.get("snippet") or "").strip()
        if not snippet and url and snippets_by_url.get(url):
            source = {**source, "snippet": snippets_by_url[url]}
        enriched.append(source)
    parsed["sources"] = enriched
    return parsed
