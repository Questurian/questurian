"""Compatibility facade for Listicle Content Generation writing.

Prompt contracts, policy, builders, retry construction, and output validation
live in cohesive adjacent modules. Runtime selection and execution reuse the
``blurb_composition_*`` modules.
"""

from app.shared.prompts import ANTI_AI_TELLS_BLURB

from .angle_assignment import ANTI_AI_PROMPT_CATEGORIES, ListicleAngle
from .blurb_composition_retry import build_retry_prompt
from .listicle_prompt_builders import (
    build_generation_prompt,
    build_identity_only_writer_prompt,
    build_lean_writer_prompt,
    build_writer_prompt,
)
from .listicle_prompt_policy import (  # noqa: F401
    ARTICLE_TYPE_LABELS,
    BLURB_MAX_WORDS,
    BLURB_MIN_WORDS,
    CATEGORY_PROMPT_VARIANTS,
    INTRO_CATEGORY_ANGLE_GUIDANCE,
    INTRO_MAX_WORDS,
    INTRO_MIN_WORDS,
    LEAN_AVOID_LINES_BY_CATEGORY,
    LEAN_AVOID_LINES_SHARED,
    LIST_TONE_GUIDANCE,
    LISTICLE_ANGLE_GUIDANCE,
    NIGHTLIFE_BLURB_CALIBRATION,
    REVIEW_DISCLOSURE_PHRASES,
    angle_block as _angle_block,
    build_common_rules as _build_common_rules,
    format_location_for_prompt,
    intro_category_angle_block as _intro_category_angle_block,
    render_supporting_context as _render_supporting_context,
    tone_block as _tone_block,
    voice_rules_block as _voice_rules_block,
)
from .listicle_writer_contracts import (
    ListTone,
    ListicleArticleType,
    ListicleCategory,
    ListicleFieldType,
    ListicleWriterTarget,
)
from .listicle_writer_validation import (  # noqa: F401
    BULLET_PATTERN,
    EM_DASH_PATTERN,
    FENCE_PATTERN,
    FOOTNOTE_PATTERN,
    HEADING_PATTERN,
    PROCESS_PATTERN,
    RATING_PATTERN,
    WORD_PATTERN,
    normalize_block as _normalize_block,
    strip_generation_fence,
    validate_generated_text,
    word_count as _word_count,
)
from .writer_brief_contracts import WriterBrief
from .writer_brief_rendering import render_source_facts_block

__all__ = [
    "ANTI_AI_PROMPT_CATEGORIES",
    "ANTI_AI_TELLS_BLURB",
    "ARTICLE_TYPE_LABELS",
    "BLURB_MAX_WORDS",
    "BLURB_MIN_WORDS",
    "BULLET_PATTERN",
    "CATEGORY_PROMPT_VARIANTS",
    "EM_DASH_PATTERN",
    "FENCE_PATTERN",
    "FOOTNOTE_PATTERN",
    "HEADING_PATTERN",
    "INTRO_CATEGORY_ANGLE_GUIDANCE",
    "INTRO_MAX_WORDS",
    "INTRO_MIN_WORDS",
    "LEAN_AVOID_LINES_BY_CATEGORY",
    "LEAN_AVOID_LINES_SHARED",
    "LISTICLE_ANGLE_GUIDANCE",
    "LIST_TONE_GUIDANCE",
    "ListTone",
    "ListicleAngle",
    "ListicleArticleType",
    "ListicleCategory",
    "ListicleFieldType",
    "ListicleWriterTarget",
    "NIGHTLIFE_BLURB_CALIBRATION",
    "PROCESS_PATTERN",
    "RATING_PATTERN",
    "REVIEW_DISCLOSURE_PHRASES",
    "WORD_PATTERN",
    "WriterBrief",
    "build_generation_prompt",
    "build_identity_only_writer_prompt",
    "build_lean_writer_prompt",
    "build_retry_prompt",
    "build_writer_prompt",
    "format_location_for_prompt",
    "render_source_facts_block",
    "strip_generation_fence",
    "validate_generated_text",
]
