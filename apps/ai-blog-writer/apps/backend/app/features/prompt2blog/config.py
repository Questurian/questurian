from __future__ import annotations

from pathlib import Path

FEATURE_NAME = "prompt2blog"

DEFAULT_MODEL = "gemini-2.5-flash"

# The reader-facing compose and augmentation stages use the selected writer
# model, defaulting to this stronger model. This was "claude-opus-4-8" while
# Anthropic was funded; shared model resolution still supports that selection.
P2B_COMPOSE_MODEL = "gemini-2.5-flash"

# Used only when an older client does not send its selected stack's audit model.
P2B_AUDIT_MODEL = "gemini-2.5-flash"

# Defaults for the three roles a route does not have to name. V3 gives bounded,
# structured jobs to Sonnet at medium effort, and Opus stays on the two stages
# where prose quality has the largest editing-cost impact: compose and repair.
#
# These were pinned rather than defaulted until routes could name them, which
# meant a route could only move two of the six calls a run makes. They are
# still separate from the writer and audit roles: the reason for pinning them
# was that a premium prose model must not silently promote every small call to
# the same effort tier, and a route that has to name each one cannot do that by
# accident.
P2B_V3_OUTLINE_MODEL = "claude-sonnet-5-medium"
P2B_V3_GROUNDEDNESS_MODEL = "claude-sonnet-5-medium"

# Structuring research is a bounded, schema-enforced job on prose someone else
# gathered: exactly what Sonnet is for. It is deliberately not the writing
# model -- this call is about shape, and the expensive model earns its place at
# compose.
P2B_V4_RESEARCH_STRUCTURE_MODEL = "claude-sonnet-5-medium"

# Who runs the interview.
#
# The spec chose a flash model for being "short, conversational". In practice
# the grill is the one place a weak model is most expensive: it decides what
# the article is, every later stage inherits that, and it is about six calls --
# so the cheapest thing in the pipeline to make good.
#
# Change this one line to move it. Anything in VERTEX_TOKEN_RATES works.
P2B_V4_GRILL_MODEL = "gemini-2.5-flash"

# Higher than the pipeline default. This call is judgement, not extraction: at
# a low temperature it proposes the safe question rather than the useful one,
# and the whole value of the grill is the sharp question nobody expected.
P2B_V4_GRILL_TEMPERATURE = 0.6

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

PROMPT2BLOG_VOICE_FILE = PROMPT2BLOG_OPTIONS_DIR / "voice" / "questurian-voice.md"

PROMPT2BLOG_LENGTHS_DIR = PROMPT2BLOG_OPTIONS_DIR / "lengths"

PROMPT2BLOG_WRITING_CONVENTIONS_FILE = (
    PROMPT2BLOG_OPTIONS_DIR / "voice" / "writing-conventions.md"
)

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
#
# RE-DERIVED, 2026-09-02, from the two runs that have complete accounting.
# Everything before PR #455 recorded zero for the intake leg, so the earlier
# number was set against receipts that omitted intake and every grounded
# search. Measured properly:
#
#   a2066506:  9 questions, 133,882 research tokens, 260,586 pre-repair
#   b29d66b4: 14 questions, 206,507 research tokens, 370,114 pre-repair
#
# Both were refused their one repair against the old 320,000, on drafts
# scoring 5 and 6 with actionable revisions waiting. The repair path had
# never once been affordable since the accounting was fixed, which is
# arithmetic rather than two unlucky runs: research costs about 14,800 a
# question, writing about 134,000, and a repair 90,000, so 320,000 left room
# for roughly three questions.
#
# 425,000 grants the repair up to about eleven questions, which covers the
# normal size. The ladder, projected from those rates rather than from any one
# run's receipt:
#
#   380,000 -> repair affordable to ~8 questions
#   400,000 -> ~9 to 10
#   425,000 -> ~11          <- set here
#   470,000 -> 14, the size that broke b29d66b4
#
# A fourteen question plan still will not fit, and `budget_projection` says so
# at the cut step while the plan can still be changed, rather than at the
# settle node when the money is already spent.
#
# Do not set this from a single run's actual pre-repair spend. a2066506
# finished at 260,586, which suggests 350,000 is enough for nine questions --
# but its writing leg was 89,707, the cheapest of six, against a median of
# 134,000. The projection uses the median, which is the honest basis for a
# plan nobody has run yet.
#
# P2B_REPAIR_ESTIMATED_TOKENS above is still untested: no run has repaired
# since the accounting was fixed, so 90,000 remains a measurement of a repair
# nobody has watched. Re-derive it the first time one actually runs.
P2B_RUN_TOKEN_BUDGET = 425_000

# The hard ceiling. Distinct from P2B_RUN_TOKEN_BUDGET above, which only asks
# whether one more *rescue* is affordable: this asks whether the run may
# continue at all, and refuses when it may not.
#
# v3 did not need one. Its first model call was the outline, and everything
# before it happened in a browser on the operator's own chatbot subscription.
# v4 moves the grill and both research passes in-app, and neither has an upper
# bound by construction -- the grill stops at agreement rather than at a
# question count (ADR 0030), and research is grounded web search. A bug that
# asks forty questions should cost a known amount and then stop.
#
# Set at roughly twice the budget above so it never fires on a run that is
# merely expensive; it exists for runaway, not for costly. The number is here,
# in one place, so a ceiling set wrong is obvious rather than mysterious.
P2B_RUN_TOKEN_CEILING = 650_000

# How many times the grill may look something up *during* the interview, on
# top of the one lookup it always makes on the seed.
#
# G2 (ADR 0030) is what keeps the grill short: anything it can look up, it
# never asks. It looked the seed up once and then went blind, so by the fourth
# turn the conversation could be about one neighbourhood while the grill was
# still working from a general city briefing -- and a grill that cannot look up
# where the conversation went is forced back into asking, which is the
# form-with-extra-steps failure the interview replaced (ADR 0033).
#
# Bounded because the grill stops at agreement rather than at a question count,
# so it has no upper bound on turns by construction and would have none on
# searches either. Three is enough to follow a conversation that narrows twice
# and still cheap beside a run: a grounded search measured 3-5k tokens on runs
# b78a9fe8 and 76b36468.
#
# This number is only enforceable because the receipt now counts grounded
# search at all (#440). Before that, adding searches here would have been
# spending against a ceiling that could not see them.
P2B_V4_GRILL_MAX_LOOKUPS = 3

# How many grounded searches research may have in flight at once.
#
# One question per search, and nothing in question four depends on question
# three, so the sequential loop was only ever the simplest thing to write. On
# run 76b36468 it cost roughly six minutes of a twenty-and-a-half minute
# research pass; concurrently that is about the slowest single search.
#
# Bounded rather than unbounded because the grounded-search rate limits are
# unknown and a run fans out as many searches as the work order has questions.
# Four is a deliberate first guess: enough to collapse most of the wait, small
# enough that a rate limit shows up as slow rather than as a wall of failures.
# Lower it here if searches start coming back empty.
P2B_V4_GATHER_CONCURRENCY = 4

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
