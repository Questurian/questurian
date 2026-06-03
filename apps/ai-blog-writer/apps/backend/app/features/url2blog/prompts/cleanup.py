"""Prompts for cleaning pasted source material (single + chunked).

Extracted verbatim from url2blog/routes.py — string constants only.
"""

URL2BLOG_TEXT_CLEANUP_PROMPT = """You are cleaning pasted article source material for downstream article generation.

This is a cleanup and extraction task, not a summarization task.

Return strict JSON only:
{{
  "title": "string",
  "language": "string",
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
- Keep the main article body, advice, facts, guidance, and practical information.
- Remove navigation, header/footer, legal/privacy/cookie blocks, social/share prompts, contact info, ads, CTAs, related-article sections, site branding, and boilerplate.
- Remove decorative image captions unless they add factual value.
- If a paragraph mixes factual content with promotion, preserve the factual portion and remove the promotional phrasing.
- Do not rewrite or summarize — preserve the original wording of article content.
- cleaned_text must be plain text only, preserving paragraph and list structure where useful.
- removed_blocks must contain at most 10 items.
- Each removed_blocks excerpt must be 220 characters or fewer.
- For language: return the full language name (e.g. "English", "Spanish", "French") not a code.
- If title or language is unclear, return an empty string for that field.
- Do not invent facts, dates, or metadata.

SOURCE MATERIAL:
{source_text}
"""


URL2BLOG_TEXT_CLEANUP_CHUNK_PROMPT = """You are cleaning chunk {chunk_index} of {chunk_count} from a longer pasted article for downstream article generation.

This is a cleanup and extraction task, not a summarization task.

Return strict JSON only:
{{
  "title": "string",
  "language": "string",
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
- Keep the main article body, advice, facts, guidance, and practical information.
- Remove navigation, header/footer, legal/privacy/cookie blocks, social/share prompts, contact info, ads, CTAs, related-article sections, site branding, and boilerplate.
- Remove decorative image captions unless they add factual value.
- If a paragraph mixes factual content with promotion, preserve the factual portion and remove the promotional phrasing.
- Do not rewrite or summarize — preserve the original wording of article content.
- cleaned_text must be plain text only, preserving paragraph and list structure where useful.
- removed_blocks must contain at most 10 items.
- Each removed_blocks excerpt must be 220 characters or fewer.
- Only return title or language if they are clearly visible in this chunk.
- Do not invent facts, dates, or metadata.

SOURCE CHUNK:
{source_text}
"""
