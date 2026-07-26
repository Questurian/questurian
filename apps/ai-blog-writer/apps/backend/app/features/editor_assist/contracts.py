"""Shared HTTP contract vocabulary for Editor Assist."""

from typing import Literal

DEFAULT_MODEL = "gemini-2.5-flash-lite"
MAX_PROMPT_CHARS = 10000
MAX_BLOCK_CHARS = 24000
MAX_ARTICLE_TITLE_CHARS = 300
MAX_ARTICLE_CONTEXT_CHARS = 120000
MAX_TITLE_CHARS = 200

ListTone = Literal[
    "elevated",
    "casual",
    "hidden-gem",
    "family-friendly",
    "date-night",
    "budget",
]
