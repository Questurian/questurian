"""When a job asks for Claude and gets Gemini instead, and why.

Three jobs in this repo name a Claude model -- ``p2b.outline``,
``p2b.groundedness`` and ``p2b.research_structure``. None of them has run on
Claude for months. Both Claude paths are switched off, so every one of those
requests is quietly rewritten to a Gemini model before it reaches a provider.

That rewrite was real and invisible: nothing naming a Gemini model anywhere in
the repo revealed that these three stages were spending on Gemini, so their
calls landed on the most expensive model available with no trace of the
decision. Moving the map here does not change the behaviour. It changes
whether you can see it.

Two independent switches can turn a Claude name back into a real Claude call,
and they must not be conflated -- they differ in who pays and in what has to
be installed:

``ANTHROPIC_MODELS_ENABLED``
    The API-key path. Calls go to the Anthropic API on ``ANTHROPIC_API_KEY``
    and bill Console credit. Off, and unfunded, since the credit ran out.

``CLAUDE_SUBSCRIPTION_MODELS_ENABLED``
    The subscription path. Calls shell out to the Claude Code CLI this machine
    is logged into and draw the plan holder's own allowance. No API key, no
    extra dependency. Anthropic's terms allow this only for the plan holder's
    own use, so it is local-authoring only -- never set it on a shared or
    serverless deployment.

Both default to off. When both are on the API-key path wins, so switching the
subscription path on can never silently re-point a machine that already had a
funded key configured.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

MAP_PATH = Path(__file__).with_name("substitution.json")

ANTHROPIC_MODELS_ENABLED_ENV = "ANTHROPIC_MODELS_ENABLED"
CLAUDE_SUBSCRIPTION_MODELS_ENABLED_ENV = "CLAUDE_SUBSCRIPTION_MODELS_ENABLED"

PROVIDER_NONE = "none"
PROVIDER_ANTHROPIC_API = "anthropic-api"
PROVIDER_SUBSCRIPTION_CLI = "subscription-cli"

def _load(path: Path = MAP_PATH) -> tuple[dict[str, str], str]:
    """The map, from the file the dashboard also reads.

    JSON rather than a Python dict for the same reason the registry is: the
    dashboard has to show an operator that a job asking for Claude is really
    running on Gemini, and it cannot import Python to find out.
    """
    payload = json.loads(path.read_text(encoding="utf-8"))
    fallback = payload.get("defaultSubstitute")
    if not isinstance(fallback, str) or not fallback:
        raise ValueError(f"{path.name} has no defaultSubstitute")
    substitutes = payload.get("substitutes")
    if not isinstance(substitutes, dict):
        raise ValueError(f"{path.name} has no substitutes map")
    return {str(k).lower(): str(v) for k, v in substitutes.items()}, fallback


CLAUDE_GOOGLE_SUBSTITUTES, DEFAULT_CLAUDE_GOOGLE_SUBSTITUTE = _load()

_TRUTHY = frozenset({"1", "true", "yes", "on"})


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in _TRUTHY


def anthropic_models_enabled() -> bool:
    """Whether claude-* names may reach the Anthropic API on an API key."""
    return _env_flag(ANTHROPIC_MODELS_ENABLED_ENV)


def claude_subscription_models_enabled() -> bool:
    """Whether claude-* names may reach the Claude Code CLI's subscription."""
    return _env_flag(CLAUDE_SUBSCRIPTION_MODELS_ENABLED_ENV)


def claude_provider() -> str:
    """Which transport, if any, will serve a claude-* name."""
    if anthropic_models_enabled():
        return PROVIDER_ANTHROPIC_API
    if claude_subscription_models_enabled():
        return PROVIDER_SUBSCRIPTION_CLI
    return PROVIDER_NONE


def claude_models_reachable() -> bool:
    """Whether a claude-* name survives ``effective_model`` unchanged."""
    return claude_provider() != PROVIDER_NONE


def is_claude_model(model_name: Optional[str]) -> bool:
    return str(model_name or "").lower().startswith("claude")


def effective_model(model_name: Optional[str]) -> Optional[str]:
    """The model that will actually serve a call for this name.

    Non-Claude names pass through unchanged. A Claude name passes through when
    either Claude path is on, and is substituted only when neither is.
    """
    if not is_claude_model(model_name) or claude_models_reachable():
        return model_name

    substitute = CLAUDE_GOOGLE_SUBSTITUTES.get(
        str(model_name).strip().lower(), DEFAULT_CLAUDE_GOOGLE_SUBSTITUTE
    )
    logger.info(
        "No Claude path is switched on (%s and %s are both off); serving "
        "'%s' with '%s'.",
        ANTHROPIC_MODELS_ENABLED_ENV,
        CLAUDE_SUBSCRIPTION_MODELS_ENABLED_ENV,
        model_name,
        substitute,
    )
    return substitute


def substitution_report() -> list[dict[str, Optional[str]]]:
    """Every Claude name and what it is actually served with right now.

    For the dashboard, so the substitution is something an operator can read
    rather than something they have to know.
    """
    names = sorted(CLAUDE_GOOGLE_SUBSTITUTES)
    return [
        {
            "requested": name,
            "served_by": effective_model(name),
            "substituted": str(effective_model(name)) != name,
        }
        for name in names
    ]
