"""Editorial component labels + blueprint/enrichment/augmentation prompts.

Extracted verbatim from url2blog/routes.py. The augmentation writer prompt
gets the shared anti-AI-tells voice rules appended at the bottom of this
module.
"""

from app.shared.prompts import ANTI_AI_TELLS_FULL

EDITORIAL_COMPONENT_LABELS = {
    "pull_quote": "Pull Quote",
    "in_the_know_box": "In The Know",
    "key_takeaways_box": "Key Takeaways",
    "highlight_callout": "Highlight Callout",
    "faq_block": "FAQ Block",
}


V2_EDITORIAL_BLUEPRINT_PROMPT = """You are planning editorial support before drafting a rewritten article.

Goal:
- Decide whether editorial components should be planned into the first draft.
- If needed, specify a restrained component plan that improves readability
  without changing factual scope.

Return strict JSON only:
{
  "apply_plan": true,
  "summary": "string",
  "components": [
    {
      "component": "pull_quote|in_the_know_box|key_takeaways_box|highlight_callout|faq_block",
      "placement": "string",
      "objective": "string",
      "priority": "high|medium"
    }
  ],
  "drafting_directives": ["string"],
  "guardrails": ["string"]
}

Rules:
- Keep plan restrained: usually 0-2 components, maximum 3.
- Do not require components that need new facts.
- Prefer component placement that supports existing section flow.
- If article is already clear, set apply_plan=false and empty components.
- Drafting directives must be actionable and concise.
- Guardrails must reinforce factual integrity and non-redundancy.

SOURCE TITLE:
{source_title}

SOURCE CONTENT:
{source_content}

SELECTED ARTICLE TYPE:
{article_type}

GUIDELINE:
{guideline}

TITLE GUIDELINE:
{title_guideline}

NARRATIVE OR AUDIENCE FOCUS (OPTIONAL):
{narrative_focus}

SOURCE FACT ANCHORS (OPTIONAL):
{source_facts}
"""


V2_SHORT_ARTICLE_ENRICHMENT_PROMPT = """You are running URL2Blog SHORT-ARTICLE ENRICHMENT with Google Search grounding.

Goal:
- For short source articles, gather limited external context that deepens reader value.
- Keep it tasteful: only high-signal, directly relevant context.

Return strict JSON only:
{
  "context_points": [
    {
      "insight": "string",
      "why_it_matters": "string",
      "source_url": "https://...",
      "confidence": "high|medium"
    }
  ],
  "usage_note": "string"
}

Rules:
- Maximum points: {max_points}
- Prefer official sources and reputable publications.
- No speculative or weakly related details.
- Run lookup in the source language and English; include one additional relevant regional language when useful.
- If useful context is not found, return an empty list.
- Keep insights concise and directly actionable for writers.

SOURCE URL:
{source_url}

SOURCE TITLE:
{source_title}

SOURCE CONTENT:
{source_content}

SELECTED ARTICLE TYPE:
{article_type}

NARRATIVE OR AUDIENCE FOCUS (OPTIONAL):
{narrative_focus}
"""


V2_EDITORIAL_AUGMENTATION_PROMPT = """You are running URL2Blog EDITORIAL AUGMENTATION on a finished draft.

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
- `<official_label>` and `<human label>` must match the canonical label.
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

SELECTED ARTICLE TYPE:
{article_type}

NARRATIVE OR AUDIENCE FOCUS (OPTIONAL):
{narrative_focus}
"""


_VOICE_RULES_SUFFIX = "\n\n" + ANTI_AI_TELLS_FULL

V2_EDITORIAL_AUGMENTATION_PROMPT += _VOICE_RULES_SUFFIX
