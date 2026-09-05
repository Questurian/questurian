"""Public provider-agnostic LLM facade."""

import logging
import json
from typing import Any, Optional

from langchain_google_vertexai import ChatVertexAI, VertexAI  # noqa: F401

from .claude_cli_llm import (  # noqa: F401
    ClaudeCliTextLLM as ClaudeCliTextLLM,
    ClaudeCliUnavailable as ClaudeCliUnavailable,
    _transport as _claude_cli_transport,
)
from .anthropic_transport import (
    _empty_message_error,
    _get_anthropic_client as _create_anthropic_client,
    _message_text,
)
from .gemini_tools import (  # noqa: F401
    Gemini3ChatTextLLM as Gemini3ChatTextLLM,
    validate_json_shape,
    _gemini_chat_text as _gemini_chat_text,
    _gemini_tool_schema as _sanitize_gemini_tool_schema,
    _invoke_gemini_structured_tool as _invoke_gemini_tool,
    _strip_for_gemini as _strip_for_gemini,
)
from .llm_model_policy import (  # noqa: F401
    ANTHROPIC_MODELS_ENABLED_DEFAULT as ANTHROPIC_MODELS_ENABLED_DEFAULT,
    ANTHROPIC_MODELS_ENABLED_ENV as ANTHROPIC_MODELS_ENABLED_ENV,
    CLAUDE_GOOGLE_SUBSTITUTES as CLAUDE_GOOGLE_SUBSTITUTES,
    CLAUDE_PROVIDER_ANTHROPIC_API as CLAUDE_PROVIDER_ANTHROPIC_API,
    CLAUDE_PROVIDER_NONE as CLAUDE_PROVIDER_NONE,
    CLAUDE_PROVIDER_SUBSCRIPTION_CLI as CLAUDE_PROVIDER_SUBSCRIPTION_CLI,
    CLAUDE_SUBSCRIPTION_MODELS_ENABLED_DEFAULT as CLAUDE_SUBSCRIPTION_MODELS_ENABLED_DEFAULT,
    CLAUDE_SUBSCRIPTION_MODELS_ENABLED_ENV as CLAUDE_SUBSCRIPTION_MODELS_ENABLED_ENV,
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
    claude_models_reachable as claude_models_reachable,
    claude_provider as claude_provider,
    claude_subscription_models_enabled as claude_subscription_models_enabled,
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
        self.last_usage_metadata: dict[str, Any] | None = None

    def invoke(self, prompt: str) -> str:
        client = _get_anthropic_client(model_name=self.model_name)
        with client.messages.stream(
            model=self.model_name,
            max_tokens=self.max_tokens,
            messages=[{'role': 'user', 'content': prompt}],
        ) as stream:
            message = stream.get_final_message()
        usage = getattr(message, 'usage', None)
        self.last_usage_metadata = (
            {
                'input_tokens': getattr(usage, 'input_tokens', 0),
                'output_tokens': getattr(usage, 'output_tokens', 0),
            }
            if usage is not None
            else None
        )
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


def _invoke_claude_cli_structured_tool(
    *,
    prompt: str,
    model_name: str,
    tool_name: str,
    tool_description: str,
    input_schema: dict[str, Any],
) -> tuple[dict[str, Any], str]:
    """Forced-tool equivalent on the subscription CLI.

    Routed here so that switching the subscription path on cannot leave a
    working text call beside a structured one that still tries the Anthropic
    API and fails on a key that was never configured.

    ``max_tokens`` has no CLI equivalent -- there is no flag for it -- so it is
    not threaded through rather than being faked.
    """
    cli_writer = _claude_cli_transport()
    framed = cli_writer.frame_schema_prompt(
        prompt,
        tool_name=tool_name,
        tool_description=tool_description,
    )
    try:
        result = cli_writer.invoke_structured(
            prompt=framed,
            input_schema=input_schema,
            model_name=model_name,
        )
    except cli_writer.ClaudeCliWriterError as error:
        raise ClaudeCliUnavailable(str(error)) from error
    return (result["payload"], result["modelName"])


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
        if claude_provider() == CLAUDE_PROVIDER_SUBSCRIPTION_CLI:
            return _invoke_claude_cli_structured_tool(
                prompt=prompt,
                model_name=effective_model,
                tool_name=tool_name,
                tool_description=tool_description,
                input_schema=input_schema,
            )
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


class VertexTextLLM:
    """LangChain's ``VertexAI``, with the token counts it throws away.

    ``VertexAI.invoke()`` returns a bare string. The usage is real and Vertex
    reports it, but LangChain drops it on that path, so every caller reading
    ``last_usage_metadata`` off the returned object got ``None`` -- and
    recorded a duration with no tokens and no cost. Four stored Prompt2Blog
    rows show exactly that: `gemini-2.5-flash`, a real duration, every token
    field null.

    ``generate()`` keeps what ``invoke()`` discards:
    ``generations[0][0].generation_info["usage_metadata"]`` is already a dict
    in the spellings ``normalize_token_usage`` reads, thinking tokens and
    cached tokens included.

    JSON calls send the response schema to Gemini; text calls keep their
    existing behavior and output ceiling.
    """

    def __init__(self, llm: Any, model_name: str) -> None:
        self._llm = llm
        self.model_name = model_name
        self.last_usage_metadata: Optional[dict[str, Any]] = None

    def invoke(self, prompt: str) -> str:
        result = self._llm.generate([prompt])
        self.last_usage_metadata = _usage_from_generation(result)
        generations = result.generations[0] if result.generations else []
        return str(generations[0].text if generations else '') or ''

    def invoke_json(self, prompt: str, *, input_schema: dict[str, Any],
                    thinking_budget: int | None = None,
                    max_tokens: int | None = None) -> dict[str, Any]:
        """One schema-enforced JSON call.

        `max_tokens` has to be forwarded. Callers pass an output ceiling and
        this method used to swallow it, so structuring ran on the provider
        default and returned JSON cut off mid-string -- run a3c20e41 lost four
        questions to "Unterminated string starting at line 468", 16,640
        characters into a call whose caller had asked for 8,192 tokens.
        """
        options: dict[str, Any] = {
            "response_mime_type": "application/json",
            "response_schema": _sanitize_gemini_tool_schema(input_schema),
        }
        if thinking_budget is not None and self.model_name == "gemini-2.5-flash":
            options["thinking_budget"] = thinking_budget
        if max_tokens is not None:
            options["max_output_tokens"] = max_tokens
        result = self._llm.generate([prompt], **options)
        self.last_usage_metadata = _usage_from_generation(result)
        text = result.generations[0][0].text
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as error:
            # A truncated response is an output-ceiling problem, not a bad
            # model. Say which, so the next person does not go looking at the
            # prompt.
            raise ValueError(
                f"Gemini returned JSON that stops mid-value after {len(text)} "
                f"characters ({error}). The output ceiling was "
                f"{max_tokens or 'the provider default'}."
            ) from error
        if not isinstance(parsed, dict):
            raise ValueError("Structured Gemini response must be an object")
        validate_json_shape(parsed, input_schema)
        return parsed


def _usage_from_generation(result: Any) -> Optional[dict[str, Any]]:
    """The usage dict LangChain files under the generation, if it is there."""
    try:
        info = result.generations[0][0].generation_info or {}
    except (AttributeError, IndexError, TypeError):
        return None
    usage = info.get('usage_metadata')
    if isinstance(usage, dict) and usage:
        return usage
    # Older versions put it on the result instead.
    llm_output = getattr(result, 'llm_output', None)
    if isinstance(llm_output, dict):
        candidate = llm_output.get('usage_metadata') or llm_output.get('token_usage')
        if isinstance(candidate, dict) and candidate:
            return candidate
    return None


def get_vertex_llm(
    temperature: float = 0.1,
    max_tokens: int = 2048,
    model_name: Optional[str] = None,
    project: Optional[str] = None,
    location: Optional[str] = None,
) -> 'VertexTextLLM | ClaudeTextLLM | ClaudeCliTextLLM | Gemini3ChatTextLLM':
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
        # A claude-* name only survives resolve_effective_model when one of the
        # two Claude paths is on, so this branch is not reachable by accident.
        if claude_provider() == CLAUDE_PROVIDER_SUBSCRIPTION_CLI:
            logger.debug(
                f'Routing LLM call to the Claude subscription CLI: model={model_name}'
            )
            return ClaudeCliTextLLM(
                model_name=model_name,
                max_tokens=effective_max_tokens,
                temperature=temperature,
            )
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
    return VertexTextLLM(
        VertexAI(
            model_name=resolved_model,
            temperature=temperature,
            max_tokens=effective_max_tokens,
            project=resolved_project,
            location=resolved_location,
        ),
        resolved_model,
    )
