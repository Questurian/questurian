"""URL2Blog configuration: model/profile constants, env-flag knobs, and
their resolver helpers. No LLM calls, no request handling.

Extracted verbatim from url2blog/routes.py.
"""

import os

from fastapi import HTTPException

from .llm.coerce import _safe_bool, _safe_str


FEATURE_NAME = "url2blog"

URL2BLOG_ALLOWED_MODELS = (
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
)
URL2BLOG_ALLOWED_EXECUTION_PROFILES = (
    "standard",
    "lean",
)
URL2BLOG_DEFAULT_EXECUTION_PROFILE = "standard"
URL2BLOG_DEFAULT_MODEL = "gemini-2.5-flash-lite"
DEFAULT_GROUNDED_MODEL = "gemini-2.5-flash-lite"
# Stage-specific overrides: the guideline rewrite (compose) and editorial
# augmentation are the writing-quality stages, pinned to a stronger model than
# the run's base. Both were "claude-opus-4-8" until Anthropic billing ran out;
# restore those values (and set ANTHROPIC_MODELS_ENABLED=1) once it is funded.
URL2BLOG_COMPOSE_MODEL = "gemini-3.1-pro-preview"
URL2BLOG_EDITORIAL_AUGMENTATION_MODEL = "gemini-3.1-pro-preview"
SHORT_ARTICLE_WORD_THRESHOLD = 450
DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS = 3
MIN_EXPANDED_WORD_DELTA = 80
MIN_EXPANDED_WORD_RATIO = 1.1
MAX_LENGTH_EXPANSION_PASSES = 2
URL2BLOG_USE_MARKDOWN_LONG_STAGES_ENV = "URL2BLOG_USE_MARKDOWN_LONG_STAGES"
URL2BLOG_USE_MARKDOWN_LONG_STAGES_DEFAULT = True
URL2BLOG_LONG_OUTPUT_MAX_RETRIES = 3
URL2BLOG_INPUT_CHAR_LIMIT_ENV = "URL2BLOG_INPUT_CHAR_LIMIT"
URL2BLOG_INPUT_CHAR_LIMIT_DEFAULT = 0
URL2BLOG_MAX_TOKENS_FLOOR_ENV = "URL2BLOG_MAX_TOKENS_FLOOR"
URL2BLOG_MAX_TOKENS_FLOOR_DEFAULT = 8192
URL2BLOG_LONG_OUTPUT_ALLOW_SOURCE_FALLBACK_ENV = (
    "URL2BLOG_LONG_OUTPUT_ALLOW_SOURCE_FALLBACK"
)
URL2BLOG_LONG_OUTPUT_ALLOW_SOURCE_FALLBACK_DEFAULT = False
URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED_ENV = "URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED"
URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED_DEFAULT = True
URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED_ENV = (
    "URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED"
)
URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED_DEFAULT = True
URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED_ENV = "URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED"
URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED_DEFAULT = True
URL2BLOG_EDITORIAL_BLUEPRINT_MAX_COMPONENTS = 3
URL2BLOG_EDITORIAL_RECHECK_MIN_QUALITY_SCORE = 8.0
URL2BLOG_EDITORIAL_RECHECK_MIN_FACT_SCORE = 8.0
URL2BLOG_EDITORIAL_RECHECK_NEAR_PASS_MARGIN = 0.5
URL2BLOG_TEXT_CLEANUP_CHUNKING_CHAR_THRESHOLD = 18_000
URL2BLOG_TEXT_CLEANUP_CHUNK_TARGET_CHARS = 12_000
URL2BLOG_TEXT_CLEANUP_MAX_OUTPUT_TOKENS = 8_192
URL2BLOG_TEXT_CLEANUP_MAX_REMOVED_BLOCKS = 10
URL2BLOG_TEXT_CLEANUP_REMOVED_EXCERPT_CHARS = 220


def _resolve_url2blog_model(model_name: str | None) -> str:
    """Resolve and validate URL2Blog model selection."""
    candidate = _safe_str(model_name).lower()
    if not candidate:
        return URL2BLOG_DEFAULT_MODEL
    if candidate in URL2BLOG_ALLOWED_MODELS:
        return candidate
    # Internal stage overrides (compose / editorial augmentation) run on
    # Anthropic models, which bypass the user-selectable allowlist.
    if candidate.startswith("claude-"):
        return candidate
    raise HTTPException(
        status_code=400,
        detail=(
            "Invalid URL2Blog model. Allowed values: "
            + ", ".join(URL2BLOG_ALLOWED_MODELS)
        ),
    )


def _resolve_execution_profile(profile: str | None) -> str:
    """Resolve and validate URL2Blog execution profile."""
    candidate = _safe_str(profile).lower()
    if not candidate:
        return URL2BLOG_DEFAULT_EXECUTION_PROFILE
    if candidate in URL2BLOG_ALLOWED_EXECUTION_PROFILES:
        return candidate
    raise HTTPException(
        status_code=400,
        detail=(
            "Invalid URL2Blog execution_profile. Allowed values: "
            + ", ".join(URL2BLOG_ALLOWED_EXECUTION_PROFILES)
        ),
    )


def _read_bool_env(key: str, default: bool = False) -> bool:
    """Read a boolean environment flag with permissive parsing."""
    raw_value = os.getenv(key)
    if raw_value is None:
        return default
    return _safe_bool(raw_value, default=default)


def _read_int_env(
    key: str,
    *,
    default: int = 0,
    min_value: int = 0,
    max_value: int = 1_000_000,
) -> int:
    """Read an integer environment flag with clamping."""
    raw_value = os.getenv(key)
    if raw_value is None:
        return default
    try:
        parsed = int(str(raw_value).strip())
    except (TypeError, ValueError):
        return default
    return max(min_value, min(max_value, parsed))


def _llm_context_text(text: str) -> str:
    """Optionally clamp very large prompt fragments via env override."""
    limit = _read_int_env(
        URL2BLOG_INPUT_CHAR_LIMIT_ENV,
        default=URL2BLOG_INPUT_CHAR_LIMIT_DEFAULT,
        min_value=0,
        max_value=1_000_000,
    )
    if limit <= 0:
        return text
    return text[:limit]


def _resolve_max_tokens(requested: int) -> int:
    """Lift low per-stage token caps to a configurable floor."""
    floor = _read_int_env(
        URL2BLOG_MAX_TOKENS_FLOOR_ENV,
        default=URL2BLOG_MAX_TOKENS_FLOOR_DEFAULT,
        min_value=0,
        max_value=65_536,
    )
    if floor <= 0:
        return requested
    return max(requested, floor)


def _use_markdown_long_stages() -> bool:
    """Return whether long-form URL2Blog stages should use markdown transport."""
    return _read_bool_env(
        URL2BLOG_USE_MARKDOWN_LONG_STAGES_ENV,
        default=URL2BLOG_USE_MARKDOWN_LONG_STAGES_DEFAULT,
    )


def _allow_long_output_source_fallback() -> bool:
    """Return whether long-output JSON fallback can reuse prior stage content."""
    return _read_bool_env(
        URL2BLOG_LONG_OUTPUT_ALLOW_SOURCE_FALLBACK_ENV,
        default=URL2BLOG_LONG_OUTPUT_ALLOW_SOURCE_FALLBACK_DEFAULT,
    )


def _use_editorial_blueprint() -> bool:
    """Return whether pre-draft editorial blueprint planning is enabled."""
    return _read_bool_env(
        URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED_ENV,
        default=URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED_DEFAULT,
    )


def _use_editorial_insert_only_post() -> bool:
    """Return whether post editorial phase should run in insert-only mode."""
    return _read_bool_env(
        URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED_ENV,
        default=URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED_DEFAULT,
    )


def _use_editorial_post_recheck() -> bool:
    """Return whether to run post-editorial quality/fact recheck."""
    return _read_bool_env(
        URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED_ENV,
        default=URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED_DEFAULT,
    )


def _resolve_grounded_model(model_name: str | None) -> str:
    """Resolve model used for grounded search enrichment."""
    resolved = _resolve_url2blog_model(model_name)
    if resolved in {"gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"}:
        return resolved
    return DEFAULT_GROUNDED_MODEL


__all__ = [
    "FEATURE_NAME",
    "URL2BLOG_ALLOWED_MODELS",
    "URL2BLOG_ALLOWED_EXECUTION_PROFILES",
    "URL2BLOG_DEFAULT_EXECUTION_PROFILE",
    "URL2BLOG_DEFAULT_MODEL",
    "URL2BLOG_COMPOSE_MODEL",
    "URL2BLOG_EDITORIAL_AUGMENTATION_MODEL",
    "DEFAULT_GROUNDED_MODEL",
    "SHORT_ARTICLE_WORD_THRESHOLD",
    "DEFAULT_MAX_EXTERNAL_CONTEXT_ITEMS",
    "MIN_EXPANDED_WORD_DELTA",
    "MIN_EXPANDED_WORD_RATIO",
    "MAX_LENGTH_EXPANSION_PASSES",
    "URL2BLOG_USE_MARKDOWN_LONG_STAGES_ENV",
    "URL2BLOG_USE_MARKDOWN_LONG_STAGES_DEFAULT",
    "URL2BLOG_LONG_OUTPUT_MAX_RETRIES",
    "URL2BLOG_INPUT_CHAR_LIMIT_ENV",
    "URL2BLOG_INPUT_CHAR_LIMIT_DEFAULT",
    "URL2BLOG_MAX_TOKENS_FLOOR_ENV",
    "URL2BLOG_MAX_TOKENS_FLOOR_DEFAULT",
    "URL2BLOG_LONG_OUTPUT_ALLOW_SOURCE_FALLBACK_ENV",
    "URL2BLOG_LONG_OUTPUT_ALLOW_SOURCE_FALLBACK_DEFAULT",
    "URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED_ENV",
    "URL2BLOG_EDITORIAL_BLUEPRINT_ENABLED_DEFAULT",
    "URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED_ENV",
    "URL2BLOG_EDITORIAL_INSERT_ONLY_POST_ENABLED_DEFAULT",
    "URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED_ENV",
    "URL2BLOG_EDITORIAL_POST_RECHECK_ENABLED_DEFAULT",
    "URL2BLOG_EDITORIAL_BLUEPRINT_MAX_COMPONENTS",
    "URL2BLOG_EDITORIAL_RECHECK_MIN_QUALITY_SCORE",
    "URL2BLOG_EDITORIAL_RECHECK_MIN_FACT_SCORE",
    "URL2BLOG_EDITORIAL_RECHECK_NEAR_PASS_MARGIN",
    "URL2BLOG_TEXT_CLEANUP_CHUNKING_CHAR_THRESHOLD",
    "URL2BLOG_TEXT_CLEANUP_CHUNK_TARGET_CHARS",
    "URL2BLOG_TEXT_CLEANUP_MAX_OUTPUT_TOKENS",
    "URL2BLOG_TEXT_CLEANUP_MAX_REMOVED_BLOCKS",
    "URL2BLOG_TEXT_CLEANUP_REMOVED_EXCERPT_CHARS",
    "_resolve_url2blog_model",
    "_resolve_execution_profile",
    "_read_bool_env",
    "_read_int_env",
    "_llm_context_text",
    "_resolve_max_tokens",
    "_use_markdown_long_stages",
    "_allow_long_output_source_fallback",
    "_use_editorial_blueprint",
    "_use_editorial_insert_only_post",
    "_use_editorial_post_recheck",
    "_resolve_grounded_model",
]
