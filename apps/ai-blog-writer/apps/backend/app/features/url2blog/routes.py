"""
URL2Blog API routes.

All routes are prefixed with /url2blog in the main router.
"""
import json
import logging
import re
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from utils import get_vertex_llm

router = APIRouter(prefix="/url2blog", tags=["url2blog"])
logger = logging.getLogger(__name__)

EXTRACT_PROMPT = """You are a content extraction assistant.

Given the raw text content scraped from a web article, extract:
1. The article title
2. The main article content (body text only, no ads, navigation, footers, sidebars, or boilerplate)
3. The language the article is written in

Return ONLY valid JSON in this exact format:
{
  "title": "The article title here",
  "content": "The full article body text here, preserving paragraphs with newlines",
  "language": "English"
}

Rules:
- Extract the actual article title, not the site name
- For content, include only the main article body
- Preserve paragraph breaks as newlines
- Remove any ads, navigation, cookie notices, author bios, related articles, etc.
- If you cannot find a clear article, set title to "" and content to the main text you can find
- For language, return the full language name (e.g. "English", "Spanish", "French", "Japanese", "Portuguese") not a code
- Output ONLY the JSON object, no other text

RAW PAGE TEXT:
"""


class ExtractRequest(BaseModel):
    url: str


def _strip_html(html: str) -> str:
    """Strip HTML tags and decode entities to get raw text."""
    # Remove script and style blocks entirely
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    # Remove HTML tags
    text = re.sub(r"<[^>]+>", " ", text)
    # Decode common HTML entities
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = text.replace("&quot;", '"')
    text = text.replace("&#39;", "'")
    text = text.replace("&nbsp;", " ")
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text)
    # Restore some paragraph breaks at block boundaries
    text = re.sub(r"\s{2,}", "\n\n", text)
    return text.strip()


def _extract_json_from_response(raw_text: str) -> tuple[dict[str, Any] | None, str | None]:
    """Parse JSON from LLM response, handling markdown code blocks."""
    if not raw_text:
        return None, "Empty response"

    # Try to extract from markdown code block
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", raw_text, re.DOTALL)
    cleaned = match.group(1).strip() if match else raw_text.strip()

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed, None
        return None, "Expected a JSON object"
    except json.JSONDecodeError as exc:
        # Try to find JSON object in the text
        obj_start = cleaned.find("{")
        obj_end = cleaned.rfind("}")
        if obj_start != -1 and obj_end > obj_start:
            try:
                parsed = json.loads(cleaned[obj_start:obj_end + 1])
                if isinstance(parsed, dict):
                    return parsed, None
            except json.JSONDecodeError:
                pass
        return None, str(exc)


@router.post("/extract")
async def extract_article(request: ExtractRequest) -> JSONResponse:
    """
    Fetch an article URL and extract title + content using Gemini.

    Accepts: { "url": "https://example.com/article" }
    Returns: { "title": "...", "content": "...", "raw_response": "...", "source_url": "..." }
    """
    url = request.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

    # Fetch the page
    logger.info("URL2Blog: fetching %s", url)
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=30.0,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; Questurian/1.0)",
                "Accept": "text/html,application/xhtml+xml",
            },
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch URL (HTTP {exc.response.status_code})",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch URL: {exc}",
        ) from exc

    raw_html = resp.text
    raw_text = _strip_html(raw_html)

    if not raw_text or len(raw_text) < 50:
        raise HTTPException(
            status_code=422,
            detail="Page returned too little text content to extract an article.",
        )

    # Truncate very long pages to avoid token limits
    max_chars = 60_000
    if len(raw_text) > max_chars:
        raw_text = raw_text[:max_chars]

    # Send to Gemini for extraction
    llm = get_vertex_llm(
        temperature=0.1,
        max_tokens=4096,
        model_name="gemini-2.0-flash",
    )
    prompt = EXTRACT_PROMPT + raw_text

    logger.info("URL2Blog Stage 1: sending prompt to Gemini (%d chars)", len(raw_text))
    result = llm.invoke(prompt)

    if not result or not result.strip():
        raise HTTPException(status_code=500, detail="LLM returned an empty response.")

    raw_response = result.strip()
    parsed, parse_error = _extract_json_from_response(raw_response)

    return JSONResponse({
        "message": "URL2Blog extraction completed",
        "source_url": url,
        "raw_text_length": len(raw_text),
        "raw_response": raw_response,
        "parsed": parsed,
        "parse_error": parse_error,
    })
