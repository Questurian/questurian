"""
Shared LLM client utilities for Vertex AI / Google Gemini.

Provides a factory function to create configured LLM instances
that can be used across different pipelines.
"""
import logging
import os
from typing import Optional

from langchain_google_vertexai import VertexAI

logger = logging.getLogger(__name__)

# Default model configuration
DEFAULT_MODEL = "gemini-2.5-pro"
DEFAULT_LOCATION = "us-central1"


def get_vertex_llm(
    temperature: float = 0.1,
    max_tokens: int = 2048,
    model_name: Optional[str] = None,
    project: Optional[str] = None,
    location: Optional[str] = None,
) -> VertexAI:
    """
    Create a configured Vertex AI LLM instance.

    Args:
        temperature: Sampling temperature (0.0-1.0). Lower = more deterministic.
                    Use 0.1 for structured output, 0.3 for creative tasks.
        max_tokens: Maximum tokens in response.
        model_name: Model to use (default: gemini-2.5-pro)
        project: Google Cloud project ID (default: from GOOGLE_CLOUD_PROJECT env)
        location: Google Cloud location (default: from GOOGLE_CLOUD_LOCATION env or us-central1)

    Returns:
        Configured VertexAI instance ready for invocation.

    Raises:
        RuntimeError: If GOOGLE_CLOUD_PROJECT is not set and project not provided.
    """
    # Resolve project
    resolved_project = project or os.getenv("GOOGLE_CLOUD_PROJECT")
    if not resolved_project:
        raise RuntimeError(
            "GOOGLE_CLOUD_PROJECT environment variable is required. "
            "Set it or pass project parameter explicitly."
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
