from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from .run_recorder import RunRecorder
from .storage import read_article_type_names


@dataclass(frozen=True)
class YouTube2BlogDependencies:
    """Explicit external collaborators used by the pipeline graph."""

    recorder: RunRecorder = field(default_factory=RunRecorder)
    article_type_names_reader: Callable[[], list[str]] = read_article_type_names
