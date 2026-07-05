"""
Stage: Editorial augmentation.

Adds optional editorial blocks to improve comprehension and pacing while
preserving factual integrity.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.features.youtube2blog.config import (
    Y2B_EDITORIAL_AUGMENTATION_MAX_OUTPUT_TOKENS,
    Y2B_EDITORIAL_AUGMENTATION_MODEL,
)
from app.shared.prompts import ANTI_AI_TELLS_FULL
from app.shared.text import enforce_anti_ai_tells_markdown
from utils import get_vertex_llm, parse_json_response
from shared import Stage3Output, StageEditorialAugmentationOutput

logger = logging.getLogger(__name__)

# Pinned to the Claude editorial model (routed via get_vertex_llm's
# claude-* dispatch); callers may still pass an explicit model_name.
DEFAULT_MODEL = Y2B_EDITORIAL_AUGMENTATION_MODEL

EDITORIAL_COMPONENT_LABELS = {
    "pull_quote": "Pull Quote",
    "in_the_know_box": "In The Know",
    "key_takeaways_box": "Key Takeaways",
    "highlight_callout": "Highlight Callout",
    "faq_block": "FAQ Block",
}

Y2B_EDITORIAL_AUGMENTATION_PROMPT = """You are running YouTube2Blog EDITORIAL AUGMENTATION on a finished draft.

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
- <official_label> and <human label> must match the canonical label.
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

ARTICLE TYPE:
{article_type}
"""


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _safe_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _tokenize_words(value: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", _safe_str(value))


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
        return f"## Overview\n\n{paragraphs[0]}"

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


def _invoke_json_llm(*, prompt: str, model_name: str = DEFAULT_MODEL) -> tuple[dict[str, Any], str]:
    strict_prompt = (
        f"{prompt}\n\n"
        "CRITICAL OUTPUT RULE:\n"
        "Return ONLY one valid JSON object.\n"
        "No prose, no markdown, no code fences."
    )

    llm = get_vertex_llm(
        temperature=0.05,
        max_tokens=Y2B_EDITORIAL_AUGMENTATION_MAX_OUTPUT_TOKENS,
        model_name=model_name,
    )

    current_prompt = strict_prompt
    last_error = "Unknown JSON parse failure"
    last_response = ""

    for attempt in range(1, 4):
        raw_response = _safe_str(llm.invoke(current_prompt))
        last_response = raw_response

        try:
            parsed = parse_json_response(raw_response)
            return parsed, raw_response
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            logger.warning(
                "YouTube2Blog editorial JSON parse failed (attempt %d): %s",
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


def stage_editorial_augmentation(
    stage3: Stage3Output,
    *,
    fail_fast: bool = False,
    model_name: str = DEFAULT_MODEL,
    writing_model: str | None = None,
    tone_guidance: str | None = None,
) -> StageEditorialAugmentationOutput:
    """Apply optional editorial augmentation to stage 3 content."""
    prompt = (
        Y2B_EDITORIAL_AUGMENTATION_PROMPT
        .replace("{article_title}", stage3.title[:500])
        .replace("{article_content}", stage3.final_article[:20_000])
        .replace("{article_type}", stage3.article_type)
    )
    if tone_guidance:
        prompt = f"{prompt}\n\n{tone_guidance.strip()}"
    prompt = f"{prompt}\n\n{ANTI_AI_TELLS_FULL}"

    fallback = _sanitize_editorial_augmentation({}, fallback_content=stage3.final_article)

    # Pinned to the Claude editorial model regardless of the caller-supplied
    # base model (the graph runner passes the run's Gemini model here).
    _ = model_name
    editorial_model = writing_model or Y2B_EDITORIAL_AUGMENTATION_MODEL
    try:
        parsed, raw_response = _invoke_json_llm(
            prompt=prompt, model_name=editorial_model
        )
        if isinstance(parsed.get("augmented_content"), str):
            parsed["augmented_content"] = enforce_anti_ai_tells_markdown(
                parsed["augmented_content"],
                repair=lambda repair_prompt: _safe_str(
                    get_vertex_llm(
                        temperature=0.1,
                        max_tokens=Y2B_EDITORIAL_AUGMENTATION_MAX_OUTPUT_TOKENS,
                        model_name=editorial_model,
                    ).invoke(repair_prompt)
                ),
                context="youtube2blog editorial augmentation",
            )
        editorial = _sanitize_editorial_augmentation(
            parsed,
            fallback_content=stage3.final_article,
        )
        return StageEditorialAugmentationOutput(
            video_id=stage3.video_id,
            title=stage3.title,
            article_type=stage3.article_type,
            augmented_content=editorial["augmented_content"],
            components_added=editorial["components_added"],
            diagnostic=editorial["diagnostic"],
            augmentation_summary=editorial["augmentation_summary"],
            augmentation_applied=editorial["augmentation_applied"],
            debug_prompt=prompt,
            debug_raw_response=raw_response,
            error=None,
        )
    except Exception as exc:  # noqa: BLE001
        if fail_fast:
            raise RuntimeError(f"YouTube2Blog editorial augmentation failed: {exc}") from exc
        logger.warning("YouTube2Blog editorial augmentation failed: %s", exc)
        return StageEditorialAugmentationOutput(
            video_id=stage3.video_id,
            title=stage3.title,
            article_type=stage3.article_type,
            augmented_content=fallback["augmented_content"],
            components_added=fallback["components_added"],
            diagnostic=fallback["diagnostic"],
            augmentation_summary=fallback["augmentation_summary"],
            augmentation_applied=False,
            debug_prompt=prompt,
            debug_raw_response="",
            error=str(exc),
        )
