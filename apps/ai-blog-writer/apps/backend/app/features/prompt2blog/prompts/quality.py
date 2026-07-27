from __future__ import annotations


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
- Judge only audience_match and tone_match. Word count, paragraph length, CTA
  and keyword presence are measured deterministically outside this prompt, so
  do not report them.
- audience_match: does the draft address the brief's audience at the right
  level of assumed knowledge?
- tone_match: does the prose sustain the brief's tone and voice?
- Score honestly. A draft that merely avoids mistakes is a 7, not a 9.
- A violated hard constraint is a required_revision, not a stylistic note.

HARD CONSTRAINTS:
{hard_constraints}

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
- Satisfy every item in HARD CONSTRAINTS. They are not stylistic preferences.

HARD CONSTRAINTS:
{hard_constraints}

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
