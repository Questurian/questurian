"""Prompts used by the deep-expansion and listicle-rewrite pipelines."""

GAP_ANALYSIS_PROMPT = """You are an expert content analyst reviewing a finished article.

Your task: Identify what is MISSING to make this article more complete, useful, and authoritative for readers.

Examine the article for:
1. Background context or foundational knowledge readers likely need
2. Topics mentioned but not explored deeply enough
3. Practical "how to apply this" sections that are absent
4. External data, statistics, research, or references that would strengthen claims
5. Questions a reader would naturally have after finishing that go unanswered

Article title: {title}
Article type: {article_type}

Article content:
{article_content}

Return strict JSON only — no prose, no markdown fences:
{{
  "gaps": [
    {{
      "type": "background_context" | "deeper_dive" | "practical_application" | "external_context" | "unanswered_question",
      "topic": "the specific topic or question that is missing",
      "reason": "why adding this would make the article more complete",
      "suggested_section_title": "proposed heading for the new section"
    }}
  ],
  "expansion_plan": "2-3 sentence summary describing what will be added and how it strengthens the article"
}}"""

EXPANSION_PROMPT = """You are expanding an existing article by adding new content.

CRITICAL RULES — read carefully before writing:
1. PRESERVE every word of the existing article content exactly as written — do not rephrase, reorder, or remove anything
2. ADD new sections and subsections that integrate naturally with the existing structure
3. Preserve the source meaning, details, and heading style; do not copy filler, hedges, or rambling cadence
4. New content must be accurate, substantive, and genuinely useful — not filler
5. Insert new sections where they make logical sense in the flow (not always at the end)
6. Do not add a new top-level H1 title — keep the existing title if present

What to add (gap analysis results):
{gaps_json}

Expansion plan:
{expansion_plan}

Original article to expand:
{article_content}

Return ONLY the complete expanded article in Markdown. Do not include any commentary or explanation — just the full article text."""

LISTICLE_DETECT_PROMPT = """You are analyzing an article to determine if it is a listicle.

A listicle is an article structured around a ranked or unranked list of items — such as dishes, restaurants, hotels, places, products, tips, books, movies, etc.

Article title: {title}

Article content (first 6000 chars):
{article_content}

Return strict JSON only — no prose, no markdown fences:
{{
  "is_listicle": true or false,
  "list_type": "dishes" | "restaurants" | "hotels" | "places" | "products" | "tips" | "movies" | "books" | "other" | null,
  "list_topic": "short description of what the list is about, e.g. best dishes in Peru" or null,
  "detected_items": ["Item Name 1", "Item Name 2"]
}}

Rules:
- detected_items should contain only the name/title of each item, not descriptions (max 20 items)
- If not a listicle, return is_listicle: false and null for everything else
- detected_items must be an array even if empty"""

LISTICLE_REWRITE_PROMPT = """You are rewriting a listicle article with a new, curated set of items chosen by the editor.

This is a COMPLETE REWRITE. The editor has decided exactly which items to include and in what order.
Use the original article as a reference for factual scope, intro/outro purpose, and formatting. Do not copy filler, hedges, or rambling cadence.

Article topic: {title}
Article type: {article_type}

Original article (reference only — do NOT copy item sections verbatim):
{original_article}

New item list — write about these items IN THIS EXACT ORDER, no more, no less:
{items_list}

Instructions:
1. Write a complete, polished article with a section for each item in the list above
2. Each section should be thorough, useful, and match the depth of the original
3. Preserve the original article's factual scope, intro purpose, and conclusion purpose without copying filler, hedges, or rambling cadence
4. Update the H1 title only if the item changes make it inaccurate — otherwise keep it
5. Do NOT include any items that are not in the list above
6. Do NOT change the order of items

Return ONLY the complete rewritten article in Markdown. No commentary, no explanation."""
