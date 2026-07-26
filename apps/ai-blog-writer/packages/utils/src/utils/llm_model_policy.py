"""Provider selection, model substitution, and Vertex configuration."""

import logging
import os
from typing import Optional


logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.5-flash-lite"
DEFAULT_LOCATION = "us-central1"
GEMINI3_LOCATION = "global"
ANTHROPIC_MODELS_ENABLED_ENV = "ANTHROPIC_MODELS_ENABLED"
ANTHROPIC_MODELS_ENABLED_DEFAULT = False
CLAUDE_GOOGLE_SUBSTITUTES = {
    "claude-opus-4-8": "gemini-3.1-pro-preview",
    "claude-opus-4-7": "gemini-3.1-pro-preview",
    "claude-sonnet-5": "gemini-2.5-pro",
}
DEFAULT_CLAUDE_GOOGLE_SUBSTITUTE = "gemini-3.1-pro-preview"
MIN_GENERATION_MAX_TOKENS = 64_000
_TRUTHY = {"1", "true", "yes", "on"}


def anthropic_models_enabled() -> bool:
    """Whether claude-* names may reach the Anthropic API."""
    raw = os.getenv(ANTHROPIC_MODELS_ENABLED_ENV)
    if raw is None or not raw.strip():
        return ANTHROPIC_MODELS_ENABLED_DEFAULT
    return raw.strip().lower() in _TRUTHY


def is_claude_model(model_name: Optional[str]) -> bool:
    return str(model_name or '').lower().startswith('claude')


def resolve_effective_model(model_name: Optional[str]) -> Optional[str]:
    """Map a requested model to the one that will actually serve the call.

    Non-Claude names and (once re-funded) Claude names pass through unchanged.
    """
    if not is_claude_model(model_name) or anthropic_models_enabled():
        return model_name
    substitute = CLAUDE_GOOGLE_SUBSTITUTES.get(
        str(model_name).strip().lower(), DEFAULT_CLAUDE_GOOGLE_SUBSTITUTE
    )
    logger.info(
        "Anthropic models are disabled (%s); serving '%s' with '%s'.",
        ANTHROPIC_MODELS_ENABLED_ENV,
        model_name,
        substitute,
    )
    return substitute


def _is_gemini3_model(model_name: str) -> bool:
    return model_name.lower().startswith('gemini-3')


def _resolve_vertex_project(project: Optional[str] = None) -> str:
    resolved_project = project or os.getenv('GOOGLE_CLOUD_PROJECT')
    if not resolved_project:
        raise RuntimeError(
            'Vertex AI not configured — GOOGLE_CLOUD_PROJECT is not set. Set GOOGLE_CLOUD_PROJECT (and optionally GOOGLE_CLOUD_LOCATION) once the new GCP project is ready.'
        )
    return resolved_project


def _resolve_vertex_location(location: Optional[str] = None) -> str:
    return location or os.getenv('GOOGLE_CLOUD_LOCATION', DEFAULT_LOCATION)


def _resolve_generation_max_tokens(requested: int) -> int:
    return max(requested, MIN_GENERATION_MAX_TOKENS)
