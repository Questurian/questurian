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

from langchain_google_vertexai import VertexAI

logger = logging.getLogger(__name__)

# Default model configuration
DEFAULT_MODEL = "gemini-2.5-flash-lite"
DEFAULT_LOCATION = "us-central1"

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
            thinking={"type": "adaptive"},
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            message = stream.get_final_message()

        return _message_text(message)


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


def get_vertex_llm(
    temperature: float = 0.1,
    max_tokens: int = 2048,
    model_name: Optional[str] = None,
    project: Optional[str] = None,
    location: Optional[str] = None,
) -> "VertexAI | ClaudeTextLLM":
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
    # Anthropic routing: claude-* models bypass Vertex entirely.
    if (model_name or "").lower().startswith("claude"):
        logger.debug(
            f"Routing LLM call to Anthropic: model={model_name}, max_tokens={max_tokens}"
        )
        return ClaudeTextLLM(model_name=model_name, max_tokens=max_tokens)

    resolved_project = _resolve_vertex_project(project)
    resolved_location = _resolve_vertex_location(location)

    # Resolve model
    resolved_model = model_name or DEFAULT_MODEL

    logger.debug(
        f"Creating VertexAI LLM: model={resolved_model}, "
        f"temperature={temperature}, max_tokens={max_tokens}, "
        f"project={resolved_project}, location={resolved_location}"
    )

    return VertexAI(
        model_name=resolved_model,
        temperature=temperature,
        max_tokens=max_tokens,
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
