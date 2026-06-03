"""Prompts for length-expansion passes.

Extracted verbatim from url2blog/routes.py — string constants only.
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

EDITORIAL BLUEPRINT DIRECTIVES (OPTIONAL):
{editorial_blueprint_directives}
"""


V2_LENGTH_EXPANSION_MARKDOWN_PROMPT = """You are running URL2Blog LENGTH EXPANSION.

Goal:
- Expand the rewritten article so it is materially longer than the source.
- Increase useful depth while preserving factual integrity and structure.

Output requirements:
- Return ONLY markdown article body text.
- No JSON, no explanations, no code fences.
- Include at least three `##` section headings; optional `###` subheadings allowed.
- Do not include a `#` H1 heading (title is generated separately).

Rules:
- Keep all existing valid facts and practical guidance.
- Do not invent facts.
- Expand with concrete context, clarifications, caveats, and comparisons
  grounded in the provided source and context.
- Do not compress existing sections.
- Expanded content must be at least {min_word_target} words.
- Expanded content must be longer than source content ({source_word_count} words).
- Do not use academic signpost phrasing like "In conclusion".

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

EDITORIAL BLUEPRINT DIRECTIVES (OPTIONAL):
{editorial_blueprint_directives}
"""
