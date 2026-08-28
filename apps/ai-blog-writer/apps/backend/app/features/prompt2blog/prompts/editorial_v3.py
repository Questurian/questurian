"""Prompt2Blog v3 writing prompts.

Every v3 prompt is handed one assembled instruction stack instead of a
guideline pair, and the exact evidence records instead of cleaned source text.
The authority order is stated in the stack itself, so these templates only have
to keep the stage honest about what it may add.
"""

P2B_V3_OUTLINE_PROMPT = """You are a commissioning editor planning an article before it is written.

Goal:
Plan the sections that answer the approved commission using only the verified
evidence records. Plan the structure only. Do not write the article.

Return strict JSON only:
{{
  "working_title": "string",
  "direct_answer_focus": "string",
  "sections": [
    {{
      "heading": "string",
      "purpose": "string",
      "claim_ids": ["string"],
      "requirement_ids": ["string"],
      "target_words": 0
    }}
  ],
  "takeaway_focus": "string",
  "commission_alignment": "string",
  "unsupported_requirements": ["string"]
}}

Rules:
- Plan at least 3 and at most 12 sections.
- Headings must be specific and distinct. No generic "Introduction" or
  "Conclusion" headings.
- Every section must name the claim_ids it rests on, using IDs that exist in
  the evidence records. Never cite a claim the records do not contain.
- Every section must name the requirement_ids it serves, using the locked
  commission's requirement IDs.
- The primary subject controls the article. A context-only reference may
  calibrate a fact inside a section; it may never be what a section is about,
  and it may never appear as a heading subject.
- Only an approved comparator may share comparison scope, and only when the
  scope mode allows it.
- If the commission asks for something the evidence cannot support, list it in
  unsupported_requirements instead of planning a section that would need an
  invented fact.
- target_words across all sections should total roughly the target word count.
- commission_alignment must explain in one or two sentences how this structure
  answers the core reader question for the primary subject.

{instructions}

TARGET WORD COUNT:
{target_word_count}
"""

P2B_V3_COMPOSE_PROMPT = """You are an expert editor writing a publish-ready article from verified evidence.

Goal:
Write the article the approved commission describes, using only the evidence
records supplied.

Return strict JSON only:
{{
  "improved_title": "string",
  "improved_content": "string",
  "commission_alignment_summary": "string",
  "improvements_applied": ["string"],
  "remaining_gaps": ["string"]
}}

Hard rules:
- Every factual statement must trace to a claim in the evidence records.
  Preserve attribution, dates, units, geography, and stated uncertainty.
- Never invent a bridge fact, scene, quotation, experience, statistic, price,
  consensus, or practical detail. An unsupported point stays a visible gap and
  belongs in remaining_gaps.
- The evidence records are internal working material. Never cite them in the
  article: no claim IDs, no source IDs, no "(Source 1)", no numbered
  references of any kind. The reader cannot see them.
- Never name the outlet, publication, site, or report a fact came from, and
  never attribute by its position in the records. Name an actor or institution
  only when it is part of the story itself -- the ministry that set a fare, the
  museum that publishes a price -- not because it is where the fact was found.
- Keep the approved form, primary subject, scope mode, and reference roles. A
  context-only reference may calibrate a fact; it may never become a
  co-subject, a recurring section, a ranking, or a verdict.
- Answer the core reader question and deliver the stated reader outcome.
- Honour every exclusion in the commission.
- improved_content must not contain a `#` H1.
- Use at least 3 `##` headings.
- Include one direct 40-60 word answer near the top.
- Include a concise takeaway section near the end. It synthesises the
  decisions the article already supported, in fresh wording rather than copied
  sentences. Never let a material fact, figure, or place appear there for the
  first time.
- Follow the STYLE DIRECTIVE exactly. Tone, length, and brand voice are
  requirements, not suggestions.
- Follow the SECTION PLAN when one is provided: use its headings, in order, and
  hold each section to roughly its word budget. Depart from it only where the
  evidence makes a planned section unsupportable, and say so in remaining_gaps.

SECTION PLAN:
{outline}

{instructions}

SEO-SAFE RULES:
{seo_guideline}

STYLE DIRECTIVE (REQUIRED):
{style_directive}
"""


P2B_V3_GROUNDEDNESS_PROMPT = """You are a fact-grounding checker for travel articles.

Goal:
Find statements in the draft that the evidence records do not support.

Return strict JSON only:
{{
  "grounded": true,
  "assessment": "string",
  "unsupported_claims": [
    {{
      "claim": "string",
      "reason": "string",
      "severity": "high|low"
    }}
  ]
}}

What counts as unsupported:
- Any figure, date, rule, price, duration, capacity, or named entity that no
  claim in the records states.
- A claim stated more confidently, more recently, or more broadly than the
  record it rests on. Check attribution, as-of dates, geography, units, and
  stated uncertainty against the record itself.
- A conflict resolved in the prose that the records leave unresolved.
- Safety, health, legal, or entry guidance the records do not establish.
- Superlatives and rankings presented as fact.

What does NOT count:
- General background a well-informed writer would state without a source.
- Statements the draft already marks as unconfirmed, approximate, or variable.
- Restatement or paraphrase of something a record does say.
- Advice framed as judgement rather than fact.

Rules:
- severity is "high" when a reader could be misled into a booking, spending,
  legal, or safety decision. Otherwise "low".
- Quote the claim as it appears in the draft.
- grounded is true only when there are no high-severity unsupported claims.
- Do not rewrite the article.

EVIDENCE RECORDS:
{evidence_records}

DRAFT TITLE:
{rewritten_title}

DRAFT CONTENT:
{rewritten_content}
"""

P2B_V3_QUALITY_AUDIT_PROMPT = """You are a quality auditor for commissioned articles.

Goal:
Score the draft on commission fidelity, evidence discipline, form fit, and
reader utility — and on whether it delivers the article the working title
promised.

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
- Treat these as failures, not style notes: the article drifts from the
  approved form; a context-only reference organizes a section or earns a
  verdict; the core reader question goes unanswered; an exclusion is broken; a
  statement outruns the evidence record behind it.
- guideline_coverage_score is fidelity to the approved commission and its
  article form.
- The working title under "Original title" is a promise made to a reader who
  has not read the article yet. Judge the draft against that promise, not only
  against the commission. A commission can drift from the title it came from,
  and a draft that follows a drifted commission faithfully is still the wrong
  article: "Where to eat in Lima right now" that names no restaurant, dish,
  price, or neighborhood has failed, however cleanly it executes its form.
  Where the draft answers a narrower or different question than the title
  promises, say so in required_revisions, name what the reader came for and did
  not get, and cap overall_score at 5.
- originality_score is not a measure of tidiness. Wire copy is tidy. Score it
  on whether a person would choose to read this over the search results it was
  built from.
- Mark too_close_to_source=true when phrasing or structure tracks an evidence
  record too closely.
- Judge only audience_match and tone_match. Word count, paragraph length, CTA,
  and keyword presence are measured deterministically outside this prompt, so
  do not report them.
- Score honestly. A draft that merely avoids mistakes is a 7, not a 9.
- MEASURED CHECKS below are counted outside this prompt and are not opinions.
  While any of them is false, overall_score may not exceed 6, and the failure
  must appear in required_revisions. Length is a band with two edges: a draft
  at a third of its target length is not publishable, and neither is one that
  overruns the band. Never infer which way a length check missed -- when
  target_word_count_met is FAIL, `word_count_verdict` states the direction and
  the size of the miss, and your required_revisions must say the same thing it
  does.

{instructions}

STYLE DIRECTIVE (REQUIRED):
{style_directive}

MEASURED CHECKS (counted, not judged):
{measured_checks}

DRAFT TITLE:
{rewritten_title}

DRAFT CONTENT:
{rewritten_content}
"""

P2B_V3_REPAIR_PROMPT = """You are running a repair pass on a commissioned article.

Goal:
Fix the prose and structure the auditor flagged, without changing what the
article is or what it claims.

Return strict JSON only:
{{
  "improved_title": "string",
  "improved_content": "string",
  "commission_alignment_summary": "string",
  "improvements_applied": ["string"],
  "remaining_gaps": ["string"]
}}

Rules:
- Resolve each required revision directly.
- A revision that states a length change gives the direction and the number of
  words. Move that way. Never lengthen a draft asked to be cut, or cut one
  asked to be lengthened.
- Repair prose and structure only. You may not create a fact, and you may not
  change the commission: not the form, the primary subject, the scope mode, the
  reference roles, the requirements, or the exclusions.
- Never add a fact the evidence records do not contain. Remove or explicitly
  mark as unconfirmed anything flagged as unsupported.
- Never promote a context-only reference, add a comparator, or broaden scope to
  satisfy a revision.
- Never cite evidence records in the prose: no claim IDs, no source IDs, no
  numbered references, and no naming the outlet or publication a fact came
  from. An actor or institution in the story may be named; the reporter of it
  may not.
- Keep complete article prose with clear `##` / `###` structure.
- Where support is missing, state the uncertainty plainly and list it in
  remaining_gaps.

REQUIRED REVISIONS:
{required_revisions}

PREVIOUS TITLE:
{previous_title}

PREVIOUS CONTENT:
{previous_content}

{instructions}

STYLE DIRECTIVE (REQUIRED):
{style_directive}
"""

P2B_V3_TITLE_PROMPT = """You are an expert headline editor.

Goal:
Write exactly one final title for this commissioned article.

Output rules (strict):
- Return exactly one line.
- No quotes, no markdown, no alternatives, no explanation.
- Keep the original title's intent and subject. It is the author's intent, not
  a template to copy or a phrase to abandon.
- Name the primary subject. Never headline a context-only reference.
- Promise only what the article delivers and the evidence supports.

HEADLINE STANDARD:
{headline_instructions}

APPROVED COMMISSION SUMMARY:
{commission_summary}

BASELINE TITLE:
{previous_title}

FINAL ARTICLE CONTENT:
{rewritten_content}
"""
