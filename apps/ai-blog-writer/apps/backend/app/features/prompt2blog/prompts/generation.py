from __future__ import annotations


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
