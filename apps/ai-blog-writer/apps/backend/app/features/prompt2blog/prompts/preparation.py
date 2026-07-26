from __future__ import annotations


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
