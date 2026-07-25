"""
Shared LLM client utilities for Vertex AI / Google Gemini and Anthropic Claude.

Provides a factory function to create configured LLM instances
that can be used across different pipelines. Model names starting with
"claude" are routed to the Anthropic Messages API; everything else goes
to Vertex AI.
"""

import logging
import os
from typing import Any, Optional

from langchain_google_vertexai import ChatVertexAI, VertexAI

logger = logging.getLogger(__name__)

# Default model configuration
DEFAULT_MODEL = "gemini-2.5-flash-lite"
DEFAULT_LOCATION = "us-central1"

# Gemini 3.x models are served only from the global endpoint; regional
# locations (including us-central1) return 404 for them.
GEMINI3_LOCATION = "global"

# --- Anthropic availability switch -------------------------------------------
# Anthropic billing is exhausted, so claude-* selections are transparently
# served by their Google counterparts instead of failing with a 400 "credit
# balance is too low". None of the Claude transport was removed: set
# ANTHROPIC_MODELS_ENABLED=1 (and restore ANTHROPIC_API_KEY) to route back.
ANTHROPIC_MODELS_ENABLED_ENV = "ANTHROPIC_MODELS_ENABLED"
ANTHROPIC_MODELS_ENABLED_DEFAULT = False

# Substitutes are matched by role: the Opus-class writers map to Gemini's
# deep-reasoning writer, Sonnet to the faster tier. Every value is already in
# the writer allowlist (app/shared/writer_models.py).
CLAUDE_GOOGLE_SUBSTITUTES = {
    "claude-opus-4-8": "gemini-3.1-pro-preview",
    "claude-opus-4-7": "gemini-3.1-pro-preview",
    "claude-sonnet-5": "gemini-2.5-pro",
}
DEFAULT_CLAUDE_GOOGLE_SUBSTITUTE = "gemini-3.1-pro-preview"

_TRUTHY = {"1", "true", "yes", "on"}


def anthropic_models_enabled() -> bool:
    """Whether claude-* names may reach the Anthropic API."""
    raw = os.getenv(ANTHROPIC_MODELS_ENABLED_ENV)
    if raw is None or not raw.strip():
        return ANTHROPIC_MODELS_ENABLED_DEFAULT
    return raw.strip().lower() in _TRUTHY


def is_claude_model(model_name: Optional[str]) -> bool:
    return str(model_name or "").lower().startswith("claude")


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
    return model_name.lower().startswith("gemini-3")


# Free-text generation calls share one large response ceiling. Call sites may
# describe a smaller expected response, but they must never accidentally starve
# a writer or let model reasoning consume the space reserved for reader-facing
# output. Structured tool calls keep their requested, schema-sized ceiling.
# Providers bill actual generated tokens, not this ceiling.
MIN_GENERATION_MAX_TOKENS = 64_000

_vertexai_init_state: tuple[str, str] | None = None


def _resolve_vertex_project(project: Optional[str] = None) -> str:
    resolved_project = project or os.getenv("GOOGLE_CLOUD_PROJECT")
    if not resolved_project:
        raise RuntimeError(
            "Vertex AI not configured — GOOGLE_CLOUD_PROJECT is not set. "
            "Set GOOGLE_CLOUD_PROJECT (and optionally GOOGLE_CLOUD_LOCATION) "
            "once the new GCP project is ready."
        )
    return resolved_project


def _resolve_vertex_location(location: Optional[str] = None) -> str:
    return location or os.getenv("GOOGLE_CLOUD_LOCATION", DEFAULT_LOCATION)


def _get_anthropic_client(*, model_name: str) -> Any:
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set; cannot invoke Anthropic model "
            f"'{model_name}'."
        )

    try:
        import anthropic  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "anthropic SDK is not installed. Run `pip install -r requirements.txt`."
        ) from exc

    return anthropic.Anthropic(api_key=api_key)


def _message_text(message: Any) -> str:
    text_parts = [
        block.text
        for block in getattr(message, "content", []) or []
        if getattr(block, "type", None) == "text"
        and isinstance(getattr(block, "text", None), str)
    ]
    return "\n".join(text_parts).strip()


def _resolve_generation_max_tokens(requested: int) -> int:
    return max(requested, MIN_GENERATION_MAX_TOKENS)


def _empty_message_error(message: Any) -> RuntimeError:
    usage = getattr(message, "usage", None)
    output_tokens = getattr(usage, "output_tokens", None)
    block_types = [
        str(getattr(block, "type", type(block).__name__))
        for block in getattr(message, "content", []) or []
    ]
    return RuntimeError(
        "Anthropic returned no text "
        f"(stop_reason={getattr(message, 'stop_reason', None)!r}, "
        f"output_tokens={output_tokens!r}, content_types={block_types!r})"
    )


class ClaudeTextLLM:
    """Minimal Anthropic client exposing the same `.invoke(prompt) -> str`
    surface as the LangChain VertexAI wrapper, so pipeline call sites can
    swap models without code changes.

    Claude Opus 4.x rejects the `temperature` parameter, so it is accepted
    but not forwarded. Streaming keeps large max_tokens requests within the
    API's non-streaming time limits.
    """

    def __init__(self, *, model_name: str, max_tokens: int) -> None:
        self.model_name = model_name
        self.max_tokens = max_tokens

    def invoke(self, prompt: str) -> str:
        client = _get_anthropic_client(model_name=self.model_name)
        with client.messages.stream(
            model=self.model_name,
            max_tokens=self.max_tokens,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            message = stream.get_final_message()

        text = _message_text(message)
        if not text:
            raise _empty_message_error(message)
        return text


def _gemini_chat_text(content: Any) -> str:
    """Extract plain text from a ChatVertexAI response.

    Gemini 3.x returns content as a list of parts (text parts carry a
    `thought_signature` alongside the text); older models return a str.
    """
    if isinstance(content, str):
        return content.strip()
    text_parts = [
        part.get("text")
        for part in (content or [])
        if isinstance(part, dict)
        and part.get("type") == "text"
        and isinstance(part.get("text"), str)
    ]
    return "\n".join(text_parts).strip()


class Gemini3ChatTextLLM:
    """ChatVertexAI wrapper exposing the same `.invoke(prompt) -> str` surface
    as the LangChain VertexAI completion wrapper.

    Gemini 3.x is unreachable through the legacy completion class: the model
    only exists on the global endpoint and its parts-shaped responses fail the
    completion parser. Temperature is accepted but not forwarded — Google
    recommends leaving Gemini 3 at its default temperature.
    """

    def __init__(
        self,
        *,
        model_name: str,
        max_tokens: int,
        project: str,
    ) -> None:
        self.model_name = model_name
        self.max_tokens = max_tokens
        self.project = project

    def invoke(self, prompt: str) -> str:
        llm = ChatVertexAI(
            model_name=self.model_name,
            max_tokens=self.max_tokens,
            project=self.project,
            location=GEMINI3_LOCATION,
        )
        message = llm.invoke(prompt)
        text = _gemini_chat_text(getattr(message, "content", None))
        if not text:
            raise RuntimeError(
                f"Gemini model '{self.model_name}' returned no text "
                f"(response_metadata={getattr(message, 'response_metadata', None)!r})"
            )
        return text


def invoke_anthropic_structured_tool(
    *,
    prompt: str,
    model_name: str,
    tool_name: str,
    tool_description: str,
    input_schema: dict[str, Any],
    max_tokens: int = 4096,
) -> tuple[dict[str, Any], str]:
    """Force an Anthropic model to return a schema-shaped tool payload."""
    if not model_name.lower().startswith("claude"):
        raise RuntimeError(
            f"Structured writer calls require an Anthropic model, got '{model_name}'."
        )

    client = _get_anthropic_client(model_name=model_name)
    message = client.messages.create(
        model=model_name,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
        tools=[
            {
                "name": tool_name,
                "description": tool_description,
                "input_schema": input_schema,
            }
        ],
        tool_choice={"type": "tool", "name": tool_name},
    )

    for block in getattr(message, "content", []) or []:
        if (
            getattr(block, "type", None) == "tool_use"
            and getattr(block, "name", None) == tool_name
        ):
            payload = getattr(block, "input", None)
            if isinstance(payload, dict):
                resolved_model = getattr(message, "model", None) or model_name
                return payload, resolved_model

    raise RuntimeError("Anthropic structured writer returned no tool output")


# Gemini's function-declaration schema is a subset of JSON Schema; keys such as
# `additionalProperties` and `$schema` are rejected outright.
_GEMINI_SCHEMA_KEYS = {
    "type",
    "description",
    "enum",
    "format",
    "nullable",
    "properties",
    "required",
    "items",
}


def _gemini_tool_schema(schema: Any) -> Any:
    """Recursively drop schema keywords Gemini's tool declarations reject."""
    if isinstance(schema, list):
        return [_gemini_tool_schema(item) for item in schema]
    if not isinstance(schema, dict):
        return schema

    cleaned: dict[str, Any] = {}
    for key, value in schema.items():
        if key not in _GEMINI_SCHEMA_KEYS:
            continue
        if key == "properties" and isinstance(value, dict):
            cleaned[key] = {
                prop: _gemini_tool_schema(sub) for prop, sub in value.items()
            }
        elif key == "items":
            cleaned[key] = _gemini_tool_schema(value)
        else:
            cleaned[key] = value
    return cleaned


def _invoke_gemini_structured_tool(
    *,
    prompt: str,
    model_name: str,
    tool_name: str,
    tool_description: str,
    input_schema: dict[str, Any],
    max_tokens: int,
    project: Optional[str] = None,
) -> tuple[dict[str, Any], str]:
    """Gemini equivalent of the Anthropic forced-tool call."""
    resolved_project = _resolve_vertex_project(project)
    location = (
        GEMINI3_LOCATION
        if _is_gemini3_model(model_name)
        else _resolve_vertex_location()
    )

    llm = ChatVertexAI(
        model_name=model_name,
        max_tokens=max_tokens,
        project=resolved_project,
        location=location,
    )
    bound = llm.bind_tools(
        [
            {
                "name": tool_name,
                "description": tool_description,
                "parameters": _gemini_tool_schema(input_schema),
            }
        ],
        tool_choice=tool_name,
    )
    message = bound.invoke(prompt)

    for call in getattr(message, "tool_calls", []) or []:
        if call.get("name") == tool_name and isinstance(call.get("args"), dict):
            return call["args"], model_name

    raise RuntimeError(
        f"Gemini structured writer returned no '{tool_name}' tool call "
        f"(response_metadata={getattr(message, 'response_metadata', None)!r})"
    )


def invoke_structured_tool(
    *,
    prompt: str,
    model_name: str,
    tool_name: str,
    tool_description: str,
    input_schema: dict[str, Any],
    max_tokens: int = 4096,
    project: Optional[str] = None,
) -> tuple[dict[str, Any], str]:
    """Force a schema-shaped tool payload from whichever provider serves
    ``model_name``. Callers get the same ``(payload, resolved_model)`` contract
    regardless of whether Anthropic is switched on."""
    effective_model = resolve_effective_model(model_name) or model_name

    if is_claude_model(effective_model):
        return invoke_anthropic_structured_tool(
            prompt=prompt,
            model_name=effective_model,
            tool_name=tool_name,
            tool_description=tool_description,
            input_schema=input_schema,
            max_tokens=max_tokens,
        )

    return _invoke_gemini_structured_tool(
        prompt=prompt,
        model_name=effective_model,
        tool_name=tool_name,
        tool_description=tool_description,
        input_schema=input_schema,
        max_tokens=max_tokens,
        project=project,
    )


def get_vertex_llm(
    temperature: float = 0.1,
    max_tokens: int = 2048,
    model_name: Optional[str] = None,
    project: Optional[str] = None,
    location: Optional[str] = None,
) -> "VertexAI | ClaudeTextLLM | Gemini3ChatTextLLM":
    """
    Create a configured LLM instance (Vertex AI, or Anthropic for claude-* models).

    Args:
        temperature: Sampling temperature (0.0-1.0). Lower = more deterministic.
                    Use 0.1 for structured output, 0.3 for creative tasks.
        max_tokens: Maximum tokens in response.
        model_name: Model to use (default: gemini-2.5-flash-lite)
        project: Google Cloud project ID (default: from GOOGLE_CLOUD_PROJECT env)
        location: Google Cloud location (default: from GOOGLE_CLOUD_LOCATION env or us-central1)

    Returns:
        Configured VertexAI instance ready for invocation.

    Raises:
        RuntimeError: If GOOGLE_CLOUD_PROJECT is not set and project not provided.
    """
    effective_max_tokens = _resolve_generation_max_tokens(max_tokens)

    # Substitutes a Google model when Anthropic is switched off; otherwise a
    # no-op. Runs before dispatch so claude-* never reaches the Anthropic branch.
    model_name = resolve_effective_model(model_name)

    # Anthropic routing: claude-* models bypass Vertex entirely.
    if is_claude_model(model_name):
        logger.debug(
            "Routing LLM call to Anthropic: "
            f"model={model_name}, max_tokens={effective_max_tokens}"
        )
        return ClaudeTextLLM(
            model_name=model_name, max_tokens=effective_max_tokens
        )

    resolved_project = _resolve_vertex_project(project)

    # Gemini 3.x routing: global endpoint + chat API (see Gemini3ChatTextLLM).
    if _is_gemini3_model(model_name or ""):
        logger.debug(
            "Routing LLM call to Gemini 3 chat path: "
            f"model={model_name}, max_tokens={effective_max_tokens}"
        )
        return Gemini3ChatTextLLM(
            model_name=model_name,
            max_tokens=effective_max_tokens,
            project=resolved_project,
        )

    resolved_location = _resolve_vertex_location(location)

    # Resolve model
    resolved_model = model_name or DEFAULT_MODEL

    logger.debug(
        f"Creating VertexAI LLM: model={resolved_model}, "
        f"temperature={temperature}, max_tokens={effective_max_tokens}, "
        f"project={resolved_project}, location={resolved_location}"
    )

    return VertexAI(
        model_name=resolved_model,
        temperature=temperature,
        max_tokens=effective_max_tokens,
        project=resolved_project,
        location=resolved_location,
    )


def _ensure_vertexai_initialized(*, project: str, location: str) -> None:
    global _vertexai_init_state
    state = (project, location)
    if _vertexai_init_state == state:
        return

    import vertexai

    vertexai.init(project=project, location=location)
    _vertexai_init_state = state


def get_vertex_generative_model(
    *,
    model_name: Optional[str] = None,
    project: Optional[str] = None,
    location: Optional[str] = None,
) -> Any:
    """Create a Vertex GenerativeModel for multimodal Gemini calls."""
    resolved_project = _resolve_vertex_project(project)
    resolved_location = _resolve_vertex_location(location)
    _ensure_vertexai_initialized(project=resolved_project, location=resolved_location)

    from vertexai.generative_models import GenerativeModel

    return GenerativeModel(model_name or DEFAULT_MODEL)


def vertex_part_from_data(*, data: bytes, mime_type: str) -> Any:
    from vertexai.generative_models import Part

    return Part.from_data(data=data, mime_type=mime_type)


def invoke_vertex_multimodal_text(
    parts: list[Any],
    *,
    model_name: Optional[str] = None,
    project: Optional[str] = None,
    location: Optional[str] = None,
) -> str:
    """Invoke Gemini multimodal content through the shared Vertex factory."""
    model = get_vertex_generative_model(
        model_name=model_name,
        project=project,
        location=location,
    )
    response = model.generate_content(parts)
    return str(getattr(response, "text", "") or "").strip()
