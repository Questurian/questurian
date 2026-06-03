"""Prompts for quality audit and publish-ready title generation.

Extracted verbatim from url2blog/routes.py — string constants only.
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


V2_TITLE_GENERATION_PROMPT = """You are generating a publish-ready title for a rewritten article.

Output requirements:
- Return ONLY the title text.
- Single line.
- No JSON, no markdown, no quotes.

Rules:
- Follow the title guideline while matching article intent.
- Keep it specific, clear, and naturally readable.
- Avoid clickbait and vague wording.
- Keep between 35 and 95 characters when feasible.

ARTICLE TYPE:
{article_type}

TITLE GUIDELINE:
{title_guideline}

NARRATIVE OR AUDIENCE FOCUS (OPTIONAL):
{narrative_focus}

SOURCE TITLE:
{source_title}

REWRITTEN ARTICLE (MARKDOWN BODY):
{rewritten_content}
"""
