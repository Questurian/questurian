"""Prompts and guidelines for guideline-driven rewrite + hard-rewrite repair.

Extracted verbatim from url2blog/routes.py. Writer prompts get the shared
anti-AI-tells voice rules appended at the bottom of this module.
"""

from app.shared.prompts import ANTI_AI_TELLS_FULL

SEO_SAFE_CONTENT_GENERATION_GUIDELINES = """SEO-SAFE CONTENT GENERATION GUIDELINES (2026-READY)

Write for readers first and SEO second. Use natural travel-news language, avoid keyword stuffing, avoid repetitive SEO headings, and make the article feel edited by a human. Include SEO elements only where they improve clarity: a strong headline, concise subhead, clean section structure, accurate metadata, and natural keywords. SEO structure and keywords never override anti-AI voice rules.

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

EDITORIAL BLUEPRINT DIRECTIVES (OPTIONAL):
{editorial_blueprint_directives}
"""


V2_REWRITE_RETRY_FEEDBACK_SUFFIX = """RETRY CONTEXT:
This is rewrite attempt #{retry_attempt} after a failed quality gate.
Prior overall score: {previous_overall_score}/10
Prior ngram overlap signal: {previous_ngram_overlap}
Recommended rewrite intensity: {rewrite_intensity}

Quality feedback summary:
{quality_summary}

Required revisions to address now:
{required_revisions}

Retry rules:
- Apply all required revisions directly in this draft.
- Change structure decisively where needed; do not perform light paraphrase-only edits.
- Preserve factual meaning, but rewrite with clearly improved usefulness and flow.
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

EDITORIAL BLUEPRINT DIRECTIVES (OPTIONAL):
{editorial_blueprint_directives}
"""


V2_GUIDELINE_REWRITE_MARKDOWN_PROMPT = """You are improving an extracted article so it better matches a target article-type guideline.

Primary goal:
- Deliver a materially transformed draft with stronger reader value.
- Improve structure, clarity, and editorial fit against the guideline.
- Keep factual content anchored to the source article; do not invent facts.

Output requirements:
- Return ONLY markdown article body text.
- No JSON, no explanations, no code fences.
- Include at least three `##` section headings; optional `###` subheadings allowed.
- Do not include a `#` H1 heading (title is generated separately).

Rules:
- Preserve factual meaning from source content, but do not mirror source sequencing.
- Add concrete reader value (context, interpretation, practical guidance) beyond paraphrase.
- Avoid copying source phrasing; do not reuse long verbatim fragments.
- Keep complete article prose, not a bullet-list article.
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

EDITORIAL BLUEPRINT DIRECTIVES (OPTIONAL):
{editorial_blueprint_directives}
"""


V2_REWRITE_REPAIR_MARKDOWN_PROMPT = """You are running URL2Blog HARD REWRITE.

The previous draft is not strong enough. Rewrite it so it is:
- less like the source wording/flow,
- more informative for the reader,
- stricter on guideline compliance.

Output requirements:
- Return ONLY markdown article body text.
- No JSON, no explanations, no code fences.
- Include at least three `##` section headings; optional `###` subheadings allowed.
- Do not include a `#` H1 heading (title is generated separately).

Rules:
- Preserve factual meaning from source; do not invent details.
- Do not mirror source paragraph order.
- Provide clearer interpretation and practical utility.
- Avoid near-verbatim phrasing from source.
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

EDITORIAL BLUEPRINT DIRECTIVES (OPTIONAL):
{editorial_blueprint_directives}
"""


_VOICE_RULES_SUFFIX = "\n\n" + ANTI_AI_TELLS_FULL

V2_GUIDELINE_REWRITE_PROMPT += _VOICE_RULES_SUFFIX
V2_REWRITE_REPAIR_PROMPT += _VOICE_RULES_SUFFIX
V2_GUIDELINE_REWRITE_MARKDOWN_PROMPT += _VOICE_RULES_SUFFIX
V2_REWRITE_REPAIR_MARKDOWN_PROMPT += _VOICE_RULES_SUFFIX
