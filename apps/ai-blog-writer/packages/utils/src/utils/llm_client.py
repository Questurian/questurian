"""Public provider-agnostic LLM facade."""

import logging
from typing import Any, Optional

from langchain_google_vertexai import ChatVertexAI, VertexAI  # noqa: F401

from .anthropic_transport import (
    _empty_message_error,
    _get_anthropic_client as _create_anthropic_client,
    _message_text,
)
from .gemini_tools import (  # noqa: F401
    Gemini3ChatTextLLM as Gemini3ChatTextLLM,
    _gemini_chat_text as _gemini_chat_text,
    _gemini_tool_schema as _sanitize_gemini_tool_schema,
    _invoke_gemini_structured_tool as _invoke_gemini_tool,
    _strip_for_gemini as _strip_for_gemini,
)
from .llm_model_policy import (  # noqa: F401
    ANTHROPIC_MODELS_ENABLED_DEFAULT as ANTHROPIC_MODELS_ENABLED_DEFAULT,
    ANTHROPIC_MODELS_ENABLED_ENV as ANTHROPIC_MODELS_ENABLED_ENV,
    CLAUDE_GOOGLE_SUBSTITUTES as CLAUDE_GOOGLE_SUBSTITUTES,
    DEFAULT_CLAUDE_GOOGLE_SUBSTITUTE as DEFAULT_CLAUDE_GOOGLE_SUBSTITUTE,
    DEFAULT_LOCATION as DEFAULT_LOCATION,
    DEFAULT_MODEL as DEFAULT_MODEL,
    GEMINI3_LOCATION as GEMINI3_LOCATION,
    MIN_GENERATION_MAX_TOKENS as MIN_GENERATION_MAX_TOKENS,
    _is_gemini3_model,
    _resolve_generation_max_tokens,
    _resolve_vertex_location,
    _resolve_vertex_project,
    anthropic_models_enabled as anthropic_models_enabled,
    is_claude_model as is_claude_model,
    resolve_effective_model as resolve_effective_model,
)
from .vertex_multimodal import (  # noqa: F401
    _ensure_vertexai_initialized as _ensure_vertexai_initialized,
    get_vertex_generative_model as get_vertex_generative_model,
    invoke_vertex_multimodal_text as invoke_vertex_multimodal_text,
    vertex_part_from_data as vertex_part_from_data,
)


logger = logging.getLogger(__name__)


def _get_anthropic_client(*, model_name: str) -> Any:
    """Compatibility seam for tests and callers overriding Anthropic transport."""
    return _create_anthropic_client(model_name=model_name)


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
            messages=[{'role': 'user', 'content': prompt}],
        ) as stream:
            message = stream.get_final_message()
        text = _message_text(message)
        if not text:
            raise _empty_message_error(message)
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
    if not model_name.lower().startswith('claude'):
        raise RuntimeError(
            f"Structured writer calls require an Anthropic model, got '{model_name}'."
        )
    client = _get_anthropic_client(model_name=model_name)
    message = client.messages.create(
        model=model_name,
        max_tokens=max_tokens,
        messages=[{'role': 'user', 'content': prompt}],
        tools=[
            {
                'name': tool_name,
                'description': tool_description,
                'input_schema': input_schema,
            }
        ],
        tool_choice={'type': 'tool', 'name': tool_name},
    )
    for block in getattr(message, 'content', []) or []:
        if (
            getattr(block, 'type', None) == 'tool_use'
            and getattr(block, 'name', None) == tool_name
        ):
            payload = getattr(block, 'input', None)
            if isinstance(payload, dict):
                resolved_model = getattr(message, 'model', None) or model_name
                return (payload, resolved_model)
    raise RuntimeError('Anthropic structured writer returned no tool output')


def _gemini_tool_schema(schema: Any, *, tool_name: str = "") -> Any:
    """Sanitize a schema while logging lossy constraints on this facade."""
    return _sanitize_gemini_tool_schema(
        schema,
        tool_name=tool_name,
        logger_override=logger,
    )


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
    return _invoke_gemini_tool(
        prompt=prompt,
        model_name=model_name,
        tool_name=tool_name,
        tool_description=tool_description,
        input_schema=input_schema,
        max_tokens=max_tokens,
        project=project,
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
) -> 'VertexAI | ClaudeTextLLM | Gemini3ChatTextLLM':
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
    model_name = resolve_effective_model(model_name)
    if is_claude_model(model_name):
        logger.debug(
            f'Routing LLM call to Anthropic: model={model_name}, max_tokens={effective_max_tokens}'
        )
        return ClaudeTextLLM(model_name=model_name, max_tokens=effective_max_tokens)
    resolved_project = _resolve_vertex_project(project)
    if _is_gemini3_model(model_name or ''):
        logger.debug(
            f'Routing LLM call to Gemini 3 chat path: model={model_name}, max_tokens={effective_max_tokens}'
        )
        return Gemini3ChatTextLLM(
            model_name=model_name,
            max_tokens=effective_max_tokens,
            project=resolved_project,
        )
    resolved_location = _resolve_vertex_location(location)
    resolved_model = model_name or DEFAULT_MODEL
    logger.debug(
        f'Creating VertexAI LLM: model={resolved_model}, temperature={temperature}, max_tokens={effective_max_tokens}, project={resolved_project}, location={resolved_location}'
    )
    return VertexAI(
        model_name=resolved_model,
        temperature=temperature,
        max_tokens=effective_max_tokens,
        project=resolved_project,
        location=resolved_location,
    )
