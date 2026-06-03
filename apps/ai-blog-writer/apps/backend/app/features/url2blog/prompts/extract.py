"""Prompts for source extraction, translation, and article-type classification.

Extracted verbatim from url2blog/routes.py — string constants only.
"""

EXTRACT_PROMPT = """You are a content extraction assistant.

Given the raw text content scraped from a web article, extract:
1. The article title
2. The main article content (body text only, no ads, navigation, footers, sidebars, or boilerplate)
3. The language the article is written in

Return ONLY valid JSON in this exact format:
{
  "title": "The article title here",
  "content": "The full article body text here, preserving paragraphs with newlines",
  "language": "English"
}

Rules:
- Extract the actual article title, not the site name
- For content, include only the main article body
- Preserve paragraph breaks as newlines
- Remove any ads, navigation, cookie notices, author bios, related articles, etc.
- If you cannot find a clear article, set title to "" and content to the main text you can find
- For language, return the full language name (e.g. "English", "Spanish", "French", "Japanese", "Portuguese") not a code
- Output ONLY the JSON object, no other text

RAW PAGE TEXT:
"""


TRANSLATE_PROMPT = """You are a professional translator.

Translate the following article title and content from {source_language} into English.

Preserve:
- The original meaning and tone
- Paragraph breaks (newlines)
- Any proper nouns, brand names, or place names (keep original if no standard English equivalent)

Return ONLY valid JSON in this exact format:
{{
  "title": "The translated title in English",
  "content": "The translated article content in English, preserving paragraphs with newlines"
}}

ORIGINAL TITLE:
{title}

ORIGINAL CONTENT:
{content}
"""


CLASSIFY_ARTICLE_TYPE_PROMPT = """You are an article-type classification engine.

Your ONLY task is to classify an article into one allowed article type.
Choose exactly ONE article type from the allowed list.

Reasoning requirement:
- Explain classification in terms of editorial intent and reader outcome.
- Do NOT summarize source facts or quote source wording.

OUTPUT FORMAT (STRICT JSON ONLY):
{{
  "classification": "<exact article type name from allowed list>",
  "confidence": <float between 0.00 and 1.00>,
  "reasoning": "<1-2 sentence editorial-intent explanation>"
}}

ALLOWED ARTICLE TYPES:
{article_types}

ARTICLE TITLE:
{title}

ARTICLE CONTENT:
{content}
"""
