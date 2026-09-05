"""Provider selection, model substitution, and Vertex configuration."""

import logging
import os
from typing import Optional

from model_gateway import substitution as _substitution
from model_gateway.substitution import (  # noqa: F401  (re-exported)
    CLAUDE_GOOGLE_SUBSTITUTES,
    DEFAULT_CLAUDE_GOOGLE_SUBSTITUTE,
)


logger = logging.getLogger(__name__)

# The last resort when a caller names no model at all. Every caller in this
# repo now names a job instead, which is what the gateway answers for; this
# survives for the utils-level API, which has callers outside it.
DEFAULT_MODEL = "gemini-2.5-flash-lite"
DEFAULT_LOCATION = "us-central1"
GEMINI3_LOCATION = "global"
# Two independent ways a claude-* name can reach a real Claude, and they must
# not be conflated -- they differ in who pays and in what has to be installed.
#
#   ANTHROPIC_MODELS_ENABLED           the API-key path. Calls go to the
#                                      Anthropic API with ANTHROPIC_API_KEY and
#                                      bill Anthropic Console credit. Off, and
#                                      unfunded, since the credit ran out.
#
#   CLAUDE_SUBSCRIPTION_MODELS_ENABLED the subscription path. Calls shell out to
#                                      the Claude Code CLI this machine is
#                                      logged into and draw the plan holder's
#                                      own subscription allowance. No API key,
#                                      no extra dependency.
#
# Both default to off, in which case claude-* names are still substituted to
# Google exactly as before. When both are on the API-key path wins, so turning
# the new switch on can never change what an existing configured machine does.
ANTHROPIC_MODELS_ENABLED_ENV = "ANTHROPIC_MODELS_ENABLED"
ANTHROPIC_MODELS_ENABLED_DEFAULT = False
CLAUDE_SUBSCRIPTION_MODELS_ENABLED_ENV = "CLAUDE_SUBSCRIPTION_MODELS_ENABLED"
CLAUDE_SUBSCRIPTION_MODELS_ENABLED_DEFAULT = False

# What ``claude_provider()`` answers with. Callers dispatch on these rather than
# re-reading the environment, so there is one place that decides precedence.
CLAUDE_PROVIDER_NONE = "none"
CLAUDE_PROVIDER_ANTHROPIC_API = "anthropic-api"
CLAUDE_PROVIDER_SUBSCRIPTION_CLI = "subscription-cli"
MIN_GENERATION_MAX_TOKENS = 64_000
_TRUTHY = {"1", "true", "yes", "on"}


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in _TRUTHY


def anthropic_models_enabled() -> bool:
    """Whether claude-* names may reach the Anthropic API on an API key."""
    return _substitution.anthropic_models_enabled()


def claude_subscription_models_enabled() -> bool:
    """Whether claude-* names may reach the Claude Code CLI's subscription.

    Deliberately a separate switch from ``anthropic_models_enabled``: that one
    spends API credit against a key, this one spends the plan holder's own
    subscription allowance. Anthropic's terms allow the latter only for the
    plan holder's own use, so it is local-authoring only -- do not set it on a
    shared or serverless deployment.
    """
    return _substitution.claude_subscription_models_enabled()


def claude_provider() -> str:
    """Which transport, if any, will serve a claude-* name.

    The API-key path takes precedence so that switching the subscription path
    on cannot silently re-point a machine that already had a funded key.
    """
    # Asks this module's own two functions rather than the gateway's, so a
    # caller that replaces one of them -- which the tests do, to exercise a
    # path this machine cannot reach -- still changes the answer. The rule for
    # reading the environment is the gateway's; the seam is this module's.
    if anthropic_models_enabled():
        return CLAUDE_PROVIDER_ANTHROPIC_API
    if claude_subscription_models_enabled():
        return CLAUDE_PROVIDER_SUBSCRIPTION_CLI
    return CLAUDE_PROVIDER_NONE


def claude_models_reachable() -> bool:
    """Whether a claude-* name survives ``resolve_effective_model`` unchanged."""
    return claude_provider() != CLAUDE_PROVIDER_NONE


def is_claude_model(model_name: Optional[str]) -> bool:
    return _substitution.is_claude_model(model_name)


def resolve_effective_model(model_name: Optional[str]) -> Optional[str]:
    """Map a requested model to the one that will actually serve the call.

    The rule and the map are the gateway's -- the dashboard shows an operator
    that a job asking for Claude is really running on Gemini, and it can only
    do that if there is one map rather than two. This runs one line before
    provider dispatch, so it is still the gate: while it rewrites the name, the
    Claude branches downstream are unreachable no matter what a caller asks
    for.
    """
    if not is_claude_model(model_name) or claude_models_reachable():
        return model_name
    substitute = CLAUDE_GOOGLE_SUBSTITUTES.get(
        str(model_name).strip().lower(), DEFAULT_CLAUDE_GOOGLE_SUBSTITUTE
    )
    logger.info(
        "No Claude path is switched on (%s and %s are both off); "
        "serving '%s' with '%s'.",
        ANTHROPIC_MODELS_ENABLED_ENV,
        CLAUDE_SUBSCRIPTION_MODELS_ENABLED_ENV,
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
