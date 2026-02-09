"""
URL2Blog API routes.

All routes are prefixed with /url2blog in the main router.
"""

import json
import logging
import math
import os
import re
import contextvars
from datetime import datetime
from contextlib import contextmanager
from typing import Any
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
try:
    import vertexai
    from vertexai import generative_models as gm
except Exception:  # pragma: no cover - optional runtime dependency
    vertexai = None
    gm = None

from app.core import (
    read_output,
    read_stage_result,
    read_status,
    get_article_type_by_id,
    get_article_type_by_name,
    read_article_type_name_definitions,
    write_artifact,
    write_stage_result,
    write_status,
)
from utils import get_vertex_llm
from .storage import (
    get_all_completed_articles,
    get_article_sync_status,
    mark_article_synced,
)

router = APIRouter(prefix="/url2blog", tags=["url2blog"])
logger = logging.getLogger(__name__)
FEATURE_NAME = "url2blog"

URL2BLOG_ALLOWED_MODELS = (
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
)
URL2BLOG_ALLOWED_EXECUTION_PROFILES = (
    "standard",
    "lean",
)
URL2BLOG_DEFAULT_EXECUTION_PROFILE = "standard"
URL2BLOG_DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_GROUNDED_MODEL = "gemini-2.5-flash"
DEFAULT_VERTEX_LOCATION = "us-central1"
SHORT_ARTICLE_WORD_THRESHOLD = 450
DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS = 3
MIN_EXPANDED_WORD_DELTA = 80
MIN_EXPANDED_WORD_RATIO = 1.1
MAX_LENGTH_EXPANSION_PASSES = 2
_vertexai_grounding_initialized = False
_json_parse_tracking_ctx: contextvars.ContextVar[dict[str, Any] | None] = (
    contextvars.ContextVar("url2blog_json_parse_tracking", default=None)
)

EDITORIAL_COMPONENT_LABELS = {
    "pull_quote": "Pull Quote",
    "in_the_know_box": "In The Know",
    "key_takeaways_box": "Key Takeaways",
    "highlight_callout": "Highlight Callout",
    "faq_block": "FAQ Block",
}

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


TRANSLATE_PROMPT = """You are a professional translator.

Translate the following article title and content from {source_language} into English.

Preserve:
- The original meaning and tone
- Paragraph breaks (newlines)
- Any proper nouns, brand names, or place names (keep original if no standard English equivalent)

Return ONLY valid JSON in this exact format:
{{
  "title": "The translated title in English",
  "content": "The translated article content in English, preserving paragraphs with newlines"
}}

ORIGINAL TITLE:
{title}

ORIGINAL CONTENT:
{content}
"""


CLASSIFY_ARTICLE_TYPE_PROMPT = """You are an article-type classification engine.

Your ONLY task is to classify an article into one allowed article type.
Choose exactly ONE article type from the allowed list.

Reasoning requirement:
- Explain classification in terms of editorial intent and reader outcome.
- Do NOT summarize source facts or quote source wording.

OUTPUT FORMAT (STRICT JSON ONLY):
{{
  "classification": "<exact article type name from allowed list>",
  "confidence": <float between 0.00 and 1.00>,
  "reasoning": "<1-2 sentence editorial-intent explanation>"
}}

ALLOWED ARTICLE TYPES:
{article_types}

ARTICLE TITLE:
{title}

ARTICLE CONTENT:
{content}
"""

SEO_SAFE_CONTENT_GENERATION_GUIDELINES = """SEO-SAFE CONTENT GENERATION GUIDELINES (2026-READY)

1. Preserve Search Intent First
- Retain primary and secondary search intents from the source topic.
- Do not merge sections that target different user intents.
- Narrative flow should support intent, not replace it.
- Each intent needs its own clearly defined section.

2. Use Explicit, Query-Based Headings
- Use search-query phrasing in H2/H3 headings.
- Mirror real search phrasing; avoid abstract or clever titles.
- Prefer patterns such as:
  - Best time to visit [destination]
  - Best time to visit [destination] for good weather
  - Best time to visit [destination] for smaller crowds
  - Best time to visit [destination] for lower prices
  - Worst time to visit [destination]

3. Reinforce Keywords Without Over-Optimization
- Reinforce the primary keyword in headings and key sections.
- Include secondary keywords in at least one heading, early body text,
  and a summary/takeaway section.
- Prioritize intent clarity over forced synonym swaps.

4. Optimize for Snippets and AI Answers
- Include at least one direct 40-60 word answer to a common query.
- Use clear factual tone with short lists when useful.
- Do not bury direct answers in long paragraphs.

5. Keep Sections Independent
- Each major section must stand alone and answer its target query.
- Avoid dependent references like "as mentioned earlier."

6. Include a Clear Summary or Key Takeaways
- End with concise bullets or short sub-sections.
- Reinforce categorical or comparative distinctions.
- Optimize for skimmability.

7. Balance Familiar Structure with Original Writing
- Use original phrasing while keeping proven informational structures.
- Do not deviate from familiar layouts without ranking benefit.

8. Avoid Over-Compression
- Do not collapse multiple intents into one compressed paragraph.
- Keep enough depth per intent.

9. Add Audience Context Without Losing General Relevance
- Add audience framing inside sections without replacing general search phrasing.
- General search intent remains primary.

10. Use Fresh, Evergreen Framing
- Keep advice current without brittle date dependency.
- Prefer language like "typically," "generally," or "in recent years."

11. Light Experience and Context Signals
- Include practical constraints, trade-offs, variability, and exceptions
  when relevant to improve trust.
"""

V2_GUIDELINE_REWRITE_PROMPT = """You are improving an extracted article so it better matches a target article-type guideline.

Primary goal:
- Deliver a materially transformed draft with stronger reader value.
- Improve structure, clarity, and editorial fit against the guideline.
- Keep factual content anchored to the source article; do not invent facts.

Return strict JSON only:
{
  "improved_title": "string",
  "improved_content": "string",
  "guideline_alignment_summary": "string",
  "improvements_applied": ["string"],
  "remaining_gaps": ["string"]
}

Rules:
- Preserve factual meaning from source content, but do not mirror source sequencing.
- Rewrite in a new editorial structure with a clear reader journey:
  1) context,
  2) key insights,
  3) practical implications,
  4) concise takeaway.
- Add concrete reader value (context, interpretation, practical guidance) beyond paraphrase.
- Avoid over-complication and unnecessary jargon.
- Avoid copying source phrasing; do not reuse long verbatim fragments.
- Write improved_content as Markdown body text with clear section headers.
- Include at least three `##` section headings; optional `###` subheadings are allowed.
- Do not include a `#` H1 inside improved_content (title is handled separately).
- Keep improved_content as complete article prose, not a bullet-list article.
- If important practical details are missing in source, explicitly say they are not confirmed.
- Do not use academic signpost phrasing like "In conclusion".

SOURCE TITLE:
{title}

SOURCE CONTENT:
{content}

SELECTED ARTICLE TYPE:
{article_type}

GUIDELINE:
{guideline}

TITLE GUIDELINE:
{title_guideline}

SEO-SAFE CONTENT GENERATION GUIDELINES:
{seo_guideline}

NARRATIVE OR AUDIENCE FOCUS (OPTIONAL):
{narrative_focus}

EXTERNAL CONTEXT FOR DEPTH (OPTIONAL, USE SELECTIVELY):
{external_context}
"""

V2_QUALITY_AUDIT_PROMPT = """You are running URL2Blog QUALITY AUDIT.

Evaluate the rewritten draft against:
1) guideline compliance,
2) informativeness and reader utility,
3) originality vs source phrasing/structure,
4) SEO-safe intent and heading compliance.

Return strict JSON only:
{
  "overall_score": 1,
  "guideline_coverage_score": 1,
  "informativeness_score": 1,
  "originality_score": 1,
  "too_close_to_source": false,
  "required_revisions": ["string"],
  "quality_summary": "string"
}

Scoring rubric (1-10):
- 9-10: strong publishable draft.
- 7-8: acceptable but needs refinement.
- <=6: weak and requires rewrite.

Rules:
- Mark too_close_to_source true if structure or phrasing is overly similar.
- required_revisions must be specific and actionable.
- Prioritize editorial quality over stylistic flourish.
- Include SEO revisions when intent coverage, query-based headings, or
  snippet readiness are weak.

SOURCE TITLE:
{source_title}

SOURCE CONTENT:
{source_content}

REWRITTEN TITLE:
{rewritten_title}

REWRITTEN CONTENT:
{rewritten_content}

SELECTED ARTICLE TYPE:
{article_type}

GUIDELINE:
{guideline}

TITLE GUIDELINE:
{title_guideline}

SEO-SAFE CONTENT GENERATION GUIDELINES:
{seo_guideline}

AUTOMATED NGRAM OVERLAP SIGNAL (0-1):
{ngram_overlap}

NARRATIVE OR AUDIENCE FOCUS (OPTIONAL):
{narrative_focus}

EXTERNAL CONTEXT THAT WAS AVAILABLE (OPTIONAL):
{external_context}
"""

V2_REWRITE_REPAIR_PROMPT = """You are running URL2Blog HARD REWRITE.

The previous draft is not strong enough. Rewrite it so it is:
- less like the source wording/flow,
- more informative for the reader,
- stricter on guideline compliance.

Return strict JSON only:
{
  "improved_title": "string",
  "improved_content": "string",
  "guideline_alignment_summary": "string",
  "improvements_applied": ["string"],
  "remaining_gaps": ["string"]
}

Rules:
- Preserve factual meaning from source; do not invent details.
- Do not mirror source paragraph order.
- Provide clearer interpretation and practical utility.
- Avoid near-verbatim phrasing from source.
- Keep complete article prose with Markdown section headers (no bullet-list article body).
- Include at least three `##` section headings; optional `###` subheadings are allowed.
- Do not include a `#` H1 inside improved_content (title is handled separately).
- Explicitly mark unconfirmed practical details when relevant.
- Do not use academic signpost phrasing like "In conclusion".

SOURCE TITLE:
{source_title}

SOURCE CONTENT:
{source_content}

PREVIOUS DRAFT TITLE:
{previous_title}

PREVIOUS DRAFT CONTENT:
{previous_content}

REQUIRED REVISIONS:
{required_revisions}

SELECTED ARTICLE TYPE:
{article_type}

GUIDELINE:
{guideline}

TITLE GUIDELINE:
{title_guideline}

SEO-SAFE CONTENT GENERATION GUIDELINES:
{seo_guideline}

NARRATIVE OR AUDIENCE FOCUS (OPTIONAL):
{narrative_focus}

EXTERNAL CONTEXT FOR DEPTH (OPTIONAL, USE SELECTIVELY):
{external_context}
"""

V2_SOURCE_FACTS_EXTRACTION_PROMPT = """You are extracting factual anchors from a source article.

Return strict JSON only:
{
  "facts": [
    {
      "fact_id": "F1",
      "fact": "string",
      "priority": "high|medium",
      "category": "numbers|names|amenities|policies|pricing|logistics|other"
    }
  ]
}

Rules:
- Extract concrete source facts that should survive rewriting.
- Prioritize named entities, numbers, prices, access policies, amenities, and operational details.
- Keep each fact concise and specific.
- Include up to {max_facts} facts.

SOURCE TITLE:
{source_title}

SOURCE CONTENT:
{source_content}
"""

V2_FACT_COVERAGE_AUDIT_PROMPT = """You are auditing factual coverage in a rewritten article.

Return strict JSON only:
{
  "coverage_score": 1,
  "coverage_summary": "string",
  "covered_fact_ids": ["F1"],
  "missing_facts": [
    {
      "fact_id": "F2",
      "fact": "string",
      "priority": "high|medium",
      "reason": "string"
    }
  ]
}

Scoring rubric (1-10):
- 9-10: nearly all key facts preserved.
- 7-8: some facts missing but acceptable.
- <=6: important factual loss.

Rules:
- High-priority facts should be present unless clearly irrelevant to the rewritten scope.
- Missing facts must be concrete and source-grounded.
- Do not require exact wording; evaluate factual presence.

SOURCE FACTS:
{source_facts}

REWRITTEN TITLE:
{rewritten_title}

REWRITTEN CONTENT:
{rewritten_content}
"""

V2_FACT_REPAIR_PROMPT = """You are repairing a rewritten article to restore missing source facts.

Return strict JSON only:
{
  "improved_title": "string",
  "improved_content": "string",
  "guideline_alignment_summary": "string",
  "improvements_applied": ["string"],
  "remaining_gaps": ["string"]
}

Rules:
- Keep existing strong structure and readability.
- Reintroduce missing source facts naturally and precisely.
- Do not invent new facts.
- Do not remove already-correct details.
- Keep complete article prose with Markdown section headers (no bullet-list article body).
- Include at least three `##` section headings; optional `###` subheadings are allowed.
- Do not include a `#` H1 inside improved_content (title is handled separately).
- Do not use academic signpost phrasing like "In conclusion".

SOURCE TITLE:
{source_title}

SOURCE CONTENT:
{source_content}

CURRENT REWRITTEN TITLE:
{rewritten_title}

CURRENT REWRITTEN CONTENT:
{rewritten_content}

MISSING FACTS TO RESTORE:
{missing_facts}

SELECTED ARTICLE TYPE:
{article_type}

GUIDELINE:
{guideline}

TITLE GUIDELINE:
{title_guideline}

SEO-SAFE CONTENT GENERATION GUIDELINES:
{seo_guideline}

NARRATIVE OR AUDIENCE FOCUS (OPTIONAL):
{narrative_focus}

EXTERNAL CONTEXT FOR DEPTH (OPTIONAL, USE SELECTIVELY):
{external_context}
"""

V2_LENGTH_EXPANSION_PROMPT = """You are running URL2Blog LENGTH EXPANSION.

Goal:
- Expand the rewritten article so it is materially longer than the source.
- Increase useful depth while preserving factual integrity and structure.

Return strict JSON only:
{
  "expanded_content": "string",
  "expansion_summary": "string"
}

Rules:
- Keep all existing valid facts and practical guidance.
- Do not invent facts.
- Keep Markdown heading structure (H2/H3) and reader-friendly flow.
- Expand with concrete context, clarifications, caveats, and comparisons
  grounded in the provided source and context.
- Do not compress existing sections.
- Expanded content must be at least {min_word_target} words.
- Expanded content must be longer than source content ({source_word_count} words).

SOURCE TITLE:
{source_title}

SOURCE CONTENT:
{source_content}

CURRENT REWRITTEN TITLE:
{rewritten_title}

CURRENT REWRITTEN CONTENT:
{rewritten_content}

CURRENT WORD COUNT:
{current_word_count}

SELECTED ARTICLE TYPE:
{article_type}

GUIDELINE:
{guideline}

TITLE GUIDELINE:
{title_guideline}

SEO-SAFE CONTENT GENERATION GUIDELINES:
{seo_guideline}

NARRATIVE OR AUDIENCE FOCUS (OPTIONAL):
{narrative_focus}

EXTERNAL CONTEXT FOR DEPTH (OPTIONAL):
{external_context}

SOURCE FACT ANCHORS (OPTIONAL):
{source_facts}
"""

V2_SHORT_ARTICLE_ENRICHMENT_PROMPT = """You are running URL2Blog SHORT-ARTICLE ENRICHMENT with Google Search grounding.

Goal:
- For short source articles, gather limited external context that deepens reader value.
- Keep it tasteful: only high-signal, directly relevant context.

Return strict JSON only:
{
  "context_points": [
    {
      "insight": "string",
      "why_it_matters": "string",
      "source_url": "https://...",
      "confidence": "high|medium"
    }
  ],
  "usage_note": "string"
}

Rules:
- Maximum points: {max_points}
- Prefer official sources and reputable publications.
- No speculative or weakly related details.
- Run lookup in the source language and English; include one additional relevant regional language when useful.
- If useful context is not found, return an empty list.
- Keep insights concise and directly actionable for writers.

SOURCE URL:
{source_url}

SOURCE TITLE:
{source_title}

SOURCE CONTENT:
{source_content}

SELECTED ARTICLE TYPE:
{article_type}

NARRATIVE OR AUDIENCE FOCUS (OPTIONAL):
{narrative_focus}
"""

V2_EDITORIAL_AUGMENTATION_PROMPT = """You are running URL2Blog EDITORIAL AUGMENTATION on a finished draft.

Goal:
- Optionally add high-signal editorial components that improve comprehension, pacing, or emphasis.
- Default to zero add-ons when the article already reads clearly.
- Keep output in Markdown and preserve the author's voice.

Return strict JSON only:
{
  "augmented_content": "string",
  "components_added": [
    {
      "component": "pull_quote|in_the_know_box|key_takeaways_box|highlight_callout|faq_block",
      "justification": "string",
      "placement": "string"
    }
  ],
  "diagnostic": {
    "cognitive_load": "strong|weak",
    "narrative_density": "strong|weak",
    "emphasis_clarity": "strong|weak",
    "reading_behavior_risk": "strong|weak"
  },
  "augmentation_summary": "string"
}

Core principle:
- Do not add a component unless it measurably improves comprehension, pacing, or emphasis.
- If uncertain, do nothing.

Decision process:
1) Diagnose these axes before adding anything:
   - cognitive_load
   - narrative_density
   - emphasis_clarity
   - reading_behavior_risk
2) Add components only if at least one axis is weak.
3) Use restraint: one component is common, two is acceptable, more is rare.
4) Never add more than one component in the same immediate section.
5) Every component must be defensible in one clear sentence.

Component rules:
- pull_quote:
  - 1 per article (2 max for long pieces).
  - Quote must already exist in article text.
  - Amplify emphasis only; do not explain or add facts.
  - Skip for list-heavy or purely informational drafts when redundant.
- in_the_know_box:
  - Use only to prevent likely reader confusion.
  - Neutral factual tone, clearly labeled.
  - No repetition of nearby prose.
- key_takeaways_box:
  - Use for long or argument-driven drafts where skimmers may miss the point.
  - 3-5 bullets only.
  - No new information.
- highlight_callout:
  - 1-2 sentences only.
  - Use to relieve dense pacing, not to restate nearby callouts.
  - No decorative styling instructions.
- faq_block:
  - 2-5 questions maximum.
  - Each answer must be 1-3 sentences.
  - No new information; restate only what article already says.
  - Questions should mirror natural search phrasing.
  - Place near the end (typically after key takeaways), unless an explainer
    needs earlier clarification.
  - Skip for short or purely narrative pieces, or when likely questions
    require new information.

Markdown constraints:
- Keep Markdown headings and existing structure intact.
- Do not add HTML/CSS.
- Do not add code fences.
- Do not add new factual claims.
- When a component is applied, wrap it in an isolated parse-friendly Markdown block.
- Required delimiter lines:
  > [!EDITORIAL-BLOCK-START|<component_key>]
  > [!EDITORIAL-BLOCK-LABEL|<official_label>]
  > [!EDITORIAL-BLOCK-END|<component_key>]
- Inside that block include this exact marker line:
  > [!EDITORIAL-BOX|<component_key>]
- Allowed component_key values:
  pull_quote, in_the_know_box, key_takeaways_box, highlight_callout, faq_block
- Immediately after the marker line include:
  > **Component:** <human label>
- `<official_label>` and `<human label>` must match the canonical label.
- Then include the component content inside the same blockquote.
- Example:
  > [!EDITORIAL-BLOCK-START|in_the_know_box]
  > [!EDITORIAL-BLOCK-LABEL|In The Know]
  > [!EDITORIAL-BOX|in_the_know_box]
  > **Component:** In The Know
  > Short neutral context note.
  > [!EDITORIAL-BLOCK-END|in_the_know_box]

ARTICLE TITLE:
{article_title}

ARTICLE CONTENT (MARKDOWN):
{article_content}

SELECTED ARTICLE TYPE:
{article_type}

NARRATIVE OR AUDIENCE FOCUS (OPTIONAL):
{narrative_focus}
"""


class ExtractRequest(BaseModel):
    url: str
    model_name: str | None = None
    include_debug: bool = False


class Stage2ClassifyRequest(BaseModel):
    title: str
    content: str
    source_url: str | None = None
    language: str | None = None
    model_name: str | None = None
    include_debug: bool = False


class PipelineV2Request(BaseModel):
    url: str
    include_debug: bool = False
    narrative_focus: str | None = None
    enable_web_enrichment: bool = True
    enable_editorial_augmentation: bool = True
    execution_profile: str | None = URL2BLOG_DEFAULT_EXECUTION_PROFILE
    max_external_context_items: int = DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS
    model_name: str | None = URL2BLOG_DEFAULT_MODEL


def _now_iso() -> str:
    """Return a UTC ISO timestamp for run/state writes."""
    return datetime.utcnow().isoformat()


@router.get("/status/{run_id}")
async def get_status(run_id: str) -> JSONResponse:
    """Get the status of a URL2Blog pipeline run."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")
    return JSONResponse(status)


@router.get("/result/{run_id}")
async def get_result(run_id: str) -> JSONResponse:
    """Get the result of a completed URL2Blog pipeline run."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    output = read_output(run_id)
    if not output:
        raise HTTPException(status_code=404, detail="Result not available yet.")

    return JSONResponse(
        {
            "run_id": run_id,
            "markdown": output["markdown"],
            "artifact": output["artifact"],
        }
    )


@router.get("/debug/{run_id}")
async def debug_run(run_id: str) -> JSONResponse:
    """Debug endpoint for URL2Blog run metadata/stages."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Run not found.")

    stages = {}
    for stage_name in ["stage_1", "stage_2", "pipeline_v2"]:
        stage_data = read_stage_result(run_id, stage_name)
        if stage_data:
            stages[stage_name] = stage_data

    output = read_output(run_id)

    return JSONResponse(
        {
            "run_id": run_id,
            "status": status,
            "stages": stages,
            "output": output,
        }
    )


@router.get("/articles")
async def get_articles() -> JSONResponse:
    """Get all completed URL2Blog articles."""
    return JSONResponse(get_all_completed_articles())


@router.post("/articles/{run_id}/sync")
async def mark_article_as_synced(run_id: str, request: dict) -> JSONResponse:
    """Mark a URL2Blog article as synced to Payload CMS."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Article not found")

    payload_article_id = request.get("payload_article_id")
    if not payload_article_id:
        raise HTTPException(status_code=400, detail="payload_article_id is required")

    success = mark_article_synced(run_id, payload_article_id)
    if not success:
        raise HTTPException(status_code=404, detail="Article not found")

    return JSONResponse(
        {
            "message": "Article marked as synced",
            "run_id": run_id,
            "payload_article_id": payload_article_id,
        }
    )


@router.get("/articles/{run_id}/sync")
async def get_sync_status(run_id: str) -> JSONResponse:
    """Get URL2Blog article sync status."""
    status = read_status(run_id)
    if not status or status.get("feature") != FEATURE_NAME:
        raise HTTPException(status_code=404, detail="Article not found")

    status = get_article_sync_status(run_id)
    if not status:
        raise HTTPException(status_code=404, detail="Article not found")
    return JSONResponse(status)


def _strip_html(html: str) -> str:
    """Strip HTML tags and decode entities to get raw text."""
    # Remove script and style blocks entirely
    text = re.sub(
        r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE
    )
    text = re.sub(
        r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE
    )
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


def _extract_json_from_response(
    raw_text: str,
    *,
    allow_truncated_repair: bool = True,
) -> tuple[dict[str, Any] | None, str | None]:
    """Parse JSON from LLM response, handling markdown code blocks."""
    if not raw_text:
        return None, "Empty response"

    cleaned_text = raw_text.strip().lstrip("\ufeff")
    if not cleaned_text:
        return None, "Empty response"

    # Handle fenced JSON even when the closing fence is missing.
    if cleaned_text.startswith("```"):
        cleaned_text = re.sub(
            r"^```(?:json)?\s*",
            "",
            cleaned_text,
            flags=re.IGNORECASE,
        ).strip()
        cleaned_text = re.sub(r"\s*```$", "", cleaned_text).strip()

    # Try to extract from markdown code block first.
    match = re.search(
        r"```(?:json)?\s*(.*?)(?:\s*```|\s*$)",
        cleaned_text,
        re.DOTALL | re.IGNORECASE,
    )
    cleaned = match.group(1).strip() if match else cleaned_text

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed, None
        return None, "Expected a JSON object"
    except json.JSONDecodeError as exc:
        # Try to find JSON object by first/last brace.
        obj_start = cleaned.find("{")
        obj_end = cleaned.rfind("}")
        if obj_start != -1 and obj_end > obj_start:
            try:
                parsed = json.loads(cleaned[obj_start:obj_end + 1])
                if isinstance(parsed, dict):
                    return parsed, None
            except json.JSONDecodeError:
                pass

        # Try to extract first balanced JSON object.
        candidate = _extract_first_json_object(cleaned)
        if candidate:
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed, None
            except json.JSONDecodeError:
                pass

        if allow_truncated_repair:
            repaired = _try_fix_truncated_json_object(cleaned)
            if repaired:
                return repaired, None

        return None, str(exc)


def _extract_first_json_object(text: str) -> str | None:
    """Extract the first balanced JSON object substring from text."""
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False

    for idx in range(start, len(text)):
        char = text[idx]

        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue

        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start:idx + 1]

    return None


def _try_fix_truncated_json_object(text: str) -> dict[str, Any] | None:
    """Attempt to recover from truncated JSON by closing open strings/braces."""
    candidate = text.strip()
    if not candidate:
        return None

    first_brace = candidate.find("{")
    if first_brace == -1:
        return None
    candidate = candidate[first_brace:]

    # Close odd quote counts when the response ends mid-string.
    if candidate.count('"') % 2 == 1:
        candidate = f'{candidate}"'

    open_braces = candidate.count("{")
    close_braces = candidate.count("}")
    if open_braces > close_braces:
        candidate = f"{candidate}{'}' * (open_braces - close_braces)}"

    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        return None

    return None


def _normalize_article_type_name(name: str) -> str:
    """Normalize article type names for robust matching."""
    return re.sub(r"\s+", " ", name.strip()).lower()


def _enforce_editorial_reasoning(reasoning: str, classification: str) -> str:
    """Force classification reasoning to reference editorial intent."""
    cleaned = reasoning.strip()
    if not cleaned:
        cleaned = (
            f"Editorial intent: {classification} best matches the desired reader outcome "
            "and publishing objective."
        )
    if "editorial intent" not in cleaned.lower():
        cleaned = (
            f"{cleaned} Editorial intent: this format best aligns with the intended "
            "reader outcome and content objective."
        )
    return cleaned


def _safe_str(value: Any) -> str:
    """Return a trimmed string value."""
    return value.strip() if isinstance(value, str) else ""


def _safe_string_list(value: Any) -> list[str]:
    """Normalize a value to a list of strings."""
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _safe_dict(value: Any) -> dict[str, Any]:
    """Normalize a value to a dictionary."""
    return value if isinstance(value, dict) else {}


def _safe_bool(value: Any, default: bool = False) -> bool:
    """Normalize loose boolean values."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y"}:
            return True
        if normalized in {"false", "0", "no", "n"}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return default


def _safe_int(value: Any, default: int, *, min_value: int, max_value: int) -> int:
    """Normalize an integer and clamp to bounds."""
    candidate: int
    if isinstance(value, int):
        candidate = value
    elif isinstance(value, float):
        candidate = int(round(value))
    elif isinstance(value, str):
        try:
            candidate = int(float(value.strip()))
        except (TypeError, ValueError):
            candidate = default
    else:
        candidate = default

    return max(min_value, min(max_value, candidate))


def _normalize_language_name(language: str) -> str:
    """Normalize language labels into canonical names."""
    lowered = language.strip().lower()
    if not lowered:
        return "English"
    language_map = {
        "english": "English",
        "en": "English",
        "spanish": "Spanish",
        "es": "Spanish",
        "espanol": "Spanish",
        "portuguese": "Portuguese",
        "pt": "Portuguese",
        "french": "French",
        "fr": "French",
        "italian": "Italian",
        "it": "Italian",
        "german": "German",
        "de": "German",
        "japanese": "Japanese",
        "ja": "Japanese",
        "korean": "Korean",
        "ko": "Korean",
        "chinese": "Chinese",
        "zh": "Chinese",
    }
    return language_map.get(lowered, language.strip().title() or "English")


def _resolve_url2blog_model(model_name: str | None) -> str:
    """Resolve and validate URL2Blog model selection."""
    candidate = _safe_str(model_name).lower()
    if not candidate:
        return URL2BLOG_DEFAULT_MODEL
    if candidate in URL2BLOG_ALLOWED_MODELS:
        return candidate
    raise HTTPException(
        status_code=400,
        detail=(
            "Invalid URL2Blog model. Allowed values: "
            + ", ".join(URL2BLOG_ALLOWED_MODELS)
        ),
    )


def _resolve_execution_profile(profile: str | None) -> str:
    """Resolve and validate URL2Blog execution profile."""
    candidate = _safe_str(profile).lower()
    if not candidate:
        return URL2BLOG_DEFAULT_EXECUTION_PROFILE
    if candidate in URL2BLOG_ALLOWED_EXECUTION_PROFILES:
        return candidate
    raise HTTPException(
        status_code=400,
        detail=(
            "Invalid URL2Blog execution_profile. Allowed values: "
            + ", ".join(URL2BLOG_ALLOWED_EXECUTION_PROFILES)
        ),
    )


def _resolve_grounded_model(model_name: str | None) -> str:
    """Resolve model used for grounded search enrichment."""
    resolved = _resolve_url2blog_model(model_name)
    if resolved in {"gemini-2.5-flash", "gemini-2.5-pro"}:
        return resolved
    return DEFAULT_GROUNDED_MODEL


def _tokenize_similarity_words(text: str) -> list[str]:
    """Tokenize text for rough similarity heuristics."""
    return re.findall(r"[a-z0-9']+", text.lower())


def _ngram_overlap_ratio(
    source_words: list[str],
    rewritten_words: list[str],
    *,
    n: int = 10,
) -> float:
    """Return n-gram overlap ratio from rewritten text against source text."""
    if len(source_words) < n or len(rewritten_words) < n:
        return 0.0

    source_ngrams = {
        " ".join(source_words[idx:idx + n])
        for idx in range(len(source_words) - n + 1)
    }
    rewritten_total = len(rewritten_words) - n + 1
    if rewritten_total <= 0:
        return 0.0

    overlap_hits = 0
    for idx in range(rewritten_total):
        chunk = " ".join(rewritten_words[idx:idx + n])
        if chunk in source_ngrams:
            overlap_hits += 1

    return overlap_hits / rewritten_total


def _ensure_vertexai_grounding_initialized() -> bool:
    """Initialize Vertex AI for grounded Google Search usage."""
    global _vertexai_grounding_initialized

    if _vertexai_grounding_initialized:
        return True
    if vertexai is None or gm is None:
        return False

    project = os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
    if not project:
        return False
    location = os.getenv("GOOGLE_CLOUD_LOCATION", DEFAULT_VERTEX_LOCATION).strip()

    try:
        vertexai.init(project=project, location=location)
    except Exception:
        logger.warning(
            "URL2Blog pipeline v2: failed to initialize Vertex grounding",
            exc_info=True,
        )
        return False

    _vertexai_grounding_initialized = True
    return True


def _extract_urls_from_nested(value: Any) -> list[str]:
    """Extract URLs recursively from nested dict/list/string values."""
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


def _extract_grounded_urls_from_response(response: Any, max_urls: int = 12) -> list[str]:
    """Extract grounded source URLs from a Gemini response payload."""
    if response is None:
        return []

    urls: list[str] = []
    seen: set[str] = set()

    try:
        response_dict = response.to_dict()
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
            candidate_dict = (
                candidate.to_dict() if hasattr(candidate, "to_dict") else {}
            )
            for url in _extract_urls_from_nested(
                candidate_dict.get("grounding_metadata", {})
            ):
                if url in seen:
                    continue
                seen.add(url)
                urls.append(url)
                if len(urls) >= max_urls:
                    return urls
    except Exception:
        pass

    return urls


def _invoke_google_grounded_json(
    prompt: str,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.05,
    model_name: str | None = None,
) -> tuple[dict[str, Any], str, list[str]]:
    """Invoke Gemini with Google Search grounding and parse JSON output."""
    if not _ensure_vertexai_grounding_initialized() or gm is None:
        return {}, "", []

    strict_prompt = (
        f"{prompt}\n\n"
        "CRITICAL OUTPUT RULE:\n"
        "Return ONLY one valid JSON object.\n"
        "No prose, no markdown, no code fences."
    )

    grounded_model_name = _resolve_grounded_model(model_name)

    def _generate_with_model(
        resolved_model_name: str,
    ) -> tuple[Any, str | None]:
        try:
            model = gm.GenerativeModel(resolved_model_name)
            retrieval_tool = gm.Tool.from_google_search_retrieval(
                gm.grounding.GoogleSearchRetrieval(
                    dynamic_retrieval_config=gm.grounding.DynamicRetrievalConfig(
                        mode=gm.grounding.DynamicRetrievalConfig.Mode.MODE_DYNAMIC,
                        dynamic_threshold=0.35,
                    )
                )
            )
            generated = model.generate_content(
                strict_prompt,
                generation_config=gm.GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                ),
                tools=[retrieval_tool],
            )
            return generated, None
        except Exception as exc:  # pragma: no cover - network/runtime dependent
            return None, str(exc)

    response, first_error = _generate_with_model(grounded_model_name)
    if response is None and grounded_model_name != DEFAULT_GROUNDED_MODEL:
        logger.warning(
            "URL2Blog pipeline v2: grounded enrichment failed on %s, retrying with %s",
            grounded_model_name,
            DEFAULT_GROUNDED_MODEL,
        )
        response, _ = _generate_with_model(DEFAULT_GROUNDED_MODEL)

    if response is None:
        logger.warning(
            "URL2Blog pipeline v2: grounded enrichment failed",
            extra={"model_name": grounded_model_name, "error": first_error or "unknown"},
        )
        return {}, "", []

    try:
        raw_response = _safe_str(getattr(response, "text", ""))
    except Exception:
        raw_response = ""
    parsed, parse_error = _extract_json_from_response(raw_response)
    if parse_error or not parsed:
        logger.warning(
            "URL2Blog pipeline v2: grounded enrichment JSON parse failed: %s",
            parse_error or "unknown",
        )
        parsed = {}

    grounded_urls = _extract_grounded_urls_from_response(response)
    return parsed, raw_response, grounded_urls


def _build_excerpt(text: str, limit: int = 320) -> str:
    """Return a compact single-line excerpt."""
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 3].rstrip()}..."


def _build_markdown(title: str, content: str) -> str:
    """Return clean markdown output for the rewritten article."""
    cleaned_title = _safe_str(title)
    cleaned_content = _ensure_markdown_section_headers(content)
    if cleaned_title:
        return f"# {cleaned_title}\n\n{cleaned_content}".strip()
    return cleaned_content


@contextmanager
def _json_parse_tracking_scope(
    parse_metrics: dict[str, Any] | None, stage_name: str
):
    """Track JSON parse retries for a logical stage."""
    if parse_metrics is None:
        yield
        return

    token = _json_parse_tracking_ctx.set(
        {"metrics": parse_metrics, "stage": stage_name}
    )
    try:
        yield
    finally:
        _json_parse_tracking_ctx.reset(token)


def _record_json_parse_failure() -> None:
    """Increment parse-failure counters in active tracking scope."""
    tracking = _json_parse_tracking_ctx.get()
    if not tracking:
        return
    metrics = tracking.get("metrics")
    stage_name = _safe_str(tracking.get("stage")) or "unknown"
    if not isinstance(metrics, dict):
        return

    metrics["total_parse_failures"] = (
        _safe_int(
            metrics.get("total_parse_failures"),
            default=0,
            min_value=0,
            max_value=9999,
        )
        + 1
    )
    failures_by_stage = metrics.get("failures_by_stage")
    if not isinstance(failures_by_stage, dict):
        failures_by_stage = {}
        metrics["failures_by_stage"] = failures_by_stage
    failures_by_stage[stage_name] = (
        _safe_int(
            failures_by_stage.get(stage_name),
            default=0,
            min_value=0,
            max_value=9999,
        )
        + 1
    )


def _record_json_parse_recovery(failures_recovered: int) -> None:
    """Increment recovery counters when retries eventually succeed."""
    if failures_recovered <= 0:
        return
    tracking = _json_parse_tracking_ctx.get()
    if not tracking:
        return
    metrics = tracking.get("metrics")
    if not isinstance(metrics, dict):
        return

    metrics["recovered_calls"] = (
        _safe_int(
            metrics.get("recovered_calls"),
            default=0,
            min_value=0,
            max_value=9999,
        )
        + 1
    )
    metrics["recovered_parse_failures"] = (
        _safe_int(
            metrics.get("recovered_parse_failures"),
            default=0,
            min_value=0,
            max_value=9999,
        )
        + failures_recovered
    )


def _invoke_json_llm_tracked(
    *,
    prompt: str,
    stage_name: str,
    parse_metrics: dict[str, Any] | None,
    max_tokens: int = 4096,
    temperature: float = 0.05,
    model_name: str | None = None,
    allow_truncated_repair: bool = False,
) -> tuple[dict[str, Any], str]:
    """Invoke JSON LLM with parse-retry tracking for a named stage."""
    with _json_parse_tracking_scope(parse_metrics, stage_name):
        if allow_truncated_repair:
            return _invoke_json_llm(
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                model_name=model_name,
                allow_truncated_repair=True,
            )
        return _invoke_json_llm(
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            model_name=model_name,
        )


def _ensure_markdown_section_headers(content: str) -> str:
    """Ensure article body contains markdown section headers."""
    cleaned = content.strip()
    if not cleaned:
        return cleaned

    fenced_match = re.match(
        r"^```(?:markdown|md)?\s*(.*?)\s*```$",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if fenced_match:
        cleaned = _safe_str(fenced_match.group(1))

    # Final markdown already prepends an H1 title, so demote any body H1 headings.
    cleaned = re.sub(r"(?m)^\s*#\s+", "## ", cleaned).strip()

    if re.search(r"(?m)^\s{0,3}#{2,6}\s+\S", cleaned):
        return cleaned

    paragraphs = [item.strip() for item in re.split(r"\n\s*\n", cleaned) if item.strip()]
    if not paragraphs:
        return cleaned

    if len(paragraphs) == 1:
        sentences = [
            segment.strip()
            for segment in re.split(r"(?<=[.!?])\s+", paragraphs[0])
            if segment.strip()
        ]
        if len(sentences) >= 3:
            split_index = max(1, len(sentences) // 2)
            first_half = " ".join(sentences[:split_index]).strip()
            second_half = " ".join(sentences[split_index:]).strip()
            return (
                "## Overview\n\n"
                f"{first_half}\n\n"
                "## Key Takeaways\n\n"
                f"{second_half}"
            ).strip()
        return f"## Overview\n\n{paragraphs[0]}".strip()

    section_titles = [
        "Overview",
        "Key Insights",
        "Practical Implications",
        "Takeaway",
    ]
    sections: list[str] = []
    for idx, paragraph in enumerate(paragraphs, start=1):
        if idx <= len(section_titles):
            heading = section_titles[idx - 1]
        else:
            heading = f"Additional Insight {idx - len(section_titles)}"
        sections.append(f"## {heading}\n\n{paragraph}")

    return "\n\n".join(sections).strip()


def _invoke_json_llm(
    prompt: str,
    max_tokens: int = 4096,
    temperature: float = 0.05,
    model_name: str | None = None,
    allow_truncated_repair: bool = False,
) -> tuple[dict[str, Any], str]:
    """Invoke LLM and parse strict JSON response."""
    parsed, raw_response, parse_error = _invoke_json_llm_best_effort(
        prompt=prompt,
        max_tokens=max_tokens,
        temperature=temperature,
        model_name=model_name,
        allow_truncated_repair=allow_truncated_repair,
    )
    if parsed:
        return parsed, raw_response

    raise HTTPException(
        status_code=500,
        detail=f"Failed to parse LLM response: {parse_error or 'Unknown parse failure'}",
    )


def _invoke_json_llm_best_effort(
    prompt: str,
    max_tokens: int = 4096,
    temperature: float = 0.05,
    model_name: str | None = None,
    allow_truncated_repair: bool = False,
) -> tuple[dict[str, Any] | None, str, str | None]:
    """Invoke LLM with JSON-recovery retries without raising on parse failure."""
    strict_prompt = (
        f"{prompt}\n\n"
        "CRITICAL OUTPUT RULE:\n"
        "Return ONLY one valid JSON object.\n"
        "No prose, no markdown, no code fences."
    )

    last_error = "Unknown parse failure"
    last_response = ""
    current_prompt = strict_prompt

    selected_model_name = _resolve_url2blog_model(model_name)
    for resolved_model_name in (selected_model_name,):
        current_prompt = strict_prompt
        parse_failures_this_call = 0

        for attempt in range(1, 4):
            llm = get_vertex_llm(
                temperature=temperature if attempt == 1 else 0.0,
                max_tokens=max_tokens,
                model_name=resolved_model_name,
            )
            result = llm.invoke(current_prompt)
            if not result or not result.strip():
                last_error = f"{resolved_model_name} returned an empty response."
                parse_failures_this_call += 1
                _record_json_parse_failure()
                continue

            raw_response = result.strip()
            parsed, parse_error = _extract_json_from_response(
                raw_response,
                allow_truncated_repair=allow_truncated_repair,
            )
            if not parse_error and parsed:
                _record_json_parse_recovery(parse_failures_this_call)
                if resolved_model_name != selected_model_name:
                    logger.warning(
                        "URL2Blog JSON recovered using fallback model %s",
                        resolved_model_name,
                    )
                return parsed, raw_response, None

            last_error = parse_error or "Invalid JSON"
            last_response = raw_response[:2000]
            parse_failures_this_call += 1
            _record_json_parse_failure()

            log_message = (
                "URL2Blog JSON parse failed (%s attempt %d): %s | preview=%s"
            )
            log_args = (
                resolved_model_name,
                attempt,
                last_error,
                last_response.replace("\n", " ")[:240],
            )
            if attempt < 3:
                logger.info(log_message, *log_args)
            else:
                logger.warning(log_message, *log_args)

            current_prompt = (
                "Your previous output was invalid JSON.\n"
                "Return ONLY one strict JSON object.\n"
                "Do not add commentary. Do not use markdown fences. Do not add trailing commas.\n"
                "Ensure all property names and string values use double quotes.\n"
                "If previous output was truncated, complete it as valid JSON.\n"
                "Output must start with '{' and end with '}'.\n\n"
                f"Previous invalid output:\n{raw_response[:4000]}\n"
            )

    return None, last_response, last_error


def _remove_academic_conclusion_phrases(text: str) -> str:
    """Replace academic closing signposts with neutral editorial transitions."""
    if not text:
        return text

    cleaned = re.sub(
        r"\bin conclusion\b\s*[,:\-]?\s*",
        "Overall, ",
        text,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\bto conclude\b\s*[,:\-]?\s*",
        "Overall, ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"(Overall,\s*){2,}", "Overall, ", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _sanitize_v2_guideline_rewrite(
    parsed: dict[str, Any],
    *,
    fallback_title: str,
    fallback_content: str,
) -> dict[str, Any]:
    """Normalize simplified guideline rewrite output."""
    improved_title = _safe_str(parsed.get("improved_title")) or fallback_title
    improved_content = _safe_str(parsed.get("improved_content")) or fallback_content
    improved_content = _remove_academic_conclusion_phrases(improved_content)
    guideline_alignment_summary = _safe_str(parsed.get("guideline_alignment_summary"))
    if not guideline_alignment_summary:
        guideline_alignment_summary = (
            "Article was revised for stronger guideline alignment, clearer flow, and "
            "more consistent editorial tone."
        )
    guideline_alignment_summary = _remove_academic_conclusion_phrases(
        guideline_alignment_summary
    )

    improvements_applied = _safe_string_list(parsed.get("improvements_applied"))
    if not improvements_applied:
        improvements_applied = [
            "Tightened structure and transitions between sections.",
            "Improved editorial clarity and consistency.",
            "Adjusted wording to better match article-type guidance.",
        ]

    return {
        "improved_title": improved_title,
        "improved_content": improved_content,
        "guideline_alignment_summary": guideline_alignment_summary,
        "improvements_applied": improvements_applied,
        "remaining_gaps": _safe_string_list(parsed.get("remaining_gaps")),
    }


def _resolve_min_expanded_word_target(source_word_count: int) -> int:
    """Return minimum required word count for expanded output."""
    baseline = max(source_word_count + 1, source_word_count + MIN_EXPANDED_WORD_DELTA)
    ratio_target = int(math.ceil(source_word_count * MIN_EXPANDED_WORD_RATIO))
    return max(baseline, ratio_target)


def _sanitize_v2_length_expansion(
    parsed: dict[str, Any], *, fallback_content: str
) -> dict[str, str]:
    """Normalize length-expansion output."""
    expanded_content = _safe_str(parsed.get("expanded_content")) or fallback_content
    expanded_content = _remove_academic_conclusion_phrases(expanded_content)
    expanded_content = _ensure_markdown_section_headers(expanded_content)

    expansion_summary = _safe_str(parsed.get("expansion_summary"))
    if not expansion_summary:
        expansion_summary = (
            "Expanded article depth while preserving factual integrity and structure."
        )

    return {
        "expanded_content": expanded_content,
        "expansion_summary": expansion_summary,
    }


def _normalize_editorial_component_name(value: str) -> str:
    """Normalize editorial augmentation component names."""
    normalized = re.sub(r"[\s\-]+", "_", value.strip().lower())
    aliases = {
        "pull_quote": "pull_quote",
        "quote": "pull_quote",
        "in_the_know_box": "in_the_know_box",
        "in_the_know": "in_the_know_box",
        "in_theknow_box": "in_the_know_box",
        "in_the_know_callout": "in_the_know_box",
        "key_takeaways_box": "key_takeaways_box",
        "key_takeaways": "key_takeaways_box",
        "takeaways": "key_takeaways_box",
        "highlight_callout": "highlight_callout",
        "highlight": "highlight_callout",
        "callout": "highlight_callout",
        "faq_block": "faq_block",
        "faq": "faq_block",
        "faqs": "faq_block",
        "qa_block": "faq_block",
        "q_and_a_block": "faq_block",
    }
    return aliases.get(normalized, "")


def _sanitize_editorial_diagnostic_axis(value: Any) -> str:
    """Normalize diagnostic axis values for editorial augmentation."""
    if isinstance(value, bool):
        return "weak" if value else "strong"

    normalized = _safe_str(value).lower()
    weak_values = {
        "weak",
        "needs_support",
        "needs support",
        "high",
        "high_risk",
        "at_risk",
        "risky",
        "yes",
    }
    if normalized in weak_values:
        return "weak"
    return "strong"


def _normalize_markdown_for_comparison(value: str) -> str:
    """Return normalized markdown text for lightweight equality checks."""
    return re.sub(r"\s+", " ", value).strip().lower()


def _editorial_box_marker(component: str) -> str:
    """Return canonical markdown marker for editorial components."""
    return f"[!EDITORIAL-BOX|{component}]"


def _editorial_block_start_marker(component: str) -> str:
    """Return canonical markdown START marker for editorial components."""
    return f"[!EDITORIAL-BLOCK-START|{component}]"


def _editorial_block_end_marker(component: str) -> str:
    """Return canonical markdown END marker for editorial components."""
    return f"[!EDITORIAL-BLOCK-END|{component}]"


def _editorial_block_label_marker(component: str) -> str:
    """Return canonical markdown label marker for editorial components."""
    label = EDITORIAL_COMPONENT_LABELS.get(component, component)
    return f"[!EDITORIAL-BLOCK-LABEL|{label}]"


def _line_matches_editorial_marker(line: str, marker: str) -> bool:
    """Return True when a markdown line matches a specific marker."""
    return bool(
        re.match(
            rf"^\s*>\s*{re.escape(marker)}\s*$",
            line,
            flags=re.IGNORECASE,
        )
    )


def _find_editorial_block_range(
    lines: list[str], component: str
) -> tuple[int, int] | None:
    """Return (start, end) line indexes for a component editorial block."""
    start_marker = _editorial_block_start_marker(component)
    end_marker = _editorial_block_end_marker(component)
    start_idx = -1

    for idx, line in enumerate(lines):
        if start_idx == -1:
            if _line_matches_editorial_marker(line, start_marker):
                start_idx = idx
            continue

        if _line_matches_editorial_marker(line, end_marker):
            return start_idx, idx

    return None


def _content_has_editorial_block(content: str, component: str) -> bool:
    """Return True when content contains START/END markers for a component."""
    start_marker = re.escape(_editorial_block_start_marker(component))
    end_marker = re.escape(_editorial_block_end_marker(component))
    pattern = (
        rf"(?mis)^\s*>\s*{start_marker}\s*$.*?^\s*>\s*{end_marker}\s*$"
    )
    return bool(re.search(pattern, content))


def _build_editorial_metadata_box(component_entry: dict[str, str]) -> str:
    """Build fallback markdown box metadata for a component."""
    component = component_entry["component"]
    label = EDITORIAL_COMPONENT_LABELS.get(component, component)
    lines = [
        f"> {_editorial_block_start_marker(component)}",
        f"> {_editorial_block_label_marker(component)}",
        f"> {_editorial_box_marker(component)}",
        f"> **Component:** {label}",
    ]
    placement = _safe_str(component_entry.get("placement"))
    if placement:
        lines.append(f"> **Placement:** {placement}")
    justification = _safe_str(component_entry.get("justification"))
    if justification:
        lines.append(f"> **Why:** {justification}")
    lines.append(f"> {_editorial_block_end_marker(component)}")
    return "\n".join(lines)


def _wrap_existing_editorial_box_with_markers(content: str, component: str) -> str:
    """Wrap existing component box with START/END markers when missing."""
    if not content:
        return content
    if _content_has_editorial_block(content, component):
        return content

    marker_line_re = re.compile(
        rf"^\s*>\s*{re.escape(_editorial_box_marker(component))}\s*$",
        flags=re.IGNORECASE,
    )
    start_line = f"> {_editorial_block_start_marker(component)}"
    end_line = f"> {_editorial_block_end_marker(component)}"

    lines = content.splitlines()
    for idx, line in enumerate(lines):
        if not marker_line_re.match(line):
            continue

        if idx > 0 and lines[idx - 1].strip().lower() == start_line.lower():
            return content

        block_end = idx
        while block_end + 1 < len(lines) and lines[block_end + 1].lstrip().startswith(
            ">"
        ):
            block_end += 1

        lines.insert(idx, start_line)
        lines.insert(block_end + 2, end_line)
        return "\n".join(lines)

    return content


def _ensure_editorial_block_labels(content: str, component: str) -> str:
    """Ensure each component block contains canonical label markers."""
    if not content:
        return content

    lines = content.splitlines()
    block_range = _find_editorial_block_range(lines, component)
    if not block_range:
        return content

    start_idx, end_idx = block_range
    box_marker = _editorial_box_marker(component)
    label_marker = _editorial_block_label_marker(component)
    label_text = EDITORIAL_COMPONENT_LABELS.get(component, component)
    display_label_line = f"**Component:** {label_text}"

    box_idx = next(
        (
            idx
            for idx in range(start_idx, end_idx + 1)
            if _line_matches_editorial_marker(lines[idx], box_marker)
        ),
        -1,
    )
    label_marker_idx = next(
        (
            idx
            for idx in range(start_idx, end_idx + 1)
            if _line_matches_editorial_marker(lines[idx], label_marker)
        ),
        -1,
    )
    display_label_idx = next(
        (
            idx
            for idx in range(start_idx, end_idx + 1)
            if _line_matches_editorial_marker(lines[idx], display_label_line)
        ),
        -1,
    )

    if label_marker_idx == -1:
        insert_after = box_idx if box_idx != -1 else start_idx
        lines.insert(insert_after + 1, f"> {label_marker}")
        end_idx += 1
        label_marker_idx = insert_after + 1
        if box_idx > insert_after:
            box_idx += 1
        if display_label_idx > insert_after:
            display_label_idx += 1

    if display_label_idx == -1:
        insert_after = label_marker_idx
        lines.insert(insert_after + 1, f"> {display_label_line}")
        end_idx += 1

    return "\n".join(lines)


def _ensure_editorial_component_boxes(
    content: str, components_added: list[dict[str, str]]
) -> str:
    """Ensure each applied editorial component has a parse-friendly markdown box."""
    if not content or not components_added:
        return content

    updated_content = content
    for component_entry in components_added:
        updated_content = _wrap_existing_editorial_box_with_markers(
            updated_content,
            component_entry["component"],
        )
        updated_content = _ensure_editorial_block_labels(
            updated_content,
            component_entry["component"],
        )

    missing_components = [
        component_entry
        for component_entry in components_added
        if not _content_has_editorial_block(
            updated_content, component_entry["component"]
        )
    ]
    if not missing_components:
        return updated_content

    fallback_boxes = "\n\n".join(
        _build_editorial_metadata_box(component_entry)
        for component_entry in missing_components
    ).strip()
    if not fallback_boxes:
        return updated_content

    return f"{updated_content.strip()}\n\n{fallback_boxes}".strip()


def _sanitize_v2_editorial_augmentation(
    parsed: dict[str, Any], *, fallback_content: str
) -> dict[str, Any]:
    """Normalize final editorial augmentation output."""
    fallback_markdown = _ensure_markdown_section_headers(fallback_content)
    augmented_content = _safe_str(parsed.get("augmented_content"))
    if not augmented_content:
        augmented_content = fallback_markdown

    augmented_content = _remove_academic_conclusion_phrases(augmented_content)
    augmented_content = _ensure_markdown_section_headers(augmented_content)

    components_added: list[dict[str, str]] = []
    raw_components = parsed.get("components_added")
    if isinstance(raw_components, list):
        for item in raw_components:
            if not isinstance(item, dict):
                continue
            component = _normalize_editorial_component_name(
                _safe_str(item.get("component"))
            )
            if not component:
                continue
            components_added.append(
                {
                    "component": component,
                    "justification": _safe_str(item.get("justification")),
                    "placement": _safe_str(item.get("placement")),
                }
            )
            if len(components_added) >= 5:
                break

    if components_added:
        augmented_content = _ensure_editorial_component_boxes(
            augmented_content,
            components_added,
        )

    # Editorial augmentation should not collapse the core article body.
    fallback_word_count = len(_tokenize_similarity_words(fallback_markdown))
    augmented_word_count = len(_tokenize_similarity_words(augmented_content))
    if augmented_word_count < fallback_word_count:
        augmented_content = _ensure_editorial_component_boxes(
            fallback_markdown,
            components_added,
        )
        augmented_word_count = len(_tokenize_similarity_words(augmented_content))

    diagnostic_raw = _safe_dict(parsed.get("diagnostic"))
    diagnostic = {
        "cognitive_load": _sanitize_editorial_diagnostic_axis(
            diagnostic_raw.get("cognitive_load")
        ),
        "narrative_density": _sanitize_editorial_diagnostic_axis(
            diagnostic_raw.get("narrative_density")
        ),
        "emphasis_clarity": _sanitize_editorial_diagnostic_axis(
            diagnostic_raw.get("emphasis_clarity")
        ),
        "reading_behavior_risk": _sanitize_editorial_diagnostic_axis(
            diagnostic_raw.get("reading_behavior_risk")
        ),
    }

    augmentation_summary = _safe_str(parsed.get("augmentation_summary"))
    if not augmentation_summary:
        if components_added:
            component_names = ", ".join(item["component"] for item in components_added)
            augmentation_summary = (
                "Applied restrained editorial augmentation: " f"{component_names}."
            )
        else:
            augmentation_summary = (
                "No editorial augmentation added; the draft already read clearly."
            )

    augmentation_applied = (
        bool(components_added)
        and _normalize_markdown_for_comparison(augmented_content)
        != _normalize_markdown_for_comparison(fallback_markdown)
    )

    return {
        "augmented_content": augmented_content,
        "components_added": components_added,
        "diagnostic": diagnostic,
        "augmentation_summary": augmentation_summary,
        "augmentation_applied": augmentation_applied,
    }


def _sanitize_v2_quality_audit(parsed: dict[str, Any]) -> dict[str, Any]:
    """Normalize quality audit output."""
    overall_score = _safe_int(
        parsed.get("overall_score"), default=6, min_value=1, max_value=10
    )
    guideline_coverage_score = _safe_int(
        parsed.get("guideline_coverage_score"), default=6, min_value=1, max_value=10
    )
    informativeness_score = _safe_int(
        parsed.get("informativeness_score"), default=6, min_value=1, max_value=10
    )
    originality_score = _safe_int(
        parsed.get("originality_score"), default=6, min_value=1, max_value=10
    )
    too_close_to_source = _safe_bool(parsed.get("too_close_to_source"), default=False)

    required_revisions = _safe_string_list(parsed.get("required_revisions"))
    if not required_revisions and (
        overall_score < 8
        or guideline_coverage_score < 8
        or informativeness_score < 8
        or originality_score < 8
        or too_close_to_source
    ):
        required_revisions = [
            "Strengthen guideline alignment with clearer section-level intent.",
            "Add more concrete reader value and practical utility.",
            "Increase structural and phrasing distance from source.",
        ]

    quality_summary = _safe_str(parsed.get("quality_summary"))
    if not quality_summary:
        quality_summary = (
            "Quality audit completed with focus on guideline fit, informativeness, "
            "and structural originality."
        )

    return {
        "overall_score": overall_score,
        "guideline_coverage_score": guideline_coverage_score,
        "informativeness_score": informativeness_score,
        "originality_score": originality_score,
        "too_close_to_source": too_close_to_source,
        "required_revisions": required_revisions,
        "quality_summary": quality_summary,
    }


def _sanitize_v2_external_context(
    parsed: dict[str, Any],
    *,
    max_points: int,
    fallback_urls: list[str] | None = None,
) -> dict[str, Any]:
    """Normalize externally grounded context points for short-article enrichment."""
    points: list[dict[str, str]] = []
    raw_points = parsed.get("context_points")
    if isinstance(raw_points, list):
        for item in raw_points:
            if not isinstance(item, dict):
                continue
            insight = _safe_str(item.get("insight"))
            why_it_matters = _safe_str(item.get("why_it_matters"))
            source_url = _safe_str(item.get("source_url"))
            confidence = _safe_str(item.get("confidence")).lower()
            if confidence not in {"high", "medium"}:
                confidence = "medium"

            if not insight:
                continue
            points.append(
                {
                    "insight": insight,
                    "why_it_matters": why_it_matters,
                    "source_url": source_url,
                    "confidence": confidence,
                }
            )
            if len(points) >= max_points:
                break

    if not points and fallback_urls:
        for url in fallback_urls[:max_points]:
            if not _safe_str(url):
                continue
            points.append(
                {
                    "insight": "Supplemental external context was identified.",
                    "why_it_matters": "Can provide additional reader-facing depth for short source articles.",
                    "source_url": url,
                    "confidence": "medium",
                }
            )

    usage_note = _safe_str(parsed.get("usage_note"))
    if not usage_note:
        usage_note = (
            "Use external context sparingly and only where it clearly deepens reader value."
        )

    return {
        "context_points": points,
        "usage_note": usage_note,
    }


def _sanitize_v2_source_facts(
    parsed: dict[str, Any], *, max_facts: int = 18
) -> list[dict[str, str]]:
    """Normalize extracted source facts used for retention checks."""
    allowed_categories = {
        "numbers",
        "names",
        "amenities",
        "policies",
        "pricing",
        "logistics",
        "other",
    }
    facts: list[dict[str, str]] = []
    seen: set[str] = set()

    raw_facts = parsed.get("facts")
    if isinstance(raw_facts, list):
        for idx, item in enumerate(raw_facts, start=1):
            if not isinstance(item, dict):
                continue
            fact = _safe_str(item.get("fact"))
            if not fact:
                continue
            dedupe_key = fact.lower()
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            priority = _safe_str(item.get("priority")).lower()
            if priority not in {"high", "medium"}:
                priority = "medium"

            category = _safe_str(item.get("category")).lower()
            if category not in allowed_categories:
                category = "other"

            facts.append(
                {
                    "fact_id": _safe_str(item.get("fact_id")) or f"F{idx}",
                    "fact": fact,
                    "priority": priority,
                    "category": category,
                }
            )
            if len(facts) >= max_facts:
                break

    return facts


def _sanitize_v2_fact_coverage(
    parsed: dict[str, Any], source_facts: list[dict[str, str]]
) -> dict[str, Any]:
    """Normalize factual coverage audit output."""
    if not source_facts:
        return {
            "coverage_score": 10,
            "coverage_summary": "No source fact anchors were extracted for audit.",
            "covered_fact_ids": [],
            "missing_facts": [],
            "missing_count": 0,
            "missing_high_count": 0,
        }

    facts_by_id = {
        _safe_str(item.get("fact_id")): item
        for item in source_facts
        if _safe_str(item.get("fact_id"))
    }
    source_ids = set(facts_by_id.keys())

    covered_ids = {
        _safe_str(fact_id)
        for fact_id in parsed.get("covered_fact_ids", [])
        if _safe_str(fact_id)
    }
    covered_ids = {fact_id for fact_id in covered_ids if fact_id in source_ids}

    missing_facts: list[dict[str, str]] = []
    raw_missing = parsed.get("missing_facts")
    if isinstance(raw_missing, list):
        for item in raw_missing:
            if not isinstance(item, dict):
                continue
            fact_id = _safe_str(item.get("fact_id"))
            fact_text = _safe_str(item.get("fact"))
            priority = _safe_str(item.get("priority")).lower()
            if priority not in {"high", "medium"}:
                priority = "medium"
            reason = _safe_str(item.get("reason"))

            if not fact_text and fact_id in facts_by_id:
                fact_text = _safe_str(facts_by_id[fact_id].get("fact"))
            if not fact_id and fact_text:
                matched = next(
                    (
                        source_fact_id
                        for source_fact_id, source_fact in facts_by_id.items()
                        if _safe_str(source_fact.get("fact")) == fact_text
                    ),
                    "",
                )
                fact_id = matched
            if not fact_id:
                continue
            if not reason:
                reason = "Not clearly represented in rewritten draft."
            missing_facts.append(
                {
                    "fact_id": fact_id,
                    "fact": fact_text,
                    "priority": priority,
                    "reason": reason,
                }
            )

    missing_ids = {item["fact_id"] for item in missing_facts if item.get("fact_id")}
    uncovered_source_ids = source_ids - covered_ids
    for source_id in uncovered_source_ids:
        if source_id in missing_ids:
            continue
        source_fact = facts_by_id[source_id]
        if _safe_str(source_fact.get("priority")) != "high":
            continue
        missing_facts.append(
            {
                "fact_id": source_id,
                "fact": _safe_str(source_fact.get("fact")),
                "priority": "high",
                "reason": "High-priority source fact is not clearly retained.",
            }
        )

    coverage_score = _safe_int(
        parsed.get("coverage_score"), default=7, min_value=1, max_value=10
    )
    if not missing_facts and coverage_score < 8:
        coverage_score = 8

    coverage_summary = _safe_str(parsed.get("coverage_summary"))
    if not coverage_summary:
        coverage_summary = (
            "Fact coverage audit completed to ensure key source details were preserved."
        )

    missing_high_count = sum(
        1
        for item in missing_facts
        if _safe_str(item.get("priority")).lower() == "high"
    )

    return {
        "coverage_score": coverage_score,
        "coverage_summary": coverage_summary,
        "covered_fact_ids": sorted(covered_ids),
        "missing_facts": missing_facts,
        "missing_count": len(missing_facts),
        "missing_high_count": missing_high_count,
    }


def _should_force_v2_fact_repair(fact_coverage: dict[str, Any]) -> bool:
    """Return True when factual retention is below threshold."""
    return bool(
        _safe_int(
            fact_coverage.get("coverage_score"), default=7, min_value=1, max_value=10
        )
        < 8
        or _safe_int(
            fact_coverage.get("missing_high_count"),
            default=0,
            min_value=0,
            max_value=99,
        )
        > 0
        or _safe_int(
            fact_coverage.get("missing_count"), default=0, min_value=0, max_value=99
        )
        >= 3
    )


def _should_force_v2_second_pass(
    quality: dict[str, Any], ngram_overlap: float, *, overlap_threshold: float = 0.08
) -> bool:
    """Return True when rewrite quality is below enforced bar."""
    return bool(
        quality.get("too_close_to_source")
        or ngram_overlap >= overlap_threshold
        or _safe_int(
            quality.get("overall_score"), default=6, min_value=1, max_value=10
        )
        < 8
        or _safe_int(
            quality.get("guideline_coverage_score"),
            default=6,
            min_value=1,
            max_value=10,
        )
        < 8
        or _safe_int(
            quality.get("informativeness_score"), default=6, min_value=1, max_value=10
        )
        < 8
        or _safe_int(
            quality.get("originality_score"), default=6, min_value=1, max_value=10
        )
        < 7
    )


async def extract_article(request: ExtractRequest) -> JSONResponse:
    """
    Fetch an article URL and extract title + content using Gemini.

    Accepts: { "url": "https://example.com/article" }
    Returns: { "title": "...", "content": "...", "raw_response": "...", "source_url": "..." }
    """
    url = request.url.strip()
    selected_model_name = _resolve_url2blog_model(request.model_name)
    include_debug = request.include_debug
    if not url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400, detail="URL must start with http:// or https://"
        )

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
    prompt = EXTRACT_PROMPT + raw_text

    logger.info("URL2Blog Stage 1: sending prompt to Gemini (%d chars)", len(raw_text))
    parsed, raw_response, parse_error = _invoke_json_llm_best_effort(
        prompt=prompt,
        max_tokens=8192,
        temperature=0.1,
        model_name=selected_model_name,
        allow_truncated_repair=True,
    )
    if not raw_response and parse_error:
        logger.warning("URL2Blog Stage 1 extraction failed: %s", parse_error)

    stage_trace: list[dict[str, Any]] = []
    if include_debug:
        stage_trace.append(
            {
                "stage": "stage1_extract_article",
                "model_name": selected_model_name,
                "max_tokens": 8192,
                "temperature": 0.1,
                "input": {
                    "url": url,
                    "raw_text": raw_text,
                    "raw_text_length": len(raw_text),
                },
                "prompt": prompt,
                "raw_response": raw_response,
                "parsed": parsed,
                "parse_error": parse_error,
            }
        )

    # Phase 2: Translate if not English
    translated = None
    translation_skipped = False
    translation_error = None
    translation_prompt = ""
    translation_raw_response = ""

    if parsed and not parse_error:
        language = (parsed.get("language") or "").strip()
        is_english = language.lower() in ("english", "en", "")

        if is_english:
            translation_skipped = True
            logger.info("URL2Blog: article already in English, skipping translation")
            if include_debug:
                stage_trace.append(
                    {
                        "stage": "stage1_translate_article",
                        "model_name": selected_model_name,
                        "max_tokens": 8192,
                        "temperature": 0.1,
                        "input": {
                            "source_language": language or "English",
                            "title": parsed.get("title", ""),
                            "content": parsed.get("content", ""),
                        },
                        "prompt": None,
                        "raw_response": "",
                        "parsed": None,
                        "parse_error": None,
                        "skipped": True,
                        "skip_reason": "Source language already English.",
                    }
                )
        else:
            logger.info("URL2Blog: translating from %s to English", language)
            translation_prompt = TRANSLATE_PROMPT.format(
                source_language=language,
                title=parsed.get("title", ""),
                content=parsed.get("content", ""),
            )
            translated, translation_raw_response, translation_error = (
                _invoke_json_llm_best_effort(
                    prompt=translation_prompt,
                    max_tokens=8192,
                    temperature=0.1,
                    model_name=selected_model_name,
                    allow_truncated_repair=True,
                )
            )
            if include_debug:
                stage_trace.append(
                    {
                        "stage": "stage1_translate_article",
                        "model_name": selected_model_name,
                        "max_tokens": 8192,
                        "temperature": 0.1,
                        "input": {
                            "source_language": language,
                            "title": parsed.get("title", ""),
                            "content": parsed.get("content", ""),
                        },
                        "prompt": translation_prompt,
                        "raw_response": translation_raw_response,
                        "parsed": translated,
                        "parse_error": translation_error,
                        "skipped": False,
                    }
                )
            if translation_error and not translated:
                logger.warning(
                    "URL2Blog translation failed to parse JSON: %s", translation_error
                )

    payload: dict[str, Any] = {
        "message": "URL2Blog stage 1 completed",
        "source_url": url,
        "raw_text_length": len(raw_text),
        "raw_response": raw_response,
        "parsed": parsed,
        "parse_error": parse_error,
        "translated": translated,
        "translation_skipped": translation_skipped,
        "translation_error": translation_error,
    }
    if include_debug:
        payload["debug"] = {"trace": stage_trace}

    return JSONResponse(payload)


async def classify_article_type(request: Stage2ClassifyRequest) -> JSONResponse:
    """
    Classify Stage 1 article output into one article type.

    Uses article type name/definition reference data from shared storage and
    returns the selected article type id/name for guideline lookup.
    """
    title = request.title.strip()
    content = request.content.strip()
    selected_model_name = _resolve_url2blog_model(request.model_name)
    include_debug = request.include_debug
    if not title and not content:
        raise HTTPException(status_code=400, detail="Title or content is required")
    if len(content) < 50:
        raise HTTPException(
            status_code=422, detail="Content too short for reliable classification"
        )

    article_types = read_article_type_name_definitions()
    if not article_types:
        raise HTTPException(
            status_code=500, detail="No article types available for classification"
        )

    article_types_for_prompt = "\n".join(
        f"- {item['name']}: {item['definition']}" for item in article_types
    )
    content_for_prompt = content[:15_000]

    prompt = CLASSIFY_ARTICLE_TYPE_PROMPT.format(
        article_types=article_types_for_prompt,
        title=title,
        content=content_for_prompt,
    )

    logger.info(
        "URL2Blog Stage 2: classifying article type (%d chars, %d types)",
        len(content_for_prompt),
        len(article_types),
    )
    parsed, raw_response = _invoke_json_llm(
        prompt=prompt,
        max_tokens=1024,
        temperature=0.1,
        model_name=selected_model_name,
    )

    selected_name = str(parsed.get("classification", "")).strip()
    if not selected_name:
        raise HTTPException(
            status_code=500,
            detail="Classification response missing required 'classification' field.",
        )

    selected_type = next(
        (item for item in article_types if item["name"] == selected_name),
        None,
    )
    if not selected_type:
        normalized_selected = _normalize_article_type_name(selected_name)
        selected_type = next(
            (
                item
                for item in article_types
                if _normalize_article_type_name(item["name"]) == normalized_selected
            ),
            None,
        )

    if not selected_type:
        raise HTTPException(
            status_code=500,
            detail=f"LLM selected unsupported article type: '{selected_name}'",
        )

    article_type_row = get_article_type_by_name(selected_type["name"])
    if not article_type_row:
        raise HTTPException(status_code=404, detail="Selected article type not found")

    try:
        confidence = float(parsed.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0

    reasoning = _enforce_editorial_reasoning(
        str(parsed.get("reasoning", "")).strip(),
        article_type_row["name"],
    )

    payload: dict[str, Any] = {
        "message": "URL2Blog stage 2 classification completed",
        "classification": {
            "id": article_type_row["id"],
            "name": article_type_row["name"],
            "definition": article_type_row["definition"],
            "confidence": confidence,
            "reasoning": reasoning,
        },
        "article_types_considered": len(article_types),
        "raw_response": raw_response,
    }
    if include_debug:
        payload["debug"] = {
            "trace": [
                {
                    "stage": "stage2_classification",
                    "model_name": selected_model_name,
                    "max_tokens": 1024,
                    "temperature": 0.1,
                    "input": {
                        "title": title,
                        "content": content_for_prompt,
                        "source_url": request.source_url,
                        "language": request.language,
                        "article_types": article_types,
                    },
                    "prompt": prompt,
                    "raw_response": raw_response,
                    "parsed": parsed,
                    "output": {
                        "id": article_type_row["id"],
                        "name": article_type_row["name"],
                        "definition": article_type_row["definition"],
                        "confidence": confidence,
                        "reasoning": reasoning,
                    },
                }
            ]
        }

    return JSONResponse(payload)


@router.post("/pipeline-v2")
async def pipeline_v2(request: PipelineV2Request) -> JSONResponse:
    """
    Simplified URL2Blog pipeline:
    extract -> classify -> guideline-based rewrite.
    """
    url = request.url.strip()
    selected_model_name = _resolve_url2blog_model(request.model_name)
    execution_profile = _resolve_execution_profile(request.execution_profile)
    is_lean_profile = execution_profile == "lean"
    include_debug = request.include_debug
    narrative_focus = _safe_str(request.narrative_focus)
    enable_web_enrichment = request.enable_web_enrichment and not is_lean_profile
    enable_editorial_augmentation = (
        request.enable_editorial_augmentation and not is_lean_profile
    )
    json_parse_metrics: dict[str, Any] = {
        "total_parse_failures": 0,
        "recovered_calls": 0,
        "recovered_parse_failures": 0,
        "failures_by_stage": {},
    }
    max_external_context_items = _safe_int(
        request.max_external_context_items,
        default=DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS,
        min_value=1,
        max_value=5,
    )
    max_length_expansion_passes = (
        1 if is_lean_profile else MAX_LENGTH_EXPANSION_PASSES
    )
    stage_trace: list[dict[str, Any]] = []

    def _append_stage_trace(
        *,
        stage: str,
        model_name: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
        input_payload: Any | None = None,
        prompt: str | None = None,
        raw_response: str | None = None,
        parsed: Any | None = None,
        output: Any | None = None,
        grounded_urls: list[str] | None = None,
        error: str | None = None,
    ) -> None:
        if not include_debug:
            return

        entry: dict[str, Any] = {"stage": stage}
        if model_name is not None:
            entry["model_name"] = model_name
        if max_tokens is not None:
            entry["max_tokens"] = max_tokens
        if temperature is not None:
            entry["temperature"] = temperature
        if input_payload is not None:
            entry["input"] = input_payload
        if prompt is not None:
            entry["prompt"] = prompt
        if raw_response is not None:
            entry["raw_response"] = raw_response
        if parsed is not None:
            entry["parsed"] = parsed
        if output is not None:
            entry["output"] = output
        if grounded_urls is not None:
            entry["grounded_urls"] = grounded_urls
        if error:
            entry["error"] = error

        stage_trace.append(entry)
    if not url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400, detail="URL must start with http:// or https://"
        )
    run_id = str(uuid4())
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": "stage_1",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )

    # Reuse existing extraction logic.
    stage1_response = await extract_article(
        ExtractRequest(
            url=url,
            model_name=selected_model_name,
            include_debug=include_debug,
        )
    )
    stage1_payload = json.loads(stage1_response.body.decode("utf-8"))
    write_stage_result(
        run_id,
        "stage_1",
        {"created_at": _now_iso(), "data": stage1_payload},
    )
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": "stage_2",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )
    if include_debug:
        stage1_debug = _safe_dict(stage1_payload.get("debug"))
        stage1_trace = stage1_debug.get("trace")
        if isinstance(stage1_trace, list):
            for entry in stage1_trace:
                if isinstance(entry, dict):
                    stage_trace.append(entry)
    parsed_article = _safe_dict(stage1_payload.get("parsed"))

    if not parsed_article:
        raise HTTPException(
            status_code=500,
            detail=stage1_payload.get("parse_error")
            or "Stage 1 returned no parsed article content.",
        )

    translated_article = _safe_dict(stage1_payload.get("translated"))
    translation_skipped = _safe_bool(
        stage1_payload.get("translation_skipped"), default=False
    )
    was_translated = not translation_skipped and bool(translated_article)

    normalized_title = (
        _safe_str(translated_article.get("title"))
        if was_translated
        else _safe_str(parsed_article.get("title"))
    )
    normalized_content = (
        _safe_str(translated_article.get("content"))
        if was_translated
        else _safe_str(parsed_article.get("content"))
    )
    if not normalized_content:
        raise HTTPException(
            status_code=422, detail="No article content available after extraction."
        )
    source_word_count = len(_tokenize_similarity_words(normalized_content))
    min_expanded_word_target = _resolve_min_expanded_word_target(source_word_count)

    normalized_language = (
        "English"
        if was_translated
        else _normalize_language_name(
            _safe_str(parsed_article.get("language")) or "English"
        )
    )

    # Reuse existing classification logic.
    with _json_parse_tracking_scope(json_parse_metrics, "stage2_classification"):
        stage2_response = await classify_article_type(
            Stage2ClassifyRequest(
                title=normalized_title,
                content=normalized_content,
                source_url=url,
                language=normalized_language,
                model_name=selected_model_name,
                include_debug=include_debug,
            )
        )
    stage2_payload = json.loads(stage2_response.body.decode("utf-8"))
    write_stage_result(
        run_id,
        "stage_2",
        {"created_at": _now_iso(), "data": stage2_payload},
    )
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": "rewrite",
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )
    if include_debug:
        stage2_debug = _safe_dict(stage2_payload.get("debug"))
        stage2_trace = stage2_debug.get("trace")
        if isinstance(stage2_trace, list):
            for entry in stage2_trace:
                if isinstance(entry, dict):
                    stage_trace.append(entry)
    classification = _safe_dict(stage2_payload.get("classification"))

    article_type_id: int | None = None
    raw_type_id = classification.get("id")
    if isinstance(raw_type_id, int):
        article_type_id = raw_type_id
    elif isinstance(raw_type_id, str) and raw_type_id.strip().isdigit():
        article_type_id = int(raw_type_id.strip())

    guideline_payload = {
        "id": article_type_id or 0,
        "name": _safe_str(classification.get("name")),
        "guideline": "",
        "title_guideline": "",
    }

    if article_type_id is not None:
        article_type_row = get_article_type_by_id(article_type_id)
        if article_type_row:
            guideline_payload = {
                "id": article_type_row["id"],
                "name": article_type_row["name"],
                "guideline": article_type_row.get("guideline") or "",
                "title_guideline": article_type_row.get("title_guideline") or "",
            }

    external_context_points: list[dict[str, str]] = []
    external_context_usage_note = ""
    external_context_raw_response = ""
    external_context_grounded_urls: list[str] = []
    short_article_enrichment_applied = False
    external_context_parsed: dict[str, Any] = {}
    external_context: dict[str, Any] = {
        "context_points": [],
        "usage_note": "",
    }

    should_enrich_short_article = (
        enable_web_enrichment and source_word_count < SHORT_ARTICLE_WORD_THRESHOLD
    )
    if should_enrich_short_article:
        enrichment_prompt = (
            V2_SHORT_ARTICLE_ENRICHMENT_PROMPT.replace(
                "{max_points}", str(max_external_context_items)
            )
            .replace("{source_url}", url)
            .replace("{source_title}", normalized_title)
            .replace("{source_content}", normalized_content[:20_000])
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
        )
        (
            external_context_parsed,
            external_context_raw_response,
            external_context_grounded_urls,
        ) = _invoke_google_grounded_json(
            enrichment_prompt,
            max_tokens=1024,
            temperature=0.05,
            model_name=selected_model_name,
        )
        external_context = _sanitize_v2_external_context(
            external_context_parsed,
            max_points=max_external_context_items,
            fallback_urls=external_context_grounded_urls,
        )
        external_context_points = external_context["context_points"]
        external_context_usage_note = external_context["usage_note"]
        short_article_enrichment_applied = bool(external_context_points)
        _append_stage_trace(
            stage="short_article_enrichment",
            model_name=selected_model_name,
            max_tokens=1024,
            temperature=0.05,
            input_payload={
                "source_url": url,
                "source_title": normalized_title,
                "source_content": normalized_content[:20_000],
                "article_type": classification,
                "narrative_focus": narrative_focus,
                "max_external_context_items": max_external_context_items,
            },
            prompt=enrichment_prompt,
            raw_response=external_context_raw_response,
            parsed=external_context_parsed,
            output=external_context,
            grounded_urls=external_context_grounded_urls,
        )
    else:
        _append_stage_trace(
            stage="short_article_enrichment",
            model_name=selected_model_name,
            max_tokens=1024,
            temperature=0.05,
            input_payload={
                "source_word_count": source_word_count,
                "threshold": SHORT_ARTICLE_WORD_THRESHOLD,
                "enable_web_enrichment": enable_web_enrichment,
            },
            output={
                "skipped": True,
                "reason": "Short-article enrichment conditions not met.",
            },
        )

    external_context_for_prompt = (
        json.dumps(external_context_points, ensure_ascii=False, indent=2)
        if external_context_points
        else "No external context collected."
    )

    source_fact_anchors: list[dict[str, str]] = []
    source_facts_raw_response = ""
    source_facts_prompt = (
        V2_SOURCE_FACTS_EXTRACTION_PROMPT.replace("{max_facts}", "18")
        .replace("{source_title}", normalized_title)
        .replace("{source_content}", normalized_content[:20_000])
    )
    source_facts_parsed, source_facts_raw_response = _invoke_json_llm_tracked(
        prompt=source_facts_prompt,
        stage_name="source_facts_extraction",
        parse_metrics=json_parse_metrics,
        max_tokens=1536,
        temperature=0.05,
        model_name=selected_model_name,
    )
    source_fact_anchors = _sanitize_v2_source_facts(source_facts_parsed, max_facts=18)
    _append_stage_trace(
        stage="source_facts_extraction",
        model_name=selected_model_name,
        max_tokens=1536,
        temperature=0.05,
        input_payload={
            "source_title": normalized_title,
            "source_content": normalized_content[:20_000],
            "max_facts": 18,
        },
        prompt=source_facts_prompt,
        raw_response=source_facts_raw_response,
        parsed=source_facts_parsed,
        output={"source_fact_anchors": source_fact_anchors},
    )

    rewrite_prompt = (
        V2_GUIDELINE_REWRITE_PROMPT.replace("{title}", normalized_title)
        .replace("{content}", normalized_content[:20_000])
        .replace(
            "{article_type}",
            json.dumps(classification, ensure_ascii=False, indent=2),
        )
        .replace(
            "{guideline}",
            guideline_payload["guideline"] or "No guideline provided.",
        )
        .replace(
            "{title_guideline}",
            guideline_payload["title_guideline"] or "No title guideline provided.",
        )
        .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
        .replace(
            "{narrative_focus}",
            narrative_focus or "No additional narrative focus provided.",
        )
        .replace("{external_context}", external_context_for_prompt)
    )
    rewrite_parsed, rewrite_raw_response = _invoke_json_llm_tracked(
        prompt=rewrite_prompt,
        stage_name="guideline_rewrite_initial",
        parse_metrics=json_parse_metrics,
        max_tokens=6144,
        temperature=0.1,
        model_name=selected_model_name,
    )
    rewrite = _sanitize_v2_guideline_rewrite(
        rewrite_parsed,
        fallback_title=normalized_title,
        fallback_content=normalized_content,
    )
    _append_stage_trace(
        stage="guideline_rewrite_initial",
        model_name=selected_model_name,
        max_tokens=6144,
        temperature=0.1,
        input_payload={
            "title": normalized_title,
            "content": normalized_content[:20_000],
            "article_type": classification,
            "guideline": guideline_payload["guideline"] or "No guideline provided.",
            "title_guideline": guideline_payload["title_guideline"]
            or "No title guideline provided.",
            "narrative_focus": narrative_focus,
            "external_context": external_context_points,
        },
        prompt=rewrite_prompt,
        raw_response=rewrite_raw_response,
        parsed=rewrite_parsed,
        output=rewrite,
    )

    source_words = _tokenize_similarity_words(normalized_content)
    rewritten_words = _tokenize_similarity_words(rewrite["improved_content"])
    ngram_overlap = _ngram_overlap_ratio(source_words, rewritten_words, n=10)

    quality_prompt = (
        V2_QUALITY_AUDIT_PROMPT.replace("{source_title}", normalized_title)
        .replace("{source_content}", normalized_content[:20_000])
        .replace("{rewritten_title}", rewrite["improved_title"])
        .replace("{rewritten_content}", rewrite["improved_content"][:20_000])
        .replace(
            "{article_type}",
            json.dumps(classification, ensure_ascii=False, indent=2),
        )
        .replace(
            "{guideline}",
            guideline_payload["guideline"] or "No guideline provided.",
        )
        .replace(
            "{title_guideline}",
            guideline_payload["title_guideline"] or "No title guideline provided.",
        )
        .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
        .replace("{ngram_overlap}", f"{ngram_overlap:.3f}")
        .replace(
            "{narrative_focus}",
            narrative_focus or "No additional narrative focus provided.",
        )
        .replace("{external_context}", external_context_for_prompt)
    )
    quality_parsed, quality_raw_response = _invoke_json_llm_tracked(
        prompt=quality_prompt,
        stage_name="quality_audit_initial",
        parse_metrics=json_parse_metrics,
        max_tokens=1024,
        temperature=0.05,
        model_name=selected_model_name,
    )
    quality = _sanitize_v2_quality_audit(quality_parsed)
    _append_stage_trace(
        stage="quality_audit_initial",
        model_name=selected_model_name,
        max_tokens=1024,
        temperature=0.05,
        input_payload={
            "source_title": normalized_title,
            "source_content": normalized_content[:20_000],
            "rewritten_title": rewrite["improved_title"],
            "rewritten_content": rewrite["improved_content"][:20_000],
            "article_type": classification,
            "guideline": guideline_payload["guideline"] or "No guideline provided.",
            "title_guideline": guideline_payload["title_guideline"]
            or "No title guideline provided.",
            "ngram_overlap": round(ngram_overlap, 3),
            "narrative_focus": narrative_focus,
            "external_context": external_context_points,
        },
        prompt=quality_prompt,
        raw_response=quality_raw_response,
        parsed=quality_parsed,
        output=quality,
    )

    second_pass_applied = False
    repair_raw_response = ""
    if not is_lean_profile and _should_force_v2_second_pass(quality, ngram_overlap):
        second_pass_applied = True
        previous_title = rewrite["improved_title"]
        previous_content = rewrite["improved_content"]
        repair_prompt = (
            V2_REWRITE_REPAIR_PROMPT.replace("{source_title}", normalized_title)
            .replace("{source_content}", normalized_content[:20_000])
            .replace("{previous_title}", previous_title)
            .replace("{previous_content}", previous_content[:20_000])
            .replace(
                "{required_revisions}",
                json.dumps(
                    quality["required_revisions"],
                    ensure_ascii=False,
                    indent=2,
                ),
            )
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{guideline}",
                guideline_payload["guideline"] or "No guideline provided.",
            )
            .replace(
                "{title_guideline}",
                guideline_payload["title_guideline"] or "No title guideline provided.",
            )
            .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
            .replace("{external_context}", external_context_for_prompt)
        )
        repair_parsed, repair_raw_response = _invoke_json_llm_tracked(
            prompt=repair_prompt,
            stage_name="rewrite_repair_second_pass",
            parse_metrics=json_parse_metrics,
            max_tokens=6144,
            temperature=0.1,
            model_name=selected_model_name,
        )
        rewrite = _sanitize_v2_guideline_rewrite(
            repair_parsed,
            fallback_title=previous_title,
            fallback_content=previous_content,
        )
        _append_stage_trace(
            stage="rewrite_repair_second_pass",
            model_name=selected_model_name,
            max_tokens=6144,
            temperature=0.1,
            input_payload={
                "source_title": normalized_title,
                "source_content": normalized_content[:20_000],
                "previous_title": previous_title,
                "previous_content": previous_content[:20_000],
                "required_revisions": quality["required_revisions"],
                "article_type": classification,
                "guideline": guideline_payload["guideline"]
                or "No guideline provided.",
                "title_guideline": guideline_payload["title_guideline"]
                or "No title guideline provided.",
                "narrative_focus": narrative_focus,
                "external_context": external_context_points,
            },
            prompt=repair_prompt,
            raw_response=repair_raw_response,
            parsed=repair_parsed,
            output=rewrite,
        )

        rewritten_words = _tokenize_similarity_words(rewrite["improved_content"])
        ngram_overlap = _ngram_overlap_ratio(source_words, rewritten_words, n=10)
        quality_prompt = (
            V2_QUALITY_AUDIT_PROMPT.replace("{source_title}", normalized_title)
            .replace("{source_content}", normalized_content[:20_000])
            .replace("{rewritten_title}", rewrite["improved_title"])
            .replace("{rewritten_content}", rewrite["improved_content"][:20_000])
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{guideline}",
                guideline_payload["guideline"] or "No guideline provided.",
            )
            .replace(
                "{title_guideline}",
                guideline_payload["title_guideline"] or "No title guideline provided.",
            )
            .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
            .replace("{ngram_overlap}", f"{ngram_overlap:.3f}")
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
            .replace("{external_context}", external_context_for_prompt)
        )
        quality_parsed, quality_raw_response = _invoke_json_llm_tracked(
            prompt=quality_prompt,
            stage_name="quality_audit_after_second_pass",
            parse_metrics=json_parse_metrics,
            max_tokens=1024,
            temperature=0.05,
            model_name=selected_model_name,
        )
        quality = _sanitize_v2_quality_audit(quality_parsed)
        _append_stage_trace(
            stage="quality_audit_after_second_pass",
            model_name=selected_model_name,
            max_tokens=1024,
            temperature=0.05,
            input_payload={
                "source_title": normalized_title,
                "source_content": normalized_content[:20_000],
                "rewritten_title": rewrite["improved_title"],
                "rewritten_content": rewrite["improved_content"][:20_000],
                "article_type": classification,
                "guideline": guideline_payload["guideline"]
                or "No guideline provided.",
                "title_guideline": guideline_payload["title_guideline"]
                or "No title guideline provided.",
                "ngram_overlap": round(ngram_overlap, 3),
                "narrative_focus": narrative_focus,
                "external_context": external_context_points,
            },
            prompt=quality_prompt,
            raw_response=quality_raw_response,
            parsed=quality_parsed,
            output=quality,
        )
    else:
        _append_stage_trace(
            stage="rewrite_repair_second_pass",
            model_name=selected_model_name,
            max_tokens=6144,
            temperature=0.1,
            output={
                "skipped": True,
                "reason": "Initial quality/originality checks passed.",
            },
        )

    fact_coverage = _sanitize_v2_fact_coverage({}, source_fact_anchors)
    fact_coverage_raw_response = ""
    fact_repair_applied = False
    fact_repair_raw_response = ""
    length_expansion_applied = False
    length_expansion_passes = 0
    length_expansion_summary = ""
    length_expansion_raw_response = ""

    if source_fact_anchors:
        fact_coverage_prompt = (
            V2_FACT_COVERAGE_AUDIT_PROMPT.replace(
                "{source_facts}",
                json.dumps(source_fact_anchors, ensure_ascii=False, indent=2),
            )
            .replace("{rewritten_title}", rewrite["improved_title"])
            .replace("{rewritten_content}", rewrite["improved_content"][:20_000])
        )
        fact_coverage_parsed, fact_coverage_raw_response = _invoke_json_llm_tracked(
            prompt=fact_coverage_prompt,
            stage_name="fact_coverage_audit_initial",
            parse_metrics=json_parse_metrics,
            max_tokens=1536,
            temperature=0.05,
            model_name=selected_model_name,
        )
        fact_coverage = _sanitize_v2_fact_coverage(
            fact_coverage_parsed, source_fact_anchors
        )
        _append_stage_trace(
            stage="fact_coverage_audit_initial",
            model_name=selected_model_name,
            max_tokens=1536,
            temperature=0.05,
            input_payload={
                "source_facts": source_fact_anchors,
                "rewritten_title": rewrite["improved_title"],
                "rewritten_content": rewrite["improved_content"][:20_000],
            },
            prompt=fact_coverage_prompt,
            raw_response=fact_coverage_raw_response,
            parsed=fact_coverage_parsed,
            output=fact_coverage,
        )

        if not is_lean_profile and _should_force_v2_fact_repair(fact_coverage):
            fact_repair_applied = True
            previous_title = rewrite["improved_title"]
            previous_content = rewrite["improved_content"]
            fact_repair_prompt = (
                V2_FACT_REPAIR_PROMPT.replace("{source_title}", normalized_title)
                .replace("{source_content}", normalized_content[:20_000])
                .replace("{rewritten_title}", previous_title)
                .replace("{rewritten_content}", previous_content[:20_000])
                .replace(
                    "{missing_facts}",
                    json.dumps(
                        fact_coverage["missing_facts"],
                        ensure_ascii=False,
                        indent=2,
                    ),
                )
                .replace(
                    "{article_type}",
                    json.dumps(classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    "{guideline}",
                    guideline_payload["guideline"] or "No guideline provided.",
                )
                .replace(
                    "{title_guideline}",
                    guideline_payload["title_guideline"] or "No title guideline provided.",
                )
                .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
                .replace(
                    "{narrative_focus}",
                    narrative_focus or "No additional narrative focus provided.",
                )
                .replace("{external_context}", external_context_for_prompt)
            )
            fact_repair_parsed, fact_repair_raw_response = _invoke_json_llm_tracked(
                prompt=fact_repair_prompt,
                stage_name="fact_repair",
                parse_metrics=json_parse_metrics,
                max_tokens=6144,
                temperature=0.1,
                model_name=selected_model_name,
            )
            rewrite = _sanitize_v2_guideline_rewrite(
                fact_repair_parsed,
                fallback_title=previous_title,
                fallback_content=previous_content,
            )
            _append_stage_trace(
                stage="fact_repair",
                model_name=selected_model_name,
                max_tokens=6144,
                temperature=0.1,
                input_payload={
                    "source_title": normalized_title,
                    "source_content": normalized_content[:20_000],
                    "rewritten_title": previous_title,
                    "rewritten_content": previous_content[:20_000],
                    "missing_facts": fact_coverage["missing_facts"],
                    "article_type": classification,
                    "guideline": guideline_payload["guideline"]
                    or "No guideline provided.",
                    "title_guideline": guideline_payload["title_guideline"]
                    or "No title guideline provided.",
                    "narrative_focus": narrative_focus,
                    "external_context": external_context_points,
                },
                prompt=fact_repair_prompt,
                raw_response=fact_repair_raw_response,
                parsed=fact_repair_parsed,
                output=rewrite,
            )

            rewritten_words = _tokenize_similarity_words(rewrite["improved_content"])
            ngram_overlap = _ngram_overlap_ratio(source_words, rewritten_words, n=10)
            quality_prompt = (
                V2_QUALITY_AUDIT_PROMPT.replace("{source_title}", normalized_title)
                .replace("{source_content}", normalized_content[:20_000])
                .replace("{rewritten_title}", rewrite["improved_title"])
                .replace("{rewritten_content}", rewrite["improved_content"][:20_000])
                .replace(
                    "{article_type}",
                    json.dumps(classification, ensure_ascii=False, indent=2),
                )
                .replace(
                    "{guideline}",
                    guideline_payload["guideline"] or "No guideline provided.",
                )
                .replace(
                    "{title_guideline}",
                    guideline_payload["title_guideline"]
                    or "No title guideline provided.",
                )
                .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
                .replace("{ngram_overlap}", f"{ngram_overlap:.3f}")
                .replace(
                    "{narrative_focus}",
                    narrative_focus or "No additional narrative focus provided.",
                )
                .replace("{external_context}", external_context_for_prompt)
            )
            quality_parsed, quality_raw_response = _invoke_json_llm_tracked(
                prompt=quality_prompt,
                stage_name="quality_audit_after_fact_repair",
                parse_metrics=json_parse_metrics,
                max_tokens=1024,
                temperature=0.05,
                model_name=selected_model_name,
            )
            quality = _sanitize_v2_quality_audit(quality_parsed)
            _append_stage_trace(
                stage="quality_audit_after_fact_repair",
                model_name=selected_model_name,
                max_tokens=1024,
                temperature=0.05,
                input_payload={
                    "source_title": normalized_title,
                    "source_content": normalized_content[:20_000],
                    "rewritten_title": rewrite["improved_title"],
                    "rewritten_content": rewrite["improved_content"][:20_000],
                    "article_type": classification,
                    "guideline": guideline_payload["guideline"]
                    or "No guideline provided.",
                    "title_guideline": guideline_payload["title_guideline"]
                    or "No title guideline provided.",
                    "ngram_overlap": round(ngram_overlap, 3),
                    "narrative_focus": narrative_focus,
                    "external_context": external_context_points,
                },
                prompt=quality_prompt,
                raw_response=quality_raw_response,
                parsed=quality_parsed,
                output=quality,
            )

            fact_coverage_prompt = (
                V2_FACT_COVERAGE_AUDIT_PROMPT.replace(
                    "{source_facts}",
                    json.dumps(source_fact_anchors, ensure_ascii=False, indent=2),
                )
                .replace("{rewritten_title}", rewrite["improved_title"])
                .replace("{rewritten_content}", rewrite["improved_content"][:20_000])
            )
            fact_coverage_parsed, fact_coverage_raw_response = _invoke_json_llm_tracked(
                prompt=fact_coverage_prompt,
                stage_name="fact_coverage_audit_after_fact_repair",
                parse_metrics=json_parse_metrics,
                max_tokens=1536,
                temperature=0.05,
                model_name=selected_model_name,
            )
            fact_coverage = _sanitize_v2_fact_coverage(
                fact_coverage_parsed, source_fact_anchors
            )
            _append_stage_trace(
                stage="fact_coverage_audit_after_fact_repair",
                model_name=selected_model_name,
                max_tokens=1536,
                temperature=0.05,
                input_payload={
                    "source_facts": source_fact_anchors,
                    "rewritten_title": rewrite["improved_title"],
                    "rewritten_content": rewrite["improved_content"][:20_000],
                },
                prompt=fact_coverage_prompt,
                raw_response=fact_coverage_raw_response,
                parsed=fact_coverage_parsed,
                output=fact_coverage,
            )
        else:
            _append_stage_trace(
                stage="fact_repair",
                model_name=selected_model_name,
                max_tokens=6144,
                temperature=0.1,
                output={
                    "skipped": True,
                    "reason": "Factual coverage met threshold.",
                    "fact_coverage_score": fact_coverage["coverage_score"],
                },
            )
    else:
        _append_stage_trace(
            stage="fact_coverage_audit_initial",
            model_name=selected_model_name,
            max_tokens=1536,
            temperature=0.05,
            output={
                "skipped": True,
                "reason": "No source facts extracted.",
            },
        )

    rewritten_words = _tokenize_similarity_words(rewrite["improved_content"])
    rewritten_word_count = len(rewritten_words)
    source_facts_for_prompt = (
        json.dumps(source_fact_anchors, ensure_ascii=False, indent=2)
        if source_fact_anchors
        else "No source facts extracted."
    )

    while (
        rewritten_word_count < min_expanded_word_target
        and length_expansion_passes < max_length_expansion_passes
    ):
        expansion_prompt = (
            V2_LENGTH_EXPANSION_PROMPT.replace("{source_title}", normalized_title)
            .replace("{source_content}", normalized_content[:20_000])
            .replace("{rewritten_title}", rewrite["improved_title"])
            .replace("{rewritten_content}", rewrite["improved_content"][:20_000])
            .replace("{current_word_count}", str(rewritten_word_count))
            .replace("{source_word_count}", str(source_word_count))
            .replace("{min_word_target}", str(min_expanded_word_target))
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{guideline}",
                guideline_payload["guideline"] or "No guideline provided.",
            )
            .replace(
                "{title_guideline}",
                guideline_payload["title_guideline"] or "No title guideline provided.",
            )
            .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
            .replace("{external_context}", external_context_for_prompt)
            .replace("{source_facts}", source_facts_for_prompt)
        )
        stage_name = f"length_expansion_pass_{length_expansion_passes + 1}"
        try:
            expansion_parsed, length_expansion_raw_response = _invoke_json_llm_tracked(
                prompt=expansion_prompt,
                stage_name=stage_name,
                parse_metrics=json_parse_metrics,
                max_tokens=6144,
                temperature=0.1,
                model_name=selected_model_name,
            )
        except HTTPException as exc:
            logger.warning("URL2Blog length expansion failed: %s", exc.detail)
            _append_stage_trace(
                stage=stage_name,
                model_name=selected_model_name,
                max_tokens=6144,
                temperature=0.1,
                input_payload={
                    "source_title": normalized_title,
                    "source_content": normalized_content[:20_000],
                    "rewritten_title": rewrite["improved_title"],
                    "rewritten_content": rewrite["improved_content"][:20_000],
                    "current_word_count": rewritten_word_count,
                    "source_word_count": source_word_count,
                    "min_word_target": min_expanded_word_target,
                    "article_type": classification,
                    "guideline": guideline_payload["guideline"]
                    or "No guideline provided.",
                    "title_guideline": guideline_payload["title_guideline"]
                    or "No title guideline provided.",
                    "narrative_focus": narrative_focus,
                    "external_context": external_context_points,
                    "source_facts": source_fact_anchors,
                },
                prompt=expansion_prompt,
                error=_safe_str(exc.detail),
            )
            break

        expansion = _sanitize_v2_length_expansion(
            expansion_parsed,
            fallback_content=rewrite["improved_content"],
        )
        expanded_content = expansion["expanded_content"]
        expanded_words = _tokenize_similarity_words(expanded_content)
        expanded_word_count = len(expanded_words)
        _append_stage_trace(
            stage=stage_name,
            model_name=selected_model_name,
            max_tokens=6144,
            temperature=0.1,
            input_payload={
                "source_title": normalized_title,
                "source_content": normalized_content[:20_000],
                "rewritten_title": rewrite["improved_title"],
                "rewritten_content": rewrite["improved_content"][:20_000],
                "current_word_count": rewritten_word_count,
                "source_word_count": source_word_count,
                "min_word_target": min_expanded_word_target,
                "article_type": classification,
                "guideline": guideline_payload["guideline"] or "No guideline provided.",
                "title_guideline": guideline_payload["title_guideline"]
                or "No title guideline provided.",
                "narrative_focus": narrative_focus,
                "external_context": external_context_points,
                "source_facts": source_fact_anchors,
            },
            prompt=expansion_prompt,
            raw_response=length_expansion_raw_response,
            parsed=expansion_parsed,
            output={
                "expansion_summary": expansion["expansion_summary"],
                "expanded_word_count": expanded_word_count,
            },
        )
        if expanded_word_count <= rewritten_word_count:
            break

        rewrite["improved_content"] = expanded_content
        rewritten_words = expanded_words
        rewritten_word_count = expanded_word_count
        length_expansion_summary = expansion["expansion_summary"]
        length_expansion_passes += 1
        length_expansion_applied = True

    if length_expansion_applied:
        ngram_overlap = _ngram_overlap_ratio(source_words, rewritten_words, n=10)
        quality_prompt = (
            V2_QUALITY_AUDIT_PROMPT.replace("{source_title}", normalized_title)
            .replace("{source_content}", normalized_content[:20_000])
            .replace("{rewritten_title}", rewrite["improved_title"])
            .replace("{rewritten_content}", rewrite["improved_content"][:20_000])
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{guideline}",
                guideline_payload["guideline"] or "No guideline provided.",
            )
            .replace(
                "{title_guideline}",
                guideline_payload["title_guideline"] or "No title guideline provided.",
            )
            .replace("{seo_guideline}", SEO_SAFE_CONTENT_GENERATION_GUIDELINES)
            .replace("{ngram_overlap}", f"{ngram_overlap:.3f}")
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
            .replace("{external_context}", external_context_for_prompt)
        )
        quality_parsed, quality_raw_response = _invoke_json_llm_tracked(
            prompt=quality_prompt,
            stage_name="quality_audit_after_length_expansion",
            parse_metrics=json_parse_metrics,
            max_tokens=1024,
            temperature=0.05,
            model_name=selected_model_name,
        )
        quality = _sanitize_v2_quality_audit(quality_parsed)
        _append_stage_trace(
            stage="quality_audit_after_length_expansion",
            model_name=selected_model_name,
            max_tokens=1024,
            temperature=0.05,
            input_payload={
                "source_title": normalized_title,
                "source_content": normalized_content[:20_000],
                "rewritten_title": rewrite["improved_title"],
                "rewritten_content": rewrite["improved_content"][:20_000],
                "article_type": classification,
                "guideline": guideline_payload["guideline"] or "No guideline provided.",
                "title_guideline": guideline_payload["title_guideline"]
                or "No title guideline provided.",
                "ngram_overlap": round(ngram_overlap, 3),
                "narrative_focus": narrative_focus,
                "external_context": external_context_points,
            },
            prompt=quality_prompt,
            raw_response=quality_raw_response,
            parsed=quality_parsed,
            output=quality,
        )

        if source_fact_anchors:
            fact_coverage_prompt = (
                V2_FACT_COVERAGE_AUDIT_PROMPT.replace(
                    "{source_facts}",
                    json.dumps(source_fact_anchors, ensure_ascii=False, indent=2),
                )
                .replace("{rewritten_title}", rewrite["improved_title"])
                .replace("{rewritten_content}", rewrite["improved_content"][:20_000])
            )
            fact_coverage_parsed, fact_coverage_raw_response = _invoke_json_llm_tracked(
                prompt=fact_coverage_prompt,
                stage_name="fact_coverage_audit_after_length_expansion",
                parse_metrics=json_parse_metrics,
                max_tokens=1536,
                temperature=0.05,
                model_name=selected_model_name,
            )
            fact_coverage = _sanitize_v2_fact_coverage(
                fact_coverage_parsed, source_fact_anchors
            )
            _append_stage_trace(
                stage="fact_coverage_audit_after_length_expansion",
                model_name=selected_model_name,
                max_tokens=1536,
                temperature=0.05,
                input_payload={
                    "source_facts": source_fact_anchors,
                    "rewritten_title": rewrite["improved_title"],
                    "rewritten_content": rewrite["improved_content"][:20_000],
                },
                prompt=fact_coverage_prompt,
                raw_response=fact_coverage_raw_response,
                parsed=fact_coverage_parsed,
                output=fact_coverage,
            )
    else:
        _append_stage_trace(
            stage="length_expansion",
            model_name=selected_model_name,
            max_tokens=6144,
            temperature=0.1,
            output={
                "skipped": True,
                "reason": "Length target already met or expansion produced no growth.",
                "current_word_count": rewritten_word_count,
                "min_word_target": min_expanded_word_target,
            },
        )

    final_improved_content = _ensure_markdown_section_headers(
        rewrite["improved_content"]
    )
    editorial_augmentation_raw_response = ""
    editorial_augmentation = _sanitize_v2_editorial_augmentation(
        {},
        fallback_content=final_improved_content,
    )

    if enable_editorial_augmentation:
        augmentation_prompt = (
            V2_EDITORIAL_AUGMENTATION_PROMPT.replace(
                "{article_title}", rewrite["improved_title"][:500]
            )
            .replace("{article_content}", final_improved_content[:20_000])
            .replace(
                "{article_type}",
                json.dumps(classification, ensure_ascii=False, indent=2),
            )
            .replace(
                "{narrative_focus}",
                narrative_focus or "No additional narrative focus provided.",
            )
        )

        try:
            augmentation_parsed, editorial_augmentation_raw_response = (
                _invoke_json_llm_tracked(
                    prompt=augmentation_prompt,
                    stage_name="editorial_augmentation",
                    parse_metrics=json_parse_metrics,
                    max_tokens=6144,
                    temperature=0.05,
                    model_name=selected_model_name,
                )
            )
            editorial_augmentation = _sanitize_v2_editorial_augmentation(
                augmentation_parsed,
                fallback_content=final_improved_content,
            )
            _append_stage_trace(
                stage="editorial_augmentation",
                model_name=selected_model_name,
                max_tokens=6144,
                temperature=0.05,
                input_payload={
                    "article_title": rewrite["improved_title"][:500],
                    "article_content": final_improved_content[:20_000],
                    "article_type": classification,
                    "narrative_focus": narrative_focus,
                },
                prompt=augmentation_prompt,
                raw_response=editorial_augmentation_raw_response,
                parsed=augmentation_parsed,
                output=editorial_augmentation,
            )
        except HTTPException as exc:
            logger.warning(
                "URL2Blog editorial augmentation failed: %s",
                exc.detail,
            )
            _append_stage_trace(
                stage="editorial_augmentation",
                model_name=selected_model_name,
                max_tokens=6144,
                temperature=0.05,
                input_payload={
                    "article_title": rewrite["improved_title"][:500],
                    "article_content": final_improved_content[:20_000],
                    "article_type": classification,
                    "narrative_focus": narrative_focus,
                },
                prompt=augmentation_prompt,
                error=_safe_str(exc.detail),
            )
    else:
        _append_stage_trace(
            stage="editorial_augmentation",
            model_name=selected_model_name,
            max_tokens=6144,
            temperature=0.05,
            output={
                "skipped": True,
                "reason": "Editorial augmentation disabled for this run.",
            },
        )

    final_improved_content = editorial_augmentation["augmented_content"]
    final_word_count = len(_tokenize_similarity_words(final_improved_content))
    length_requirement_met = final_word_count >= min_expanded_word_target
    pipeline_status = (
        "ready_for_drafting" if length_requirement_met else "needs_revision"
    )
    length_requirement_blocking_reason = ""
    if not length_requirement_met:
        length_requirement_blocking_reason = (
            "Final article length is below minimum expansion target "
            f"({final_word_count} < {min_expanded_word_target} words)."
        )
    final_markdown = _build_markdown(
        rewrite["improved_title"],
        final_improved_content,
    )
    _append_stage_trace(
        stage="finalize_output",
        output={
            "improved_title": rewrite["improved_title"],
            "improved_content": final_improved_content,
            "final_markdown": final_markdown,
            "pipeline_status": pipeline_status,
            "final_word_count": final_word_count,
            "min_expanded_word_target": min_expanded_word_target,
            "length_requirement_met": length_requirement_met,
            "length_requirement_blocking_reason": length_requirement_blocking_reason,
        },
    )

    response_payload: dict[str, Any] = {
        "message": "URL2Blog simple pipeline completed",
        "run_id": run_id,
        "pipeline_status": pipeline_status,
        "article": {
            "source_url": url,
            "original_title": normalized_title,
            "original_excerpt": _build_excerpt(normalized_content),
            "language": normalized_language,
            "original_language": _safe_str(parsed_article.get("language")),
            "translated": was_translated,
        },
        "selected_article_type": {
            "id": classification.get("id"),
            "name": _safe_str(classification.get("name")),
            "confidence": classification.get("confidence"),
            "reasoning": _safe_str(classification.get("reasoning")),
        },
        "guideline_meta": {
            "id": guideline_payload["id"],
            "name": guideline_payload["name"],
        },
        "improved_article": {
            "title": rewrite["improved_title"],
            "content": final_improved_content,
        },
        "final_markdown": final_markdown,
        "guideline_review": {
            "alignment_summary": rewrite["guideline_alignment_summary"],
            "improvements_applied": rewrite["improvements_applied"],
            "remaining_gaps": rewrite["remaining_gaps"],
            "narrative_focus_applied": narrative_focus,
            "model_used": selected_model_name,
            "execution_profile": execution_profile,
            "source_word_count": source_word_count,
            "final_word_count": final_word_count,
            "min_expanded_word_target": min_expanded_word_target,
            "length_requirement_met": length_requirement_met,
            "length_requirement_blocking_reason": length_requirement_blocking_reason,
            "length_expansion_applied": length_expansion_applied,
            "length_expansion_passes": length_expansion_passes,
            "length_expansion_summary": length_expansion_summary,
            "short_article_enrichment_applied": short_article_enrichment_applied,
            "external_context_points_used": len(external_context_points),
            "external_context_usage_note": external_context_usage_note,
            "source_facts_extracted_count": len(source_fact_anchors),
            "factual_coverage_summary": fact_coverage["coverage_summary"],
            "factual_coverage_score": fact_coverage["coverage_score"],
            "missing_source_facts_count": fact_coverage["missing_count"],
            "missing_high_priority_facts_count": fact_coverage["missing_high_count"],
            "fact_repair_applied": fact_repair_applied,
            "quality_summary": quality["quality_summary"],
            "editorial_augmentation_applied": editorial_augmentation[
                "augmentation_applied"
            ],
            "editorial_components_added": [
                item["component"]
                for item in editorial_augmentation["components_added"]
            ],
            "editorial_augmentation_summary": editorial_augmentation[
                "augmentation_summary"
            ],
            "editorial_diagnostic": editorial_augmentation["diagnostic"],
            "quality_scores": {
                "overall": quality["overall_score"],
                "guideline_coverage": quality["guideline_coverage_score"],
                "informativeness": quality["informativeness_score"],
                "originality": quality["originality_score"],
            },
            "second_pass_applied": second_pass_applied,
            "similarity_ngram_overlap": round(ngram_overlap, 3),
            "json_parse_failures_total": _safe_int(
                json_parse_metrics.get("total_parse_failures"),
                default=0,
                min_value=0,
                max_value=9999,
            ),
            "json_parse_recovered_calls": _safe_int(
                json_parse_metrics.get("recovered_calls"),
                default=0,
                min_value=0,
                max_value=9999,
            ),
            "json_parse_recovered_failures": _safe_int(
                json_parse_metrics.get("recovered_parse_failures"),
                default=0,
                min_value=0,
                max_value=9999,
            ),
            "json_parse_failures_by_stage": _safe_dict(
                json_parse_metrics.get("failures_by_stage")
            ),
        },
    }

    translation_error = _safe_str(stage1_payload.get("translation_error"))
    if translation_error:
        response_payload["article"]["translation_error"] = translation_error

    if include_debug:
        response_payload["debug"] = {
            "pipeline_input": {
                "url": url,
                "include_debug": include_debug,
                "narrative_focus": narrative_focus,
                "execution_profile": execution_profile,
                "enable_web_enrichment": enable_web_enrichment,
                "enable_editorial_augmentation": enable_editorial_augmentation,
                "max_external_context_items": max_external_context_items,
                "model_name": selected_model_name,
            },
            "guideline": guideline_payload,
            "article_original_content": normalized_content,
            "stage1": stage1_payload,
            "stage2": stage2_payload,
            "pipeline_trace": stage_trace,
            "rewrite_raw_response": rewrite_raw_response,
            "repair_raw_response": repair_raw_response,
            "quality_raw_response": quality_raw_response,
            "quality_required_revisions": quality["required_revisions"],
            "narrative_focus": narrative_focus,
            "model_name": selected_model_name,
            "external_context_points": external_context_points,
            "external_context_usage_note": external_context_usage_note,
            "external_context_raw_response": external_context_raw_response,
            "external_context_grounded_urls": external_context_grounded_urls,
            "source_fact_anchors": source_fact_anchors,
            "source_facts_raw_response": source_facts_raw_response,
            "fact_coverage_raw_response": fact_coverage_raw_response,
            "fact_coverage_missing_facts": fact_coverage["missing_facts"],
            "fact_repair_raw_response": fact_repair_raw_response,
            "length_expansion_raw_response": length_expansion_raw_response,
            "editorial_augmentation_raw_response": editorial_augmentation_raw_response,
            "editorial_components_added": editorial_augmentation["components_added"],
            "editorial_diagnostic": editorial_augmentation["diagnostic"],
            "json_parse_metrics": json_parse_metrics,
        }

    write_stage_result(
        run_id,
        "pipeline_v2",
        {"created_at": _now_iso(), "data": response_payload},
    )
    write_artifact(
        run_id,
        {
            "markdown": final_markdown,
            "pipeline_v2": response_payload,
            "stages": {
                "stage_1": stage1_payload,
                "stage_2": stage2_payload,
            },
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

    return JSONResponse(response_payload)
