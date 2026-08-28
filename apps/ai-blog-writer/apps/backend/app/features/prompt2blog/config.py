from __future__ import annotations

from pathlib import Path

FEATURE_NAME = "prompt2blog"

DEFAULT_MODEL = "gemini-3.7-flash"

# The reader-facing compose and augmentation stages use the selected writer
# model, defaulting to this stronger model. This was "claude-opus-4-8" while
# Anthropic was funded; shared model resolution still supports that selection.
P2B_COMPOSE_MODEL = "gemini-3.1-pro-preview"

# Used only when an older client does not send its selected stack's audit model.
P2B_AUDIT_MODEL = "gemini-3.7-flash"

# V3 gives bounded, structured jobs to Sonnet at medium effort. Opus stays on
# the two stages where prose quality has the largest editing-cost impact:
# compose and repair. These are fixed independently from the selectable writer
# and audit roles so choosing a premium prose model cannot silently promote
# every small pipeline call to the same effort tier.
P2B_V3_OUTLINE_MODEL = "claude-sonnet-5-medium"
P2B_V3_GROUNDEDNESS_MODEL = "claude-sonnet-5-medium"
P2B_V3_TITLE_MODEL = "claude-sonnet-5-medium"

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

PROMPT2BLOG_FORMS_DIR = PROMPT2BLOG_OPTIONS_DIR / "forms"

PROMPT2BLOG_TOPIC_MODULES_DIR = PROMPT2BLOG_OPTIONS_DIR / "topic-modules"

PROMPT2BLOG_HOUSE_RULES_FILE = PROMPT2BLOG_OPTIONS_DIR / "house-rules.md"

PROMPT2BLOG_HEADLINES_FILE = PROMPT2BLOG_OPTIONS_DIR / "headlines.md"

# Repair used to be a single unconditional pass whose result was never
# re-gated. It is now a bounded loop back through the audit.
#
# One automatic attempt, not two. A repair pass is not one call: it rewrites
# the whole article on the writing model, runs the anti-AI enforcement pass,
# then re-runs grounding and the audit. On the measured Lima run that chain
# cost 85,012 tokens -- 35% of the whole run -- and a second attempt would
# have bought a point or two of score for the same price again. A draft the
# first repair could not rescue goes back as `needs_revision` instead.
P2B_REPAIR_MAX_ATTEMPTS = 1

# What one repair attempt is assumed to cost, measured off the Lima run
# (repair + anti-AI enforcement + groundedness + re-audit).
P2B_REPAIR_ESTIMATED_TOKENS = 90_000

# The ceiling a run may reach *before* an attempt is spent. Attempts are
# refused once `tokens_spent + P2B_REPAIR_ESTIMATED_TOKENS` would pass it, so
# an unusually expensive run stops paying for rescue attempts instead of
# doubling down. Set above the Lima run's pre-repair spend (~158k) on purpose:
# the first repair on a normal run must still be affordable.
P2B_RUN_TOKEN_BUDGET = 320_000

# How many times one run may be resumed after a failure. A resume costs the
# stages that had not run yet, so a stage that fails for a reason resuming
# cannot fix -- a commission the model keeps refusing, a permanently dead
# credential -- would otherwise let an operator buy the same tail repeatedly.
# Three is enough for a provider blip, a reconnect, and one more.
P2B_RESUME_MAX_ATTEMPTS = 3

# Editorial augmentation may only add to a draft. If the returned content drops
# below this share of the pre-augmentation word count, or loses section
# headings, the stage is rolled back rather than shipped.
P2B_AUGMENTATION_MIN_RETENTION_RATIO = 0.9

PROMPT2BLOG_CREATIVITY_LEVELS = {"low", "medium", "high"}

# creativity_level used to be rendered as the literal string "Creativity level:
# medium" inside an instructions blob while every prose call ran at a hardcoded
# temperature, so the control did nothing. It now sets the sampling temperature
# for the stages that actually write prose.
PROMPT2BLOG_CREATIVITY_TEMPERATURES = {"low": 0.05, "medium": 0.2, "high": 0.45}

PROMPT2BLOG_DEFAULT_COMPOSE_TEMPERATURE = PROMPT2BLOG_CREATIVITY_TEMPERATURES["medium"]

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
