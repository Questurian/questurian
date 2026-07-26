"""Vertex SDK initialization and multimodal generation."""

from typing import Any, Optional

from .llm_model_policy import (
    DEFAULT_MODEL,
    _resolve_vertex_location,
    _resolve_vertex_project,
)


_vertexai_init_state: tuple[str, str] | None = None


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
        model_name=model_name, project=project, location=location
    )
    response = model.generate_content(parts)
    return str(getattr(response, 'text', '') or '').strip()
