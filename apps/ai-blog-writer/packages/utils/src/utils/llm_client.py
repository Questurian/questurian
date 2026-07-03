"""
Shared LLM client utilities for Vertex AI / Google Gemini and Anthropic Claude.

Provides a factory function to create configured LLM instances
that can be used across different pipelines. Model names starting with
"claude" are routed to the Anthropic Messages API; everything else goes
to Vertex AI.
"""
import logging
import os
from typing import Optional

from langchain_google_vertexai import VertexAI

logger = logging.getLogger(__name__)

# Default model configuration
DEFAULT_MODEL = "gemini-2.5-flash-lite"
DEFAULT_LOCATION = "us-central1"


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
        api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set; cannot invoke Anthropic model "
                f"'{self.model_name}'."
            )

        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        with client.messages.stream(
            model=self.model_name,
            max_tokens=self.max_tokens,
            thinking={"type": "adaptive"},
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            message = stream.get_final_message()

        text_parts = [
            block.text
            for block in getattr(message, "content", []) or []
            if getattr(block, "type", None) == "text"
            and isinstance(getattr(block, "text", None), str)
        ]
        return "\n".join(text_parts).strip()


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

    # Resolve project
    resolved_project = project or os.getenv("GOOGLE_CLOUD_PROJECT")
    if not resolved_project:
        raise RuntimeError(
            "Vertex AI not configured — GOOGLE_CLOUD_PROJECT is not set. "
            "Set GOOGLE_CLOUD_PROJECT (and optionally GOOGLE_CLOUD_LOCATION) "
            "once the new GCP project is ready."
        )

    # Resolve location
    resolved_location = location or os.getenv("GOOGLE_CLOUD_LOCATION", DEFAULT_LOCATION)

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


# Preset configurations for common use cases
class LLMPresets:
    """Preset configurations for common LLM use cases."""

    @staticmethod
    def transcript_cleaning() -> VertexAI:
        """LLM configured for transcript cleaning (deterministic, long output)."""
        return get_vertex_llm(temperature=0.1, max_tokens=8000)

    @staticmethod
    def classification() -> VertexAI:
        """LLM configured for classification tasks (deterministic, structured output)."""
        return get_vertex_llm(temperature=0.1, max_tokens=2048)

    @staticmethod
    def article_composition() -> VertexAI:
        """LLM configured for article composition (slightly creative, long output)."""
        return get_vertex_llm(temperature=0.3, max_tokens=8192)

    @staticmethod
    def title_generation() -> VertexAI:
        """LLM configured for title generation (deterministic, short output)."""
        return get_vertex_llm(temperature=0.1, max_tokens=1024)
