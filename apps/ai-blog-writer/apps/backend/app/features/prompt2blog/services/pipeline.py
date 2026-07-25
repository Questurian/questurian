"""
Prompt2Blog API routes.

Flow:
1) Validate user-selected article type and structured inputs.
2) Clean messy pasted source material and synthesize a working overview.
3) Run guideline-aware generation pipeline as a tracked background run.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from functools import lru_cache
from html import unescape
from pathlib import Path
from datetime import UTC, datetime
from typing import Any, List

from pydantic import BaseModel, Field

from app.core import (
    get_article_type_by_id,
    get_article_type_by_name,
    read_stage_result,
    read_status,
    write_artifact,
    write_stage_result,
    write_status,
)
from app.shared.prompts import ANTI_AI_TELLS_FULL
from app.shared.text import enforce_anti_ai_tells_markdown, normalize_dashes
from app.shared.writer_models import resolve_writer_model
from ..graph import (
    run_prompt2blog_full_graph,
    run_prompt2blog_pipeline_v2_graph,
)
from utils import get_vertex_llm, parse_json_response

logger = logging.getLogger(__name__)
FEATURE_NAME = "prompt2blog"
DEFAULT_MODEL = "gemini-2.5-flash-lite"
# Stage-specific overrides: compose and editorial augmentation are the two
# writing-quality stages, pinned to a stronger model than the run's base. Both
# were "claude-opus-4-8" until Anthropic billing ran out; restore those values
# (and set ANTHROPIC_MODELS_ENABLED=1) once it is funded again.
P2B_COMPOSE_MODEL = "gemini-3.1-pro-preview"
P2B_EDITORIAL_AUGMENTATION_MODEL = "gemini-3.1-pro-preview"
EDITORIAL_COMPONENT_LABELS = {
    "pull_quote": "Pull Quote",
    "in_the_know_box": "In The Know",
    "key_takeaways_box": "Key Takeaways",
    "highlight_callout": "Highlight Callout",
    "faq_block": "FAQ Block",
}
PROMPT2BLOG_DATA_DIR = Path(__file__).resolve().parents[4] / "data"
PROMPT2BLOG_GUIDELINES_DIR = PROMPT2BLOG_DATA_DIR / "guidelines"
PROMPT2BLOG_TITLE_GUIDELINES_DIR = PROMPT2BLOG_DATA_DIR / "title"
PROMPT2BLOG_OPTIONS_DIR = PROMPT2BLOG_DATA_DIR / "prompt2blog"
PROMPT2BLOG_TONES_DIR = PROMPT2BLOG_OPTIONS_DIR / "tones"
PROMPT2BLOG_LENGTHS_DIR = PROMPT2BLOG_OPTIONS_DIR / "lengths"
PROMPT2BLOG_BRAND_VOICES_DIR = PROMPT2BLOG_OPTIONS_DIR / "brand-voices"
PROMPT2BLOG_CREATIVITY_LEVELS = {"low", "medium", "high"}
PROMPT2BLOG_CLEANUP_MODE = "ai_always_aggressive_v1"
PROMPT2BLOG_CLEANUP_CHUNKING_CHAR_THRESHOLD = 18_000
PROMPT2BLOG_CLEANUP_CHUNK_TARGET_CHARS = 12_000
PROMPT2BLOG_CLEANUP_MAX_OUTPUT_TOKENS = 8_192
PROMPT2BLOG_CLEANUP_MAX_REMOVED_BLOCKS = 10
PROMPT2BLOG_CLEANUP_REMOVED_EXCERPT_CHARS = 220
PROMPT2BLOG_GUIDELINE_FILE_ALIASES = {
    "opinionpiece": "opinionpieces",
    "interview": "interviewarticles",
    "comparisonarticle": "comparisonarticleavsb",
}
PROMPT2BLOG_TITLE_FILE_ALIASES = {
    "disqualifiers": "disqualifiersegnolistarticles",
}

SYNTHESIZE_PROMPT = (
    "Combine all these sources into a coherent overview, eliminating "
    "duplication, stripping irrelevant artifacts, and preserving the most "
    "essential facts and context. Organize it naturally by what the data "
    "itself suggests, while maintaining clarity.\n\n"
    "Return plain text only. No JSON.\n\n"
    "--- SOURCES ---\n"
)

P2B_SOURCE_CLEANUP_PROMPT = """You are cleaning source material for downstream travel article generation.

This is a cleanup and extraction task, not a summarization task.

Return strict JSON only:
{{
  "title": "string",
  "published_at": "string",
  "cleaned_text": "string",
  "removed_blocks": [
    {{
      "label": "string",
      "reason": "string",
      "excerpt": "string"
    }}
  ]
}}

Hard rules:
- Preserve factual article content in the original order whenever practical.
- Keep travel advice, logistics, safety guidance, comparisons, health guidance, customs, and practical lists.
- Remove navigation, footer/legal/privacy/cookie blocks, social/share prompts, contact/company lists, plan or product grids, embedded CTAs, underwriter/disclaimer copy, cross-sell sections, and self-promotional brand sections.
- Remove decorative image captions unless they add factual value.
- If a paragraph mixes factual guidance with promotion, preserve the factual portion and remove the promotional phrasing.
- Do not rewrite this into a short summary.
- cleaned_text must be plain text only, preserving paragraph and list structure where useful.
- removed_blocks must contain at most 10 items.
- Each removed_blocks excerpt must be 220 characters or fewer.
- If title or published date is unclear, return an empty string for that field.
- Do not invent facts, dates, or metadata.

SOURCE MATERIAL:
{source_text}
"""

P2B_SOURCE_CLEANUP_CHUNK_PROMPT = """You are cleaning chunk {chunk_index} of {chunk_count} from a longer source document for downstream travel article generation.

This is a cleanup and extraction task, not a summarization task.

Return strict JSON only:
{{
  "title": "string",
  "published_at": "string",
  "cleaned_text": "string",
  "removed_blocks": [
    {{
      "label": "string",
      "reason": "string",
      "excerpt": "string"
    }}
  ]
}}

Hard rules:
- Preserve factual article content in the original order within this chunk whenever practical.
- Keep travel advice, logistics, safety guidance, comparisons, health guidance, customs, and practical lists.
- Remove navigation, footer/legal/privacy/cookie blocks, social/share prompts, contact/company lists, plan or product grids, embedded CTAs, underwriter/disclaimer copy, cross-sell sections, and self-promotional brand sections.
- Remove decorative image captions unless they add factual value.
- If a paragraph mixes factual guidance with promotion, preserve the factual portion and remove the promotional phrasing.
- Do not rewrite this into a short summary.
- cleaned_text must be plain text only, preserving paragraph and list structure where useful.
- removed_blocks must contain at most 10 items.
- Each removed_blocks excerpt must be 220 characters or fewer.
- Only return title or published_at if they are clearly visible in this chunk.
- Do not invent facts, dates, or metadata.

SOURCE CHUNK:
{source_text}
"""

CLASSIFY_PROMPT = """You are an article-intent classification engine.

Your ONLY task is to classify the cleaned source material into one allowed article type.
Choose exactly ONE article type from the allowed list.

Return strict JSON only:
{{
  "classification": "<exact article type name>",
  "confidence": <float between 0.00 and 1.00>,
  "reasoning": "<1-2 sentence explanation tied to audience intent and outcome>"
}}

Rules:
- Do NOT write the article.
- Do NOT invent a new type.
- Use the writing brief only as tie-breaker context when source intent is mixed.

CLEANED SOURCE MATERIAL:
{cleaned_data}

AVAILABLE ARTICLE TYPES:
{article_types}

WRITING BRIEF (JSON):
{writing_brief_json}
"""

SEO_SAFE_CONTENT_GENERATION_GUIDELINES = """SEO-SAFE CONTENT GUIDELINES

Write for readers first and SEO second. Use natural travel-news language, avoid keyword stuffing, avoid repetitive SEO headings, and make the article feel edited by a human. Include SEO elements only where they improve clarity: a strong headline, concise subhead, clean section structure, accurate metadata, and natural keywords. SEO structure and keywords never override anti-AI voice rules.

1. Keep search intent explicit and section-specific.
2. Prefer clear query-like H2/H3 headings when natural.
3. Include one direct 40-60 word answer near the top.
4. Reinforce the primary keyword naturally in high-visibility sections.
5. Use secondary keywords naturally without stuffing.
6. End with concise key takeaways.
7. Prioritize clarity, utility, and trust over hype.
"""

P2B_COVERAGE_CHECK_PROMPT = """You are a coverage analyst.

Goal:
Determine whether the source material can support a high-quality article that satisfies:
1) article-type guideline,
2) writing brief requirements,
3) SEO and CTA constraints.

Return strict JSON only:
{{
  "coverage_sufficient": true,
  "analysis": "string",
  "missing_sections": ["string"]
}}

Rules:
- Evaluate against provided source material only.
- Do not invent facts.
- Treat non-null writing brief fields as hard constraints.
- If source support is weak for a required brief element, reflect that in missing_sections.
- missing_sections must be concrete publishable section titles.

RAW SOURCES:
{raw_sources}

CLEANED SOURCE MATERIAL:
{cleaned_data}

ARTICLE TYPE:
{article_type_name}
{article_type_definition}

GUIDELINE:
{guideline}

TITLE GUIDELINE:
{title_guideline}

WRITING BRIEF (JSON):
{writing_brief_json}

NARRATIVE FOCUS (OPTIONAL):
{narrative_focus}
"""

P2B_SUPPLEMENT_PROMPT = """You are a content enhancement assistant.

Goal:
Generate supplemental sections for missing coverage while staying faithful to the source and writing brief.

Return Markdown only (no JSON).

Rules:
- Base claims on source material themes and facts.
- Do not invent specific facts, numbers, quotes, prices, names, or policies.
- Supplemental context may explain concepts mentioned in the source, but the final article cannot invent unsupported specifics.
- If details are missing, use cautious phrasing and clearly mark uncertainty.
- Respect writing brief tone, audience, and perspective.
- Use clear logical transitions only where needed; avoid stock transition phrases.
- Use `##` section headings.
- Keep sections practical and actionable.

RAW SOURCES:
{raw_sources}

CLEANED SOURCE MATERIAL:
{cleaned_data}

ARTICLE TYPE:
{article_type_name}

MISSING SECTIONS:
{missing_sections}

WRITING BRIEF (JSON):
{writing_brief_json}

NARRATIVE FOCUS (OPTIONAL):
{narrative_focus}
"""

P2B_COMPOSE_PROMPT = """You are an expert editor creating a publish-ready article from source material.

Goal:
Produce a materially improved article that matches the article guideline, writing brief, and SEO-safe structure.

Return strict JSON only:
{{
  "improved_title": "string",
  "improved_content": "string",
  "guideline_alignment_summary": "string",
  "improvements_applied": ["string"],
  "remaining_gaps": ["string"]
}}

Hard rules:
- Preserve factual meaning from sources.
- Do not invent facts.
- Avoid long verbatim phrasing from sources.
- improved_content must not contain a `#` H1.
- Use at least 3 `##` headings.
- Include one direct 40-60 word answer near the top.
- Include a concise takeaway section near the end.
- Respect brief voice/tone/perspective/audience.
- Respect formatting brief (paragraph length and target word count).
- Include CTA naturally near the end when provided.
- SEO: place keywords naturally, never stuff.
- If required details are missing, explicitly mark them as not confirmed.

RAW SOURCES:
{raw_sources}

CLEANED SOURCE MATERIAL:
{cleaned_data}

SUPPLEMENTAL MATERIAL (OPTIONAL):
{supplemental_content}

ARTICLE TYPE:
{article_type_name}
{article_type_definition}

GUIDELINE:
{guideline}

TITLE GUIDELINE:
{title_guideline}

WRITING BRIEF (JSON):
{writing_brief_json}

SEO-SAFE RULES:
{seo_guideline}

NARRATIVE FOCUS (OPTIONAL):
{narrative_focus}
"""

P2B_QUALITY_AUDIT_PROMPT = """You are a quality auditor for rewritten articles.

Goal:
Score the draft on guideline fit, brief adherence, SEO quality, originality, and reader utility.

Return strict JSON only:
{{
  "overall_score": 1,
  "guideline_coverage_score": 1,
  "informativeness_score": 1,
  "originality_score": 1,
  "brief_adherence_score": 1,
  "seo_score": 1,
  "too_close_to_source": false,
  "word_count_estimate": 0,
  "constraint_checks": {{
    "target_word_count_met": false,
    "paragraph_length_met": false,
    "cta_present": false,
    "primary_keyword_present": false,
    "secondary_keywords_present": false,
    "audience_match": false,
    "tone_match": false
  }},
  "required_revisions": ["string"],
  "quality_summary": "string"
}}

Scoring rubric:
- 9-10: publishable.
- 7-8: acceptable with edits.
- <=6: requires hard rewrite.

Rules:
- required_revisions must be specific and actionable.
- Mark too_close_to_source=true when structure/phrasing is too similar to source.

RAW SOURCES:
{raw_sources}

CLEANED SOURCE MATERIAL:
{cleaned_data}

REWRITTEN TITLE:
{rewritten_title}

REWRITTEN CONTENT:
{rewritten_content}

ARTICLE TYPE:
{article_type_name}

GUIDELINE:
{guideline}

TITLE GUIDELINE:
{title_guideline}

WRITING BRIEF (JSON):
{writing_brief_json}

SEO-SAFE RULES:
{seo_guideline}
"""

P2B_REPAIR_PROMPT = """You are running a hard rewrite repair pass.

Goal:
Fix the draft so it passes guideline, brief, and SEO constraints while preserving factual integrity.

Return strict JSON only:
{{
  "improved_title": "string",
  "improved_content": "string",
  "guideline_alignment_summary": "string",
  "improvements_applied": ["string"],
  "remaining_gaps": ["string"]
}}

Rules:
- Resolve each required revision directly.
- Do not invent facts.
- Reduce similarity to source phrasing/flow.
- Keep complete article prose with clear `##` / `###` structure.
- Preserve CTA and keyword requirements naturally.
- If source support is missing, explicitly state uncertainty.

RAW SOURCES:
{raw_sources}

CLEANED SOURCE MATERIAL:
{cleaned_data}

PREVIOUS TITLE:
{previous_title}

PREVIOUS CONTENT:
{previous_content}

REQUIRED REVISIONS:
{required_revisions}

ARTICLE TYPE:
{article_type_name}

GUIDELINE:
{guideline}

TITLE GUIDELINE:
{title_guideline}

WRITING BRIEF (JSON):
{writing_brief_json}

SEO-SAFE RULES:
{seo_guideline}

NARRATIVE FOCUS (OPTIONAL):
{narrative_focus}
"""

P2B_EDITORIAL_AUGMENTATION_PROMPT = """You are running Prompt2Blog EDITORIAL AUGMENTATION on a finished draft.

Goal:
- Optionally add high-signal editorial components that improve comprehension, pacing, or emphasis.
- Default to zero add-ons when the article already reads clearly.
- Keep output in Markdown and preserve the author's voice.

Return strict JSON only:
{{
  "augmented_content": "string",
  "components_added": [
    {{
      "component": "pull_quote|in_the_know_box|key_takeaways_box|highlight_callout|faq_block",
      "justification": "string",
      "placement": "string"
    }}
  ],
  "diagnostic": {{
    "cognitive_load": "strong|weak",
    "narrative_density": "strong|weak",
    "emphasis_clarity": "strong|weak",
    "reading_behavior_risk": "strong|weak"
  }},
  "augmentation_summary": "string"
}}

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

ARTICLE TYPE (JSON):
{article_type_json}

NARRATIVE OR AUDIENCE FOCUS (OPTIONAL):
{narrative_focus}
"""

P2B_TITLE_PROMPT = """You are an expert headline editor.

Goal:
Generate exactly one final title aligned to article content, writing brief, and title guideline.

Output rules (strict):
- Return exactly one line.
- No quotes, no markdown, no alternatives, no explanation.
- Keep it clear, specific, and non-hyped.
- Include the primary keyword naturally when possible.
- Do not introduce unsupported claims.

BASELINE TITLE:
{previous_title}

FINAL ARTICLE CONTENT:
{rewritten_content}

TITLE GUIDELINE:
{title_guideline}

WRITING BRIEF (JSON):
{writing_brief_json}
"""


class SynthesizeRequest(BaseModel):
    blobs: List[str]


class SynthesizeResponse(BaseModel):
    synthesized: str


class ArticleTypeOption(BaseModel):
    name: str
    definition: str


class ClassificationResult(BaseModel):
    id: int
    name: str
    definition: str
    confidence: float
    reasoning: str


class ClassifyRequest(BaseModel):
    cleaned_data: str
    article_types: List[ArticleTypeOption]
    writing_brief: dict[str, Any] | None = None


class ClassifyResponse(BaseModel):
    result: str
    classification: ClassificationResult


class PipelineV2RuntimeRequest(BaseModel):
    cleaned_data: str
    raw_sources: List[str] = Field(default_factory=list)
    writing_brief: dict[str, Any] = Field(default_factory=dict)
    article_type_id: int
    option_context: dict[str, Any] = Field(default_factory=dict)
    include_debug: bool = True
    enable_editorial_augmentation: bool = True
    model_name: str | None = None
    writing_model: str | None = None


class Prompt2BlogInputRequest(BaseModel):
    article_type_id: int
    source_material: List[str] = Field(default_factory=list)
    article_goal: str
    target_reader: str
    destination_context: str
    tone_id: str
    length_id: str
    brand_voice_id: str | None = None
    primary_keyword: str | None = None
    secondary_keywords: List[str] = Field(default_factory=list)
    must_include: List[str] = Field(default_factory=list)
    audience_profile: str | None = None
    prompt_enhance: bool = True
    creativity_level: str = "medium"
    negative_instructions: List[str] = Field(default_factory=list)
    include_debug: bool = True
    enable_editorial_augmentation: bool = True
    model_name: str | None = None
    writing_model: str | None = None


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


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


def _safe_str(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def _safe_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _safe_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if isinstance(value, bool):
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if isinstance(value, bool):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, indent=2)
    except Exception:
        return "{}"


def _tokenize_words(value: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", value.lower())


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def _normalize_article_type_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    normalized = (
        normalized.replace("’", "'")
        .replace("‘", "'")
        .replace("‑", "-")
        .replace("–", "-")
        .replace("—", "-")
        .replace("\xa0", " ")
    )
    return re.sub(r"[^a-z0-9]+", "", normalized.lower())


def _format_raw_sources(raw_sources: list[str]) -> str:
    cleaned = []
    for index, source in enumerate(raw_sources, start=1):
        text = _safe_str(source)
        if not text:
            continue
        cleaned.append(f"Source {index}:\n{text}")

    if not cleaned:
        return "No raw sources provided."
    return "\n\n---\n\n".join(cleaned)


def _coerce_frontmatter_value(value: str) -> Any:
    raw = value.strip()
    lower = raw.lower()
    if lower in {"true", "false"}:
        return lower == "true"
    if re.fullmatch(r"-?\d+", raw):
        return int(raw)
    if re.fullmatch(r"-?\d+\.\d+", raw):
        try:
            return float(raw)
        except ValueError:
            return raw
    return raw


def _parse_markdown_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    stripped = content.lstrip()
    if not stripped.startswith("---"):
        return {}, content.strip()

    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", stripped, flags=re.S)
    if not match:
        return {}, content.strip()

    frontmatter_raw, body = match.groups()
    metadata: dict[str, Any] = {}
    for line in frontmatter_raw.splitlines():
        if ":" not in line:
            continue
        key, raw_value = line.split(":", 1)
        metadata[key.strip()] = _coerce_frontmatter_value(raw_value)
    return metadata, body.strip()


def _markdown_heading_label(body: str, fallback: str) -> str:
    for line in body.splitlines():
        trimmed = line.strip()
        if trimmed.startswith("#"):
            return trimmed.lstrip("#").strip() or fallback
    return fallback


def _read_markdown_option_files(directory: Path) -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = []
    if not directory.exists():
        return options

    for path in sorted(directory.glob("*.md")):
        try:
            content = path.read_text(encoding="utf-8")
        except Exception:
            logger.warning("Unable to read Prompt2Blog option file: %s", path)
            continue

        metadata, body = _parse_markdown_frontmatter(content)
        default_id = _normalize_article_type_name(path.stem)
        option_id = _safe_str(metadata.get("id")) or default_id
        if not option_id:
            continue

        label = _safe_str(metadata.get("label")) or _markdown_heading_label(
            body, path.stem
        )
        description = _safe_str(metadata.get("description"))
        option = {
            "id": option_id,
            "label": label or option_id,
            "description": description,
            "instructions": body,
            "default": _safe_bool(metadata.get("default"), default=False),
            "order": _safe_int(metadata.get("order"), default=9999),
        }
        if "target_word_count" in metadata:
            option["target_word_count"] = _safe_int(
                metadata.get("target_word_count"), default=0
            )
        if "paragraph_length" in metadata:
            option["paragraph_length"] = _safe_str(metadata.get("paragraph_length"))
        options.append(option)

    options.sort(key=lambda item: (item.get("order", 9999), item["label"].lower()))
    return options


def _default_prompt2blog_options() -> dict[str, list[dict[str, Any]]]:
    return {
        "tones": [
            {
                "id": "practical",
                "label": "Practical",
                "description": "Actionable and direct guidance.",
                "instructions": "Prioritize practical guidance and clear steps.",
                "default": True,
                "order": 1,
            }
        ],
        "lengths": [
            {
                "id": "medium",
                "label": "Medium",
                "description": "Balanced depth.",
                "instructions": "Target balanced depth and readability.",
                "paragraph_length": "Medium (3–5 sentences per paragraph)",
                "target_word_count": 900,
                "default": True,
                "order": 1,
            }
        ],
        "brand_voices": [
            {
                "id": "questurian-default",
                "label": "Questurian Default",
                "description": "Clear, globally minded editorial voice.",
                "instructions": "Maintain polished, globally minded editorial voice.",
                "default": True,
                "order": 1,
            }
        ],
    }


@lru_cache(maxsize=1)
def _load_prompt2blog_option_catalog() -> dict[str, list[dict[str, Any]]]:
    defaults = _default_prompt2blog_options()
    tones = _read_markdown_option_files(PROMPT2BLOG_TONES_DIR) or defaults["tones"]
    lengths = _read_markdown_option_files(PROMPT2BLOG_LENGTHS_DIR) or defaults["lengths"]
    brand_voices = _read_markdown_option_files(PROMPT2BLOG_BRAND_VOICES_DIR) or defaults["brand_voices"]
    return {
        "tones": tones,
        "lengths": lengths,
        "brand_voices": brand_voices,
    }


def _find_option_or_raise(
    options: list[dict[str, Any]],
    option_id: str,
    *,
    field_name: str,
) -> dict[str, Any]:
    normalized = _normalize_article_type_name(option_id)
    for option in options:
        if _normalize_article_type_name(_safe_str(option.get("id"))) == normalized:
            return option
    raise RuntimeError(f"Unsupported {field_name}: '{option_id}'")


def _default_option(options: list[dict[str, Any]]) -> dict[str, Any] | None:
    for option in options:
        if _safe_bool(option.get("default"), default=False):
            return option
    return options[0] if options else None


def _read_article_type_markdown(
    *,
    article_type_name: str,
    directory: Path,
    fallback: str,
    aliases: dict[str, str],
) -> tuple[str, str | None]:
    if not directory.exists():
        return fallback, None

    normalized_target = _normalize_article_type_name(article_type_name)
    files_by_key: dict[str, Path] = {}
    for file_path in directory.glob("*.md"):
        files_by_key[_normalize_article_type_name(file_path.stem)] = file_path

    lookup_keys = [normalized_target]
    alias_value = aliases.get(normalized_target)
    if alias_value:
        lookup_keys.append(alias_value)

    for key in lookup_keys:
        file_path = files_by_key.get(key)
        if not file_path:
            continue
        try:
            return file_path.read_text(encoding="utf-8").strip(), file_path.name
        except Exception:
            logger.warning("Failed to read guideline markdown file: %s", file_path)
            break

    return fallback, None


def _preclean_source_text(raw_text: str) -> tuple[str, dict[str, int]]:
    text = unescape(raw_text or "")
    text = re.sub(r"(?is)<script.*?>.*?</script>", " ", text)
    text = re.sub(r"(?is)<style.*?>.*?</style>", " ", text)
    text = re.sub(r"(?is)<noscript.*?>.*?</noscript>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    removed_lines = 0
    cleaned_lines: list[str] = []
    for line in text.split("\n"):
        normalized = re.sub(r"\s+", " ", line).strip()
        if not normalized:
            cleaned_lines.append("")
            continue
        if re.fullmatch(r"https?://\S+", normalized):
            removed_lines += 1
            continue
        cleaned_lines.append(normalized)

    cleaned = "\n".join(cleaned_lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()

    stats = {
        "input_chars": len(raw_text or ""),
        "output_chars": len(cleaned),
        "removed_lines": removed_lines,
    }
    return cleaned, stats


def _truncate_cleanup_excerpt(value: str) -> str:
    excerpt = _safe_str(value)
    if len(excerpt) <= PROMPT2BLOG_CLEANUP_REMOVED_EXCERPT_CHARS:
        return excerpt
    return (
        excerpt[: PROMPT2BLOG_CLEANUP_REMOVED_EXCERPT_CHARS - 1].rstrip()
        + "…"
    )


def _sanitize_cleanup_text(value: Any) -> str:
    text = _safe_str(value)
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _sanitize_removed_blocks(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    removed_blocks: list[dict[str, str]] = []
    for item in value:
        if len(removed_blocks) >= PROMPT2BLOG_CLEANUP_MAX_REMOVED_BLOCKS:
            break
        record = _safe_dict(item)
        label = _safe_str(record.get("label")) or "Removed block"
        reason = _safe_str(record.get("reason")) or "Noise or promotional content"
        excerpt = _truncate_cleanup_excerpt(_safe_str(record.get("excerpt")))
        if not excerpt:
            continue
        removed_blocks.append(
            {
                "label": label,
                "reason": reason,
                "excerpt": excerpt,
            }
        )
    return removed_blocks


def _sanitize_cleanup_payload(parsed: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": _safe_str(parsed.get("title")),
        "published_at": _safe_str(parsed.get("published_at")),
        "cleaned_text": _sanitize_cleanup_text(parsed.get("cleaned_text")),
        "removed_blocks": _sanitize_removed_blocks(parsed.get("removed_blocks")),
    }


def _chunk_source_text(text: str, max_chars: int) -> list[str]:
    segments = [segment.strip() for segment in re.split(r"\n\s*\n", text) if segment.strip()]
    if not segments:
        stripped = text.strip()
        return [stripped] if stripped else []

    chunks: list[str] = []
    current = ""

    def _append_long_segment(segment: str) -> None:
        words = segment.split()
        if not words:
            return
        current_words = ""
        for word in words:
            candidate = f"{current_words} {word}".strip()
            if current_words and len(candidate) > max_chars:
                chunks.append(current_words)
                current_words = word
            else:
                current_words = candidate
        if current_words:
            chunks.append(current_words)

    for segment in segments:
        if len(segment) > int(max_chars * 1.1):
            if current:
                chunks.append(current)
                current = ""
            _append_long_segment(segment)
            continue

        candidate = f"{current}\n\n{segment}".strip() if current else segment
        if current and len(candidate) > max_chars:
            chunks.append(current)
            current = segment
        else:
            current = candidate

    if current:
        chunks.append(current)

    return chunks


def _merge_chunked_cleanup_text(cleaned_chunks: list[str]) -> str:
    merged_paragraphs: list[str] = []
    seen_paragraphs: set[str] = set()

    for chunk in cleaned_chunks:
        paragraphs = [segment.strip() for segment in re.split(r"\n\s*\n", chunk) if segment.strip()]
        for paragraph in paragraphs:
            normalized = _normalize_text(paragraph)
            if not normalized:
                continue
            if normalized in seen_paragraphs:
                continue
            if merged_paragraphs:
                last_normalized = _normalize_text(merged_paragraphs[-1])
                if normalized == last_normalized:
                    continue
                if len(normalized) > 80 and normalized in last_normalized:
                    continue
                if len(last_normalized) > 80 and last_normalized in normalized:
                    merged_paragraphs[-1] = paragraph
                    continue
            merged_paragraphs.append(paragraph)
            seen_paragraphs.add(normalized)

    return "\n\n".join(merged_paragraphs).strip()


def _cleanup_source_with_ai(
    *,
    raw_text: str,
    source_index: int,
    model_name: str,
) -> dict[str, Any]:
    precleaned_text, preclean_stats = _preclean_source_text(raw_text)
    fallback_payload = {
        "source_index": source_index,
        "input_chars": len(raw_text or ""),
        "preclean_chars": len(precleaned_text),
        "cleaned_chars": len(precleaned_text),
        "fallback_used": True,
        "title": "",
        "published_at": "",
        "cleaned_text": precleaned_text,
        "removed_blocks": [],
    }

    if not precleaned_text:
        return fallback_payload

    chunks = (
        _chunk_source_text(
            precleaned_text,
            max_chars=PROMPT2BLOG_CLEANUP_CHUNK_TARGET_CHARS,
        )
        if len(precleaned_text) >= PROMPT2BLOG_CLEANUP_CHUNKING_CHAR_THRESHOLD
        else [precleaned_text]
    )
    if not chunks:
        return fallback_payload

    try:
        cleaned_chunks: list[str] = []
        removed_blocks: list[dict[str, str]] = []
        title = ""
        published_at = ""

        for chunk_index, chunk in enumerate(chunks, start=1):
            prompt_template = (
                P2B_SOURCE_CLEANUP_CHUNK_PROMPT
                if len(chunks) > 1
                else P2B_SOURCE_CLEANUP_PROMPT
            )
            prompt = prompt_template.format(
                chunk_index=chunk_index,
                chunk_count=len(chunks),
                source_text=chunk,
            )
            parsed, _ = _invoke_json_llm(
                prompt=prompt,
                max_tokens=PROMPT2BLOG_CLEANUP_MAX_OUTPUT_TOKENS,
                temperature=0.1,
                model_name=model_name,
            )
            cleanup_payload = _sanitize_cleanup_payload(parsed)
            cleaned_text = _safe_str(cleanup_payload.get("cleaned_text"))
            if not cleaned_text:
                raise RuntimeError("AI cleanup returned empty cleaned_text")
            cleaned_chunks.append(cleaned_text)
            if not title:
                title = _safe_str(cleanup_payload.get("title"))
            if not published_at:
                published_at = _safe_str(cleanup_payload.get("published_at"))

            remaining_slots = PROMPT2BLOG_CLEANUP_MAX_REMOVED_BLOCKS - len(removed_blocks)
            if remaining_slots > 0:
                removed_blocks.extend(cleanup_payload["removed_blocks"][:remaining_slots])

        cleaned_text = (
            _merge_chunked_cleanup_text(cleaned_chunks)
            if len(cleaned_chunks) > 1
            else cleaned_chunks[0]
        )
        cleaned_text = _sanitize_cleanup_text(cleaned_text)
        if not cleaned_text:
            raise RuntimeError("Merged AI cleanup output was empty")

        return {
            "source_index": source_index,
            "input_chars": len(raw_text or ""),
            "preclean_chars": preclean_stats["output_chars"],
            "cleaned_chars": len(cleaned_text),
            "fallback_used": False,
            "title": title,
            "published_at": published_at,
            "cleaned_text": cleaned_text,
            "removed_blocks": removed_blocks,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Prompt2Blog AI cleanup failed for source %d: %s",
            source_index,
            exc,
        )
        return fallback_payload


def _extract_narrative_focus(writing_brief: dict[str, Any]) -> str:
    editorial = _safe_str(writing_brief.get("editorial_instructions"))
    if editorial:
        return editorial
    goal = _safe_str(writing_brief.get("goal"))
    if goal:
        return goal
    perspective = _safe_str(writing_brief.get("perspective"))
    return perspective or "No additional narrative focus provided."


def _contains_phrase(text: str, phrase: str) -> bool:
    normalized_text = _normalize_text(text)
    normalized_phrase = _normalize_text(phrase)
    if not normalized_phrase:
        return True
    return normalized_phrase in normalized_text


def _estimate_paragraph_sentence_average(content: str) -> float:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", content) if p.strip()]
    if not paragraphs:
        return 0.0

    sentence_counts = []
    for paragraph in paragraphs:
        count = len(re.findall(r"[.!?](?:\s|$)", paragraph))
        sentence_counts.append(max(1, count))

    return sum(sentence_counts) / max(1, len(sentence_counts))


def _keyword_overlap_ratio(reference: str, text: str) -> float:
    ref_tokens = {token for token in _tokenize_words(reference) if len(token) > 3}
    if not ref_tokens:
        return 1.0

    content_tokens = set(_tokenize_words(text))
    overlap = ref_tokens & content_tokens
    return len(overlap) / len(ref_tokens)


def _build_constraint_checks(
    title: str,
    content: str,
    writing_brief: dict[str, Any],
) -> dict[str, Any]:
    combined = f"{title}\n\n{content}".strip()
    word_count = len(_tokenize_words(content))

    formatting = writing_brief.get("formatting") or {}
    paragraph_length_pref = _safe_str(formatting.get("paragraph_length"))
    target_word_count = _safe_int(formatting.get("target_word_count"), default=0)

    target_word_count_met = True
    if target_word_count > 0:
        tolerance = max(100, int(target_word_count * 0.1))
        target_word_count_met = (
            target_word_count - tolerance <= word_count <= target_word_count + tolerance
        )

    avg_sentences = _estimate_paragraph_sentence_average(content)
    paragraph_length_met = True
    if paragraph_length_pref.lower().startswith("short"):
        paragraph_length_met = avg_sentences <= 2.5
    elif paragraph_length_pref.lower().startswith("medium"):
        paragraph_length_met = 2.5 <= avg_sentences <= 5.5
    elif paragraph_length_pref.lower().startswith("long"):
        paragraph_length_met = avg_sentences >= 5.0

    cta = _safe_str(writing_brief.get("call_to_action"))
    cta_present = _keyword_overlap_ratio(cta, combined) >= 0.35 if cta else True

    seo = writing_brief.get("seo") or {}
    primary_keyword = _safe_str(seo.get("primary_keyword"))
    primary_keyword_present = _contains_phrase(combined, primary_keyword)

    secondary_raw = seo.get("secondary_keywords")
    secondary_keywords: list[str] = []
    if isinstance(secondary_raw, list):
        secondary_keywords = [_safe_str(item) for item in secondary_raw if _safe_str(item)]

    secondary_keywords_present = True
    if secondary_keywords:
        secondary_keywords_present = all(_contains_phrase(combined, kw) for kw in secondary_keywords)

    audience = _safe_str(writing_brief.get("audience"))
    tone = _safe_str((writing_brief.get("voice") or {}).get("tone"))
    audience_match = _keyword_overlap_ratio(audience, combined) >= 0.2 if audience else True
    tone_match = _keyword_overlap_ratio(tone, combined) >= 0.2 if tone else True

    return {
        "target_word_count_met": target_word_count_met,
        "paragraph_length_met": paragraph_length_met,
        "cta_present": cta_present,
        "primary_keyword_present": primary_keyword_present,
        "secondary_keywords_present": secondary_keywords_present,
        "audience_match": audience_match,
        "tone_match": tone_match,
        "word_count_estimate": word_count,
    }


def _ensure_markdown_section_headers(content: str) -> str:
    cleaned = _safe_str(content)
    if not cleaned:
        return ""

    cleaned = re.sub(r"(?m)^\s*#\s+", "## ", cleaned).strip()

    if re.search(r"(?m)^\s{0,3}#{2,6}\s+\S", cleaned):
        return cleaned

    paragraphs = [item.strip() for item in re.split(r"\n\s*\n", cleaned) if item.strip()]
    if not paragraphs:
        return cleaned

    if len(paragraphs) == 1:
        return f"## Overview\n\n{paragraphs[0]}\n\n## Key Takeaways\n\n{paragraphs[0]}"

    headings = ["Overview", "Key Insights", "Practical Guidance", "Takeaways"]
    sections = []
    for index, paragraph in enumerate(paragraphs):
        heading = headings[index] if index < len(headings) else f"Additional Insight {index - 3}"
        sections.append(f"## {heading}\n\n{paragraph}")

    return "\n\n".join(sections)


def _normalize_editorial_component_name(value: str) -> str:
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
    return re.sub(r"\s+", " ", value).strip().lower()


def _editorial_box_marker(component: str) -> str:
    return f"[!EDITORIAL-BOX|{component}]"


def _editorial_block_start_marker(component: str) -> str:
    return f"[!EDITORIAL-BLOCK-START|{component}]"


def _editorial_block_end_marker(component: str) -> str:
    return f"[!EDITORIAL-BLOCK-END|{component}]"


def _editorial_block_label_marker(component: str) -> str:
    label = EDITORIAL_COMPONENT_LABELS.get(component, component)
    return f"[!EDITORIAL-BLOCK-LABEL|{label}]"


def _line_matches_editorial_marker(line: str, marker: str) -> bool:
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
    start_marker = re.escape(_editorial_block_start_marker(component))
    end_marker = re.escape(_editorial_block_end_marker(component))
    pattern = rf"(?mis)^\s*>\s*{start_marker}\s*$.*?^\s*>\s*{end_marker}\s*$"
    return bool(re.search(pattern, content))


def _build_editorial_metadata_box(component_entry: dict[str, str]) -> str:
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
        while (
            block_end + 1 < len(lines)
            and lines[block_end + 1].lstrip().startswith(">")
        ):
            block_end += 1

        lines.insert(idx, start_line)
        lines.insert(block_end + 2, end_line)
        return "\n".join(lines)

    return content


def _ensure_editorial_block_labels(content: str, component: str) -> str:
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
        lines.insert(label_marker_idx + 1, f"> {display_label_line}")
        end_idx += 1

    return "\n".join(lines)


def _ensure_editorial_component_boxes(
    content: str, components_added: list[dict[str, str]]
) -> str:
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
        if not _content_has_editorial_block(updated_content, component_entry["component"])
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


def _sanitize_editorial_augmentation(
    parsed: dict[str, Any], *, fallback_content: str
) -> dict[str, Any]:
    fallback_markdown = _ensure_markdown_section_headers(fallback_content)
    augmented_content = _safe_str(parsed.get("augmented_content"))
    if not augmented_content:
        augmented_content = fallback_markdown

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

    fallback_word_count = len(_tokenize_words(fallback_markdown))
    augmented_word_count = len(_tokenize_words(augmented_content))
    if augmented_word_count < fallback_word_count:
        augmented_content = _ensure_editorial_component_boxes(
            fallback_markdown,
            components_added,
        )

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


def _clean_title(title: str) -> str:
    cleaned = _safe_str(title)
    cleaned = cleaned.strip('"\'')
    cleaned = cleaned.lstrip("#").strip()
    return cleaned


def _build_markdown(title: str, content: str) -> str:
    body = _ensure_markdown_section_headers(content)
    cleaned_title = _clean_title(title)
    if cleaned_title:
        return f"# {cleaned_title}\n\n{body}".strip()
    return body.strip()


def _invoke_text_llm(
    *,
    prompt: str,
    max_tokens: int,
    temperature: float,
    model_name: str | None,
) -> str:
    resolved_model = model_name or DEFAULT_MODEL
    # get_vertex_llm routes claude-* models to the Anthropic API.
    llm = get_vertex_llm(
        temperature=temperature,
        max_tokens=max_tokens,
        model_name=resolved_model,
    )
    result = llm.invoke(prompt)
    text = _safe_str(result)
    if not text:
        raise RuntimeError("LLM returned empty response")
    return text


def _enforce_anti_ai_markdown_with_model(
    text: str,
    *,
    model_name: str | None,
    max_tokens: int,
    context: str,
) -> str:
    return enforce_anti_ai_tells_markdown(
        text,
        repair=lambda repair_prompt: _invoke_text_llm(
            prompt=repair_prompt,
            max_tokens=max_tokens,
            temperature=0.1,
            model_name=model_name,
        ),
        context=context,
    )


def _invoke_json_llm(
    *,
    prompt: str,
    max_tokens: int,
    temperature: float,
    model_name: str | None,
) -> tuple[dict[str, Any], str]:
    strict_prompt = (
        f"{prompt}\n\n"
        "CRITICAL OUTPUT RULE:\n"
        "Return ONLY one valid JSON object.\n"
        "No prose, no markdown, no code fences."
    )

    current_prompt = strict_prompt
    last_error = "Unknown JSON parse failure"
    last_response = ""

    for attempt in range(1, 4):
        raw_response = _invoke_text_llm(
            prompt=current_prompt,
            max_tokens=max_tokens,
            temperature=temperature if attempt == 1 else 0.0,
            model_name=model_name,
        )
        last_response = raw_response

        try:
            parsed = parse_json_response(raw_response)
            return parsed, raw_response
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            logger.warning(
                "Prompt2Blog JSON parse failed (attempt %d): %s",
                attempt,
                last_error,
            )
            current_prompt = (
                "Your previous output was invalid JSON.\n"
                "Return ONLY one strict JSON object.\n"
                "No markdown fences, no commentary.\n\n"
                f"Previous invalid output:\n{raw_response[:4000]}"
            )

    raise RuntimeError(
        "Failed to parse JSON LLM response: "
        f"{last_error}. Preview: {last_response[:240]}"
    )


def _sanitize_coverage(parsed: dict[str, Any]) -> dict[str, Any]:
    missing_sections_raw = parsed.get("missing_sections")
    missing_sections: list[str] = []
    if isinstance(missing_sections_raw, list):
        missing_sections = [_safe_str(item) for item in missing_sections_raw if _safe_str(item)]

    return {
        "coverage_sufficient": _safe_bool(parsed.get("coverage_sufficient"), default=False),
        "analysis": _safe_str(parsed.get("analysis"))
        or "Coverage analysis not provided.",
        "missing_sections": missing_sections,
    }


def _sanitize_rewrite(
    parsed: dict[str, Any],
    *,
    fallback_title: str,
    fallback_content: str,
) -> dict[str, Any]:
    improvements_raw = parsed.get("improvements_applied")
    improvements = []
    if isinstance(improvements_raw, list):
        improvements = [_safe_str(item) for item in improvements_raw if _safe_str(item)]

    remaining_raw = parsed.get("remaining_gaps")
    remaining = []
    if isinstance(remaining_raw, list):
        remaining = [_safe_str(item) for item in remaining_raw if _safe_str(item)]

    improved_title = _clean_title(_safe_str(parsed.get("improved_title")))
    improved_content = _safe_str(parsed.get("improved_content"))

    return {
        "improved_title": improved_title or _clean_title(fallback_title),
        "improved_content": improved_content or fallback_content,
        "guideline_alignment_summary": _safe_str(parsed.get("guideline_alignment_summary"))
        or "Guideline alignment summary not provided.",
        "improvements_applied": improvements,
        "remaining_gaps": remaining,
    }


def _sanitize_quality(parsed: dict[str, Any]) -> dict[str, Any]:
    required_revisions_raw = parsed.get("required_revisions")
    required_revisions = []
    if isinstance(required_revisions_raw, list):
        required_revisions = [
            _safe_str(item) for item in required_revisions_raw if _safe_str(item)
        ]

    checks_raw = parsed.get("constraint_checks")
    checks = {}
    if isinstance(checks_raw, dict):
        checks = {
            "target_word_count_met": _safe_bool(checks_raw.get("target_word_count_met"), default=True),
            "paragraph_length_met": _safe_bool(checks_raw.get("paragraph_length_met"), default=True),
            "cta_present": _safe_bool(checks_raw.get("cta_present"), default=True),
            "primary_keyword_present": _safe_bool(checks_raw.get("primary_keyword_present"), default=True),
            "secondary_keywords_present": _safe_bool(
                checks_raw.get("secondary_keywords_present"), default=True
            ),
            "audience_match": _safe_bool(checks_raw.get("audience_match"), default=True),
            "tone_match": _safe_bool(checks_raw.get("tone_match"), default=True),
        }

    return {
        "overall_score": max(1, min(10, _safe_int(parsed.get("overall_score"), default=6))),
        "guideline_coverage_score": max(
            1, min(10, _safe_int(parsed.get("guideline_coverage_score"), default=6))
        ),
        "informativeness_score": max(
            1, min(10, _safe_int(parsed.get("informativeness_score"), default=6))
        ),
        "originality_score": max(
            1, min(10, _safe_int(parsed.get("originality_score"), default=6))
        ),
        "brief_adherence_score": max(
            1, min(10, _safe_int(parsed.get("brief_adherence_score"), default=6))
        ),
        "seo_score": max(1, min(10, _safe_int(parsed.get("seo_score"), default=6))),
        "too_close_to_source": _safe_bool(parsed.get("too_close_to_source"), default=False),
        "word_count_estimate": max(0, _safe_int(parsed.get("word_count_estimate"), default=0)),
        "constraint_checks": checks,
        "required_revisions": required_revisions,
        "quality_summary": _safe_str(parsed.get("quality_summary"))
        or "Quality summary not provided.",
    }


def _should_run_repair(quality: dict[str, Any], checks: dict[str, Any]) -> bool:
    if quality.get("overall_score", 0) <= 7:
        return True
    if _safe_bool(quality.get("too_close_to_source"), default=False):
        return True

    for key in (
        "target_word_count_met",
        "cta_present",
        "primary_keyword_present",
        "secondary_keywords_present",
    ):
        if not _safe_bool(checks.get(key), default=True):
            return True

    return False


def _append_stage_trace(
    trace: list[dict[str, Any]],
    include_debug: bool,
    *,
    stage: str,
    model_name: str | None = None,
    input_payload: Any | None = None,
    prompt: str | None = None,
    raw_response: str | None = None,
    parsed: Any | None = None,
    output: Any | None = None,
    skipped: bool | None = None,
    error: str | None = None,
) -> None:
    if not include_debug:
        return

    entry: dict[str, Any] = {"stage": stage}
    if model_name:
        entry["model_name"] = model_name
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
    if skipped is not None:
        entry["skipped"] = skipped
    if error:
        entry["error"] = error

    trace.append(entry)


def _classify_cleaned_material(
    *,
    cleaned_data: str,
    article_types: list[dict[str, str]],
    writing_brief: dict[str, Any],
    model_name: str | None,
) -> tuple[ClassificationResult, str, dict[str, Any], str]:
    """Classify cleaned material into one known article type."""
    if not cleaned_data:
        raise RuntimeError("cleaned_data is required for classification")
    if not article_types:
        raise RuntimeError("No article types available for classification")

    types_text = "\n".join(
        f"- {_safe_str(item.get('name'))}: {_safe_str(item.get('definition'))}"
        for item in article_types
    )
    prompt = CLASSIFY_PROMPT.format(
        cleaned_data=cleaned_data,
        article_types=types_text,
        writing_brief_json=_json(writing_brief),
    )
    parsed, raw_response = _invoke_json_llm(
        prompt=prompt,
        max_tokens=1024,
        temperature=0.1,
        model_name=model_name or DEFAULT_MODEL,
    )

    selected_name = _safe_str(parsed.get("classification"))
    if not selected_name:
        raise RuntimeError("Classification response missing required 'classification' field.")

    selected_option = next(
        (item for item in article_types if _safe_str(item.get("name")) == selected_name),
        None,
    )
    if not selected_option:
        normalized = _normalize_article_type_name(selected_name)
        selected_option = next(
            (
                item
                for item in article_types
                if _normalize_article_type_name(_safe_str(item.get("name"))) == normalized
            ),
            None,
        )

    if not selected_option:
        raise RuntimeError(f"LLM selected unsupported article type: '{selected_name}'")

    article_type_row = get_article_type_by_name(_safe_str(selected_option.get("name")))
    if not article_type_row:
        raise RuntimeError(
            "Selected article type exists in options but was not found in internal storage."
        )

    confidence = max(0.0, min(1.0, _safe_float(parsed.get("confidence"), default=0.0)))
    reasoning = _safe_str(parsed.get("reasoning")) or "No reasoning provided."

    classification = ClassificationResult(
        id=article_type_row["id"],
        name=article_type_row["name"],
        definition=article_type_row["definition"],
        confidence=confidence,
        reasoning=reasoning,
    )
    result_text = (
        f"{classification.name}\n\n"
        f"Confidence: {classification.confidence:.2f}\n\n"
        f"{classification.reasoning}"
    )

    return classification, result_text, parsed, raw_response


def _clean_string_list(items: list[str]) -> list[str]:
    cleaned: list[str] = []
    for item in items:
        text = _safe_str(item)
        if text:
            cleaned.append(text)
    return cleaned


def _resolve_input_options(request: Prompt2BlogInputRequest) -> dict[str, Any]:
    catalog = _load_prompt2blog_option_catalog()
    tones = catalog.get("tones", [])
    lengths = catalog.get("lengths", [])
    brand_voices = catalog.get("brand_voices", [])

    tone = _find_option_or_raise(tones, request.tone_id, field_name="tone_id")
    length = _find_option_or_raise(lengths, request.length_id, field_name="length_id")
    if request.brand_voice_id:
        brand_voice = _find_option_or_raise(
            brand_voices,
            request.brand_voice_id,
            field_name="brand_voice_id",
        )
    else:
        brand_voice = _default_option(brand_voices)
        if not brand_voice:
            raise RuntimeError("No brand voice options are configured.")

    creativity_level = _safe_str(request.creativity_level).lower() or "medium"
    if creativity_level not in PROMPT2BLOG_CREATIVITY_LEVELS:
        raise RuntimeError(
            "creativity_level must be one of: "
            f"{', '.join(sorted(PROMPT2BLOG_CREATIVITY_LEVELS))}"
        )

    return {
        "tone": tone,
        "length": length,
        "brand_voice": brand_voice,
        "creativity_level": creativity_level,
    }


def _build_writing_brief_from_input(
    request: Prompt2BlogInputRequest,
    *,
    option_context: dict[str, Any],
    cleaned_sources: list[str],
) -> dict[str, Any]:
    tone = _safe_dict(option_context.get("tone"))
    length = _safe_dict(option_context.get("length"))
    brand_voice = _safe_dict(option_context.get("brand_voice"))
    creativity_level = _safe_str(option_context.get("creativity_level")) or "medium"

    secondary_keywords = _clean_string_list(request.secondary_keywords)
    must_include = _clean_string_list(request.must_include)
    negative_instructions = _clean_string_list(request.negative_instructions)

    profile_lines = [
        f"Tone profile ({_safe_str(tone.get('label'))}):",
        _safe_str(tone.get("instructions")),
        "",
        f"Length profile ({_safe_str(length.get('label'))}):",
        _safe_str(length.get("instructions")),
        "",
        f"Brand voice ({_safe_str(brand_voice.get('label'))}):",
        _safe_str(brand_voice.get("instructions")),
        "",
        f"Destination context: {_safe_str(request.destination_context)}",
        f"Audience intent: {_safe_str(request.target_reader)}",
        f"Creativity level: {creativity_level}",
    ]
    if must_include:
        profile_lines.extend(
            [
                "",
                "Must include:",
                *[f"- {item}" for item in must_include],
            ]
        )
    if negative_instructions:
        profile_lines.extend(
            [
                "",
                "Avoid:",
                *[f"- {item}" for item in negative_instructions],
            ]
        )
    if request.prompt_enhance:
        profile_lines.append(
            "\nPrompt enhancement enabled: prefer stronger transitions and clearer sections."
        )
    if request.audience_profile:
        profile_lines.append(f"Audience profile: {_safe_str(request.audience_profile)}")

    paragraph_length = _safe_str(length.get("paragraph_length"))
    if not paragraph_length:
        paragraph_length = _safe_str(length.get("label")) or "Medium"
    target_word_count = _safe_int(length.get("target_word_count"), default=0)
    if target_word_count <= 0:
        target_word_count = 900

    writing_brief: dict[str, Any] = {
        "topic": _safe_str(request.article_goal),
        "goal": _safe_str(request.article_goal),
        "audience": _safe_str(request.target_reader),
        "perspective": _safe_str(request.destination_context),
        "audience_profile": _safe_str(request.audience_profile),
        "voice": {
            "publication_style_reference": _safe_str(brand_voice.get("label")),
            "tone": _safe_str(tone.get("label")),
            "brand_identity": _safe_str(brand_voice.get("label")),
        },
        "formatting": {
            "paragraph_length": paragraph_length,
            "target_word_count": target_word_count,
        },
        "call_to_action": "",
        "seo": {
            "primary_keyword": _safe_str(request.primary_keyword),
            "secondary_keywords": secondary_keywords,
        },
        "editorial_instructions": "\n".join(
            line for line in profile_lines if _safe_str(line)
        ).strip(),
        "must_include": must_include,
        "negative_instructions": negative_instructions,
        "raw_input": {
            "blobs": [{"content": source} for source in cleaned_sources],
        },
    }
    return writing_brief


def _prepare_full_pipeline_request(
    run_id: str,
    request: Prompt2BlogInputRequest,
) -> PipelineV2RuntimeRequest:
    """Prepare cleaned + synthesized inputs for Prompt2Blog pipeline-v2."""
    model_name = request.model_name or DEFAULT_MODEL
    include_debug = request.include_debug

    current_stage = "stage_input_validate"
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": current_stage,
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )

    if request.article_type_id <= 0:
        raise RuntimeError("article_type_id is required")

    source_material = _clean_string_list(request.source_material)
    if not source_material:
        raise RuntimeError("At least one source_material item is required.")

    required_text_fields = {
        "article_goal": request.article_goal,
        "target_reader": request.target_reader,
        "destination_context": request.destination_context,
        "tone_id": request.tone_id,
        "length_id": request.length_id,
    }
    for field_name, value in required_text_fields.items():
        if not _safe_str(value):
            raise RuntimeError(f"{field_name} is required")

    option_context = _resolve_input_options(request)
    write_stage_result(
        run_id,
        current_stage,
        {
            "created_at": _now_iso(),
            "data": {
                "article_type_id": request.article_type_id,
                "source_material_count": len(source_material),
                "tone_id": _safe_str(option_context["tone"].get("id")),
                "length_id": _safe_str(option_context["length"].get("id")),
                "brand_voice_id": _safe_str(option_context["brand_voice"].get("id")),
                "creativity_level": option_context["creativity_level"],
            },
        },
    )

    current_stage = "stage_input_cleanup"
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": current_stage,
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )

    cleanup_sources: list[dict[str, Any]] = []
    cleaned_sources: list[str] = []
    for source_index, source in enumerate(source_material, start=1):
        cleanup_source = _cleanup_source_with_ai(
            raw_text=source,
            source_index=source_index,
            model_name=model_name,
        )
        cleanup_sources.append(cleanup_source)
        cleaned_text = _safe_str(cleanup_source.get("cleaned_text"))
        if cleaned_text:
            cleaned_sources.append(cleaned_text)

    if not cleaned_sources:
        raise RuntimeError("All source_material entries were empty after cleanup.")

    cleanup_stats = [
        {
            "input_chars": _safe_int(source.get("input_chars"), default=0),
            "output_chars": _safe_int(source.get("cleaned_chars"), default=0),
            "removed_lines": len(source.get("removed_blocks") or []),
        }
        for source in cleanup_sources
    ]

    write_stage_result(
        run_id,
        current_stage,
        {
            "created_at": _now_iso(),
            "data": {
                "cleanup_mode": PROMPT2BLOG_CLEANUP_MODE,
                "model_name": model_name,
                "source_material_count": len(source_material),
                "cleaned_sources_count": len(cleaned_sources),
                "sources": cleanup_sources,
                "cleanup_stats": cleanup_stats,
                "cleaned_sources": cleaned_sources,
            },
        },
    )

    current_stage = "stage_synthesize_sources"
    write_status(
        run_id,
        {
            "run_id": run_id,
            "state": "running",
            "stage": current_stage,
            "error": None,
            "updated_at": _now_iso(),
        },
        feature=FEATURE_NAME,
    )

    combined = "\n\n---\n\n".join(cleaned_sources)
    synth_prompt = SYNTHESIZE_PROMPT + combined
    synthesized_text = _invoke_text_llm(
        prompt=synth_prompt,
        max_tokens=8192,
        temperature=0.3,
        model_name=model_name,
    ).strip()
    if not synthesized_text:
        raise RuntimeError("Synthesis produced empty output.")

    write_stage_result(
        run_id,
        current_stage,
        {
            "created_at": _now_iso(),
            "data": {
                "source_material_count": len(cleaned_sources),
                "synthesized_text": synthesized_text,
            },
        },
    )

    writing_brief = _build_writing_brief_from_input(
        request,
        option_context=option_context,
        cleaned_sources=cleaned_sources,
    )

    return PipelineV2RuntimeRequest(
        cleaned_data=synthesized_text,
        raw_sources=cleaned_sources,
        writing_brief=writing_brief,
        article_type_id=request.article_type_id,
        option_context=option_context,
        include_debug=include_debug,
        enable_editorial_augmentation=request.enable_editorial_augmentation,
        model_name=model_name,
        writing_model=request.writing_model,
    )


def _run_full_pipeline_impl(run_id: str, request: Prompt2BlogInputRequest) -> None:
    """Run one-click Prompt2Blog flow from source material to final article."""
    include_debug = request.include_debug
    current_stage = "stage_input_validate"

    try:
        pipeline_request = _prepare_full_pipeline_request(run_id, request)
        _run_pipeline_v2_impl(run_id, pipeline_request)
    except Exception as exc:  # noqa: BLE001
        status = read_status(run_id) or {}
        failed_stage = _safe_str(status.get("stage")) or current_stage
        logger.exception("Prompt2Blog full run failed", extra={"run_id": run_id})
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "failed",
                "stage": failed_stage,
                "error": str(exc),
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )
        if include_debug:
            write_stage_result(
                run_id,
                "pipeline_v2",
                {
                    "created_at": _now_iso(),
                    "data": {
                        "error": str(exc),
                        "failed_stage": failed_stage,
                    },
                },
            )


def _run_pipeline_v2_impl(run_id: str, request: PipelineV2RuntimeRequest) -> None:
    model_name = request.model_name or DEFAULT_MODEL
    writing_model = resolve_writer_model(
        request.writing_model, default=P2B_COMPOSE_MODEL
    )
    cleaned_data = _safe_str(request.cleaned_data)
    raw_sources = [_safe_str(source) for source in request.raw_sources if _safe_str(source)]
    include_debug = request.include_debug
    enable_editorial_augmentation = request.enable_editorial_augmentation
    writing_brief = request.writing_brief if isinstance(request.writing_brief, dict) else {}
    option_context = request.option_context if isinstance(request.option_context, dict) else {}
    current_stage = "stage_guideline_fetch"
    trace: list[dict[str, Any]] = []

    raw_sources_text = _format_raw_sources(raw_sources)
    narrative_focus = _extract_narrative_focus(writing_brief)

    try:
        # Stage: guideline fetch
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": current_stage,
                "error": None,
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )

        article_type = get_article_type_by_id(request.article_type_id)
        if not article_type:
            raise RuntimeError(f"Article type {request.article_type_id} not found")

        guideline_text, guideline_file = _read_article_type_markdown(
            article_type_name=_safe_str(article_type.get("name")),
            directory=PROMPT2BLOG_GUIDELINES_DIR,
            fallback=_safe_str(article_type.get("guideline")),
            aliases=PROMPT2BLOG_GUIDELINE_FILE_ALIASES,
        )
        title_guideline_text, title_guideline_file = _read_article_type_markdown(
            article_type_name=_safe_str(article_type.get("name")),
            directory=PROMPT2BLOG_TITLE_GUIDELINES_DIR,
            fallback=_safe_str(article_type.get("title_guideline")),
            aliases=PROMPT2BLOG_TITLE_FILE_ALIASES,
        )

        guideline_payload = {
            "id": article_type["id"],
            "name": article_type["name"],
            "definition": article_type.get("definition") or "",
            "guideline": guideline_text,
            "title_guideline": title_guideline_text,
            "guideline_file": guideline_file,
            "title_guideline_file": title_guideline_file,
        }
        write_stage_result(
            run_id,
            current_stage,
            {
                "created_at": _now_iso(),
                "data": guideline_payload,
            },
        )
        _append_stage_trace(
            trace,
            include_debug,
            stage=current_stage,
            output=guideline_payload,
        )

        # Stage: coverage check
        current_stage = "stage_coverage_check"
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": current_stage,
                "error": None,
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )
        coverage_prompt = P2B_COVERAGE_CHECK_PROMPT.format(
            raw_sources=raw_sources_text,
            cleaned_data=cleaned_data,
            article_type_name=guideline_payload["name"],
            article_type_definition=guideline_payload["definition"],
            guideline=guideline_payload["guideline"] or "No guideline provided.",
            title_guideline=guideline_payload["title_guideline"]
            or "No title guideline provided.",
            writing_brief_json=_json(writing_brief),
            narrative_focus=narrative_focus,
        )
        coverage_parsed, coverage_raw = _invoke_json_llm(
            prompt=coverage_prompt,
            max_tokens=1536,
            temperature=0.05,
            model_name=model_name,
        )
        coverage = _sanitize_coverage(coverage_parsed)
        write_stage_result(
            run_id,
            current_stage,
            {
                "created_at": _now_iso(),
                "data": {
                    "coverage": coverage,
                    "raw_response": coverage_raw,
                },
            },
        )
        _append_stage_trace(
            trace,
            include_debug,
            stage=current_stage,
            model_name=model_name,
            input_payload={
                "article_type": guideline_payload,
                "narrative_focus": narrative_focus,
            },
            prompt=coverage_prompt,
            raw_response=coverage_raw,
            parsed=coverage_parsed,
            output=coverage,
        )

        # Stage: supplement
        current_stage = "stage_supplement"
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": current_stage,
                "error": None,
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )

        supplemental_content = ""
        supplement_prompt = ""
        supplement_raw = ""
        supplement_skipped = coverage["coverage_sufficient"] or not coverage["missing_sections"]

        if supplement_skipped:
            _append_stage_trace(
                trace,
                include_debug,
                stage=current_stage,
                model_name=model_name,
                output={
                    "skipped": True,
                    "reason": "Coverage is sufficient or no missing sections found.",
                },
                skipped=True,
            )
        else:
            missing_sections_text = "\n".join(
                f"- {item}" for item in coverage["missing_sections"]
            )
            supplement_prompt = P2B_SUPPLEMENT_PROMPT.format(
                raw_sources=raw_sources_text,
                cleaned_data=cleaned_data,
                article_type_name=guideline_payload["name"],
                missing_sections=missing_sections_text,
                writing_brief_json=_json(writing_brief),
                narrative_focus=narrative_focus,
            )
            supplement_prompt = f"{supplement_prompt}\n\n{ANTI_AI_TELLS_FULL}"
            supplement_raw = _invoke_text_llm(
                prompt=supplement_prompt,
                max_tokens=4096,
                temperature=0.2,
                model_name=model_name,
            )
            supplemental_content = _enforce_anti_ai_markdown_with_model(
                supplement_raw,
                model_name=model_name,
                max_tokens=4096,
                context="prompt2blog supplement",
            )
            _append_stage_trace(
                trace,
                include_debug,
                stage=current_stage,
                model_name=model_name,
                input_payload={"missing_sections": coverage["missing_sections"]},
                prompt=supplement_prompt,
                raw_response=supplement_raw,
                output={
                    "supplemental_content_preview": supplemental_content[:600],
                    "supplemental_length": len(supplemental_content),
                },
            )

        write_stage_result(
            run_id,
            current_stage,
            {
                "created_at": _now_iso(),
                "data": {
                    "skipped": supplement_skipped,
                    "missing_sections": coverage["missing_sections"],
                    "supplemental_content": supplemental_content,
                    "raw_response": supplement_raw,
                },
            },
        )

        # Stage: compose
        current_stage = "stage_compose"
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": current_stage,
                "error": None,
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )

        compose_prompt = P2B_COMPOSE_PROMPT.format(
            raw_sources=raw_sources_text,
            cleaned_data=cleaned_data,
            supplemental_content=supplemental_content
            or "No supplemental material generated.",
            article_type_name=guideline_payload["name"],
            article_type_definition=guideline_payload["definition"],
            guideline=guideline_payload["guideline"] or "No guideline provided.",
            title_guideline=guideline_payload["title_guideline"]
            or "No title guideline provided.",
            writing_brief_json=_json(writing_brief),
            seo_guideline=SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
            narrative_focus=narrative_focus,
        )
        compose_prompt = f"{compose_prompt}\n\n{ANTI_AI_TELLS_FULL}"
        compose_parsed, compose_raw = _invoke_json_llm(
            prompt=compose_prompt,
            max_tokens=6144,
            temperature=0.1,
            model_name=writing_model,
        )
        rewrite = _sanitize_rewrite(
            compose_parsed,
            fallback_title=guideline_payload["name"],
            fallback_content=cleaned_data,
        )
        rewrite["improved_content"] = _enforce_anti_ai_markdown_with_model(
            rewrite["improved_content"],
            model_name=writing_model,
            max_tokens=6144,
            context="prompt2blog compose",
        )
        write_stage_result(
            run_id,
            current_stage,
            {
                "created_at": _now_iso(),
                "data": {
                    "rewrite": rewrite,
                    "raw_response": compose_raw,
                },
            },
        )
        _append_stage_trace(
            trace,
            include_debug,
            stage=current_stage,
            model_name=writing_model,
            input_payload={
                "article_type": guideline_payload,
                "narrative_focus": narrative_focus,
            },
            prompt=compose_prompt,
            raw_response=compose_raw,
            parsed=compose_parsed,
            output=rewrite,
        )

        # Stage: quality audit
        current_stage = "stage_quality_audit"
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": current_stage,
                "error": None,
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )
        quality_prompt = P2B_QUALITY_AUDIT_PROMPT.format(
            raw_sources=raw_sources_text,
            cleaned_data=cleaned_data,
            rewritten_title=rewrite["improved_title"],
            rewritten_content=rewrite["improved_content"],
            article_type_name=guideline_payload["name"],
            guideline=guideline_payload["guideline"] or "No guideline provided.",
            title_guideline=guideline_payload["title_guideline"]
            or "No title guideline provided.",
            writing_brief_json=_json(writing_brief),
            seo_guideline=SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
        )
        quality_parsed, quality_raw = _invoke_json_llm(
            prompt=quality_prompt,
            max_tokens=1536,
            temperature=0.05,
            model_name=model_name,
        )
        quality = _sanitize_quality(quality_parsed)
        computed_checks = _build_constraint_checks(
            rewrite["improved_title"],
            rewrite["improved_content"],
            writing_brief,
        )
        quality_checks = {
            **quality.get("constraint_checks", {}),
            **{k: v for k, v in computed_checks.items() if k != "word_count_estimate"},
        }
        quality["constraint_checks"] = quality_checks
        quality["word_count_estimate"] = computed_checks["word_count_estimate"]

        write_stage_result(
            run_id,
            current_stage,
            {
                "created_at": _now_iso(),
                "data": {
                    "quality": quality,
                    "raw_response": quality_raw,
                },
            },
        )
        _append_stage_trace(
            trace,
            include_debug,
            stage=current_stage,
            model_name=model_name,
            prompt=quality_prompt,
            raw_response=quality_raw,
            parsed=quality_parsed,
            output=quality,
        )

        # Stage: optional repair
        current_stage = "stage_repair"
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": current_stage,
                "error": None,
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )

        repair_applied = _should_run_repair(quality, quality_checks)
        repair_raw = ""
        repair_prompt = ""
        if repair_applied:
            repair_prompt = P2B_REPAIR_PROMPT.format(
                raw_sources=raw_sources_text,
                cleaned_data=cleaned_data,
                previous_title=rewrite["improved_title"],
                previous_content=rewrite["improved_content"],
                required_revisions=_json(quality.get("required_revisions", [])),
                article_type_name=guideline_payload["name"],
                guideline=guideline_payload["guideline"] or "No guideline provided.",
                title_guideline=guideline_payload["title_guideline"]
                or "No title guideline provided.",
                writing_brief_json=_json(writing_brief),
                seo_guideline=SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
                narrative_focus=narrative_focus,
            )
            repair_prompt = f"{repair_prompt}\n\n{ANTI_AI_TELLS_FULL}"
            repair_parsed, repair_raw = _invoke_json_llm(
                prompt=repair_prompt,
                max_tokens=6144,
                temperature=0.1,
                model_name=model_name,
            )
            rewrite = _sanitize_rewrite(
                repair_parsed,
                fallback_title=rewrite["improved_title"],
                fallback_content=rewrite["improved_content"],
            )
            rewrite["improved_content"] = _enforce_anti_ai_markdown_with_model(
                rewrite["improved_content"],
                model_name=model_name,
                max_tokens=6144,
                context="prompt2blog repair",
            )

            quality_prompt_after_repair = P2B_QUALITY_AUDIT_PROMPT.format(
                raw_sources=raw_sources_text,
                cleaned_data=cleaned_data,
                rewritten_title=rewrite["improved_title"],
                rewritten_content=rewrite["improved_content"],
                article_type_name=guideline_payload["name"],
                guideline=guideline_payload["guideline"] or "No guideline provided.",
                title_guideline=guideline_payload["title_guideline"]
                or "No title guideline provided.",
                writing_brief_json=_json(writing_brief),
                seo_guideline=SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
            )
            quality_parsed_after_repair, quality_raw_after_repair = _invoke_json_llm(
                prompt=quality_prompt_after_repair,
                max_tokens=1536,
                temperature=0.05,
                model_name=model_name,
            )
            quality = _sanitize_quality(quality_parsed_after_repair)
            computed_checks = _build_constraint_checks(
                rewrite["improved_title"],
                rewrite["improved_content"],
                writing_brief,
            )
            quality_checks = {
                **quality.get("constraint_checks", {}),
                **{k: v for k, v in computed_checks.items() if k != "word_count_estimate"},
            }
            quality["constraint_checks"] = quality_checks
            quality["word_count_estimate"] = computed_checks["word_count_estimate"]
            quality["post_repair_raw_response"] = quality_raw_after_repair

            _append_stage_trace(
                trace,
                include_debug,
                stage=current_stage,
                model_name=model_name,
                prompt=repair_prompt,
                raw_response=repair_raw,
                parsed=repair_parsed,
                output={
                    "rewrite": rewrite,
                    "quality_after_repair": quality,
                },
            )
        else:
            _append_stage_trace(
                trace,
                include_debug,
                stage=current_stage,
                model_name=model_name,
                output={
                    "skipped": True,
                    "reason": "Quality and constraint checks passed.",
                },
                skipped=True,
            )

        write_stage_result(
            run_id,
            current_stage,
            {
                "created_at": _now_iso(),
                "data": {
                    "repair_applied": repair_applied,
                    "rewrite": rewrite,
                    "quality": quality,
                    "raw_response": repair_raw,
                },
            },
        )

        # Stage: editorial augmentation (optional)
        current_stage = "stage_editorial_augmentation"
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": current_stage,
                "error": None,
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )

        editorial_augmentation_raw_response = ""
        editorial_augmentation = _sanitize_editorial_augmentation(
            {},
            fallback_content=rewrite["improved_content"],
        )

        if enable_editorial_augmentation:
            augmentation_prompt = P2B_EDITORIAL_AUGMENTATION_PROMPT.format(
                article_title=rewrite["improved_title"],
                article_content=rewrite["improved_content"],
                article_type_json=_json(
                    {
                        "id": guideline_payload["id"],
                        "name": guideline_payload["name"],
                        "definition": guideline_payload["definition"],
                    }
                ),
                narrative_focus=narrative_focus,
            )
            augmentation_prompt = f"{augmentation_prompt}\n\n{ANTI_AI_TELLS_FULL}"
            try:
                augmentation_parsed, editorial_augmentation_raw_response = _invoke_json_llm(
                    prompt=augmentation_prompt,
                    max_tokens=6144,
                    temperature=0.05,
                    model_name=writing_model,
                )
                if isinstance(augmentation_parsed.get("augmented_content"), str):
                    augmentation_parsed["augmented_content"] = _enforce_anti_ai_markdown_with_model(
                        augmentation_parsed["augmented_content"],
                        model_name=writing_model,
                        max_tokens=6144,
                        context="prompt2blog editorial augmentation",
                    )
                editorial_augmentation = _sanitize_editorial_augmentation(
                    augmentation_parsed,
                    fallback_content=rewrite["improved_content"],
                )
                _append_stage_trace(
                    trace,
                    include_debug,
                    stage=current_stage,
                    model_name=writing_model,
                    input_payload={
                        "article_title": rewrite["improved_title"],
                        "article_type": {
                            "id": guideline_payload["id"],
                            "name": guideline_payload["name"],
                        },
                        "narrative_focus": narrative_focus,
                    },
                    prompt=augmentation_prompt,
                    raw_response=editorial_augmentation_raw_response,
                    parsed=augmentation_parsed,
                    output=editorial_augmentation,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Prompt2Blog editorial augmentation failed: %s", exc)
                _append_stage_trace(
                    trace,
                    include_debug,
                    stage=current_stage,
                    model_name=writing_model,
                    input_payload={
                        "article_title": rewrite["improved_title"],
                        "article_type": {
                            "id": guideline_payload["id"],
                            "name": guideline_payload["name"],
                        },
                        "narrative_focus": narrative_focus,
                    },
                    prompt=augmentation_prompt,
                    error=str(exc),
                )
        else:
            _append_stage_trace(
                trace,
                include_debug,
                stage=current_stage,
                model_name=model_name,
                output={
                    "skipped": True,
                    "reason": "Editorial augmentation disabled for this run.",
                },
                skipped=True,
            )

        rewrite["improved_content"] = editorial_augmentation["augmented_content"]
        write_stage_result(
            run_id,
            current_stage,
            {
                "created_at": _now_iso(),
                "data": {
                    "editorial_augmentation": editorial_augmentation,
                    "raw_response": editorial_augmentation_raw_response,
                    "skipped": not enable_editorial_augmentation,
                },
            },
        )

        # Stage: title generation
        current_stage = "stage_title"
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": current_stage,
                "error": None,
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )
        title_prompt = P2B_TITLE_PROMPT.format(
            previous_title=rewrite["improved_title"],
            rewritten_content=rewrite["improved_content"],
            title_guideline=guideline_payload["title_guideline"]
            or "No title guideline provided.",
            writing_brief_json=_json(writing_brief),
        )
        final_title_raw = _invoke_text_llm(
            prompt=title_prompt,
            max_tokens=512,
            temperature=0.1,
            model_name=model_name,
        )
        final_title = _clean_title(final_title_raw) or rewrite["improved_title"]

        write_stage_result(
            run_id,
            current_stage,
            {
                "created_at": _now_iso(),
                "data": {
                    "final_title": final_title,
                    "raw_response": final_title_raw,
                },
            },
        )
        _append_stage_trace(
            trace,
            include_debug,
            stage=current_stage,
            model_name=model_name,
            prompt=title_prompt,
            raw_response=final_title_raw,
            output={"final_title": final_title},
        )

        # Stage: finalize output
        current_stage = "stage_finalize"
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": current_stage,
                "error": None,
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )

        final_title = normalize_dashes(final_title)
        rewrite["improved_content"] = _enforce_anti_ai_markdown_with_model(
            rewrite["improved_content"],
            model_name=writing_model,
            max_tokens=6144,
            context="prompt2blog finalize",
        )
        final_markdown = _build_markdown(final_title, rewrite["improved_content"])
        final_checks = _build_constraint_checks(final_title, rewrite["improved_content"], writing_brief)
        pipeline_status = (
            "ready_for_staging"
            if final_checks["target_word_count_met"] and final_checks["primary_keyword_present"]
            else "needs_revision"
        )

        write_stage_result(
            run_id,
            current_stage,
            {
                "created_at": _now_iso(),
                "data": {
                    "pipeline_status": pipeline_status,
                    "final_title": final_title,
                    "word_count_estimate": final_checks["word_count_estimate"],
                    "constraint_checks": final_checks,
                },
            },
        )

        response_payload: dict[str, Any] = {
            "message": "Prompt2Blog pipeline v2 completed",
            "run_id": run_id,
            "pipeline_status": pipeline_status,
            "article_type": {
                "id": guideline_payload["id"],
                "name": guideline_payload["name"],
                "definition": guideline_payload["definition"],
            },
            "guideline_meta": {
                "guideline": guideline_payload["guideline"],
                "title_guideline": guideline_payload["title_guideline"],
                "guideline_file": guideline_payload.get("guideline_file"),
                "title_guideline_file": guideline_payload.get("title_guideline_file"),
            },
            "improved_article": {
                "title": final_title,
                "content": rewrite["improved_content"],
            },
            "final_markdown": final_markdown,
            "input_profiles": {
                "tone": _safe_dict(option_context.get("tone")),
                "length": _safe_dict(option_context.get("length")),
                "brand_voice": _safe_dict(option_context.get("brand_voice")),
                "creativity_level": _safe_str(option_context.get("creativity_level")),
            },
            "quality_review": {
                "alignment_summary": rewrite["guideline_alignment_summary"],
                "improvements_applied": rewrite["improvements_applied"],
                "remaining_gaps": rewrite["remaining_gaps"],
                "quality_summary": quality["quality_summary"],
                "quality_scores": {
                    "overall": quality["overall_score"],
                    "guideline_coverage": quality["guideline_coverage_score"],
                    "informativeness": quality["informativeness_score"],
                    "originality": quality["originality_score"],
                    "brief_adherence": quality["brief_adherence_score"],
                    "seo": quality["seo_score"],
                },
                "constraint_checks": {
                    **quality_checks,
                    "target_word_count_met": final_checks["target_word_count_met"],
                    "paragraph_length_met": final_checks["paragraph_length_met"],
                    "cta_present": final_checks["cta_present"],
                    "primary_keyword_present": final_checks["primary_keyword_present"],
                    "secondary_keywords_present": final_checks[
                        "secondary_keywords_present"
                    ],
                    "audience_match": final_checks["audience_match"],
                    "tone_match": final_checks["tone_match"],
                },
                "word_count_estimate": final_checks["word_count_estimate"],
                "repair_applied": repair_applied,
                "editorial_augmentation_applied": editorial_augmentation[
                    "augmentation_applied"
                ],
                "editorial_components_added": editorial_augmentation[
                    "components_added"
                ],
                "editorial_augmentation_summary": editorial_augmentation[
                    "augmentation_summary"
                ],
                "editorial_diagnostic": editorial_augmentation["diagnostic"],
                "coverage": coverage,
                "model_used": model_name,
                "stage_model_overrides": {
                    "stage_compose": writing_model,
                    "stage_editorial_augmentation": writing_model,
                },
            },
        }

        if include_debug:
            response_payload["debug"] = {
                "pipeline_input": {
                    "article_type_id": request.article_type_id,
                    "model_name": model_name,
                    "include_debug": include_debug,
                    "enable_editorial_augmentation": enable_editorial_augmentation,
                    "raw_sources_count": len(raw_sources),
                    "input_profiles": option_context,
                },
                "writing_brief": writing_brief,
                "pipeline_trace": trace,
                "editorial_augmentation_raw_response": editorial_augmentation_raw_response,
                "editorial_components_added": editorial_augmentation["components_added"],
                "editorial_diagnostic": editorial_augmentation["diagnostic"],
            }

        write_stage_result(
            run_id,
            "pipeline_v2",
            {
                "created_at": _now_iso(),
                "data": response_payload,
            },
        )
        write_artifact(
            run_id,
            {
                "markdown": final_markdown,
                "pipeline_v2": response_payload,
                "stages": {
                    "stage_guideline_fetch": guideline_payload,
                    "stage_coverage_check": coverage,
                    "stage_compose": rewrite,
                    "stage_quality_audit": quality,
                    "stage_editorial_augmentation": editorial_augmentation,
                    "stage_title": {"final_title": final_title},
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
    except Exception as exc:  # noqa: BLE001
        logger.exception("Prompt2Blog pipeline-v2 failed", extra={"run_id": run_id})
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "failed",
                "stage": current_stage,
                "error": str(exc),
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )
        if include_debug:
            write_stage_result(
                run_id,
                "pipeline_v2",
                {
                    "created_at": _now_iso(),
                    "data": {
                        "error": str(exc),
                        "failed_stage": current_stage,
                        "pipeline_trace": trace,
                    },
                },
            )


def _run_pipeline_v2(run_id: str, request: PipelineV2RuntimeRequest) -> None:
    try:
        run_prompt2blog_pipeline_v2_graph(
            run_id=run_id,
            pipeline_runner=lambda: _run_pipeline_v2_impl(run_id, request),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Prompt2Blog graph pipeline-v2 failed", extra={"run_id": run_id})
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "failed",
                "stage": "graph_execution",
                "error": str(exc),
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )


def _run_full_pipeline(run_id: str, request: Prompt2BlogInputRequest) -> None:
    try:
        run_prompt2blog_full_graph(
            run_id=run_id,
            prepare_runner=lambda: _prepare_full_pipeline_request(run_id, request).model_dump(),
            pipeline_runner=lambda payload: _run_pipeline_v2_impl(
                run_id,
                PipelineV2RuntimeRequest.model_validate(payload),
            ),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Prompt2Blog graph full-run failed", extra={"run_id": run_id})
        write_status(
            run_id,
            {
                "run_id": run_id,
                "state": "failed",
                "stage": "graph_execution",
                "error": str(exc),
                "updated_at": _now_iso(),
            },
            feature=FEATURE_NAME,
        )
