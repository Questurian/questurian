"""Prompts for source-fact extraction, coverage audit, and fact repair.

Extracted verbatim from url2blog/routes.py — string constants only.
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

EDITORIAL BLUEPRINT DIRECTIVES (OPTIONAL):
{editorial_blueprint_directives}
"""


V2_FACT_REPAIR_MARKDOWN_PROMPT = """You are repairing a rewritten article to restore missing source facts.

Output requirements:
- Return ONLY markdown article body text.
- No JSON, no explanations, no code fences.
- Include at least three `##` section headings; optional `###` subheadings allowed.
- Do not include a `#` H1 heading (title is generated separately).

Rules:
- Keep existing strong structure and readability.
- Reintroduce missing source facts naturally and precisely.
- Do not invent new facts.
- Do not remove already-correct details.
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

EDITORIAL BLUEPRINT DIRECTIVES (OPTIONAL):
{editorial_blueprint_directives}
"""
