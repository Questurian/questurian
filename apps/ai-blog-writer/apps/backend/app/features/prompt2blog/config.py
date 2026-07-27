from __future__ import annotations

from pathlib import Path

FEATURE_NAME = "prompt2blog"

DEFAULT_MODEL = "gemini-2.5-flash-lite"

# The reader-facing compose and augmentation stages use the selected writer
# model, defaulting to this stronger model. This was "claude-opus-4-8" while
# Anthropic was funded; shared model resolution still supports that selection.
P2B_COMPOSE_MODEL = "gemini-3.1-pro-preview"

# The quality audit judges prose written by the writer model. A judge weaker
# than the writer produces noisy scores and spurious repair triggers, so the
# audit runs a tier above DEFAULT_MODEL rather than on the analysis model.
P2B_AUDIT_MODEL = "gemini-2.5-flash"

EDITORIAL_COMPONENT_LABELS = {
    "pull_quote": "Pull Quote",
    "in_the_know_box": "In The Know",
    "key_takeaways_box": "Key Takeaways",
    "highlight_callout": "Highlight Callout",
    "faq_block": "FAQ Block",
}

PROMPT2BLOG_DATA_DIR = Path(__file__).resolve().parents[3] / "data"

PROMPT2BLOG_GUIDELINES_DIR = PROMPT2BLOG_DATA_DIR / "guidelines"

PROMPT2BLOG_TITLE_GUIDELINES_DIR = PROMPT2BLOG_DATA_DIR / "title"

PROMPT2BLOG_OPTIONS_DIR = PROMPT2BLOG_DATA_DIR / "prompt2blog"

PROMPT2BLOG_TONES_DIR = PROMPT2BLOG_OPTIONS_DIR / "tones"

PROMPT2BLOG_LENGTHS_DIR = PROMPT2BLOG_OPTIONS_DIR / "lengths"

PROMPT2BLOG_BRAND_VOICES_DIR = PROMPT2BLOG_OPTIONS_DIR / "brand-voices"

PROMPT2BLOG_CREATIVITY_LEVELS = {"low", "medium", "high"}

PROMPT2BLOG_CLEANUP_MODE = "ai_always_aggressive_v1"

PROMPT2BLOG_CLEANUP_CHUNKING_CHAR_THRESHOLD = 18_000

PROMPT2BLOG_CLEANUP_CHUNK_TARGET_CHARS = 12_000

PROMPT2BLOG_CLEANUP_MAX_OUTPUT_TOKENS = 8_192

PROMPT2BLOG_CLEANUP_MAX_REMOVED_BLOCKS = 10

PROMPT2BLOG_CLEANUP_REMOVED_EXCERPT_CHARS = 220

PROMPT2BLOG_GUIDELINE_FILE_ALIASES = {
    "opinionpiece": "opinionpieces",
    "interview": "interviewarticles",
    "comparisonarticle": "comparisonarticleavsb",
}

PROMPT2BLOG_TITLE_FILE_ALIASES = {
    "disqualifiers": "disqualifiersegnolistarticles",
}
