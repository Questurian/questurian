"""Writer-facing rendering for a curated Writer Brief."""

from __future__ import annotations

from .writer_brief_contracts import WriterBrief


def render_source_facts_block(brief: WriterBrief) -> str:
    """Render Source Facts without inspector-only citations."""
    if not brief.source_facts:
        return ""
    bullets = "\n".join(f"- {entry.fact}" for entry in brief.source_facts)
    return f"Source facts (use only what you need):\n{bullets}"


__all__ = ["render_source_facts_block"]
