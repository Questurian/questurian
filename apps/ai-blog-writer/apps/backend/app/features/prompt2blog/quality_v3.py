"""Deterministic quality inputs derived from the brief.

There is no separate SEO brief. The measurable constraints the audit needs
still exist, but they come from the approved brief and the resolved length
profile, so nothing has to be reconstructed from prose.
"""

from __future__ import annotations

from typing import Any

from .support import _safe_dict, _safe_int, _safe_str


def v3_constraint_brief(
    brief: dict[str, Any],
    option_context: dict[str, Any],
) -> dict[str, Any]:
    """Builds what `_build_constraint_checks` measures a draft against.

    Keyword fields stay empty on purpose: a brief carries no SEO brief, and
    inventing one here would fail drafts for missing a requirement nobody
    approved. `must_include` is the brief's must_name, which a person did
    approve.
    """
    length = _safe_dict(_safe_dict(option_context).get("length"))
    return {
        "formatting": {
            "target_word_count": _safe_int(length.get("target_word_count"), default=0),
            "paragraph_length": _safe_str(length.get("paragraph_length"))
            or _safe_str(length.get("label")),
        },
        # Deliberately empty. v4 has no call-to-action field, and the brief's
        # outcome is what the piece should achieve, not a string it must
        # contain -- measuring coverage of it fails every draft that succeeds
        # without quoting its own goal back at the reader.
        "call_to_action": "",
        "seo": {"primary_keyword": "", "secondary_keywords": []},
        "must_include": [
            _safe_str(item) for item in (brief.get("must_name") or []) if _safe_str(item)
        ],
    }


def v3_brief_summary(brief: dict[str, Any], work_order: dict[str, Any]) -> str:
    """One compact block of the facts a headline must respect."""
    scope = _safe_dict(work_order.get("scope"))
    references = scope.get("references") or []
    roles = ", ".join(
        f"{_safe_str(reference.get('name'))} ({_safe_str(reference.get('role'))})"
        for reference in references
    )
    reader = _safe_dict(brief.get("reader"))
    return "\n".join(
        [
            f"The promise to keep: {_safe_str(brief.get('outcome'))}",
            f"Spine: {_safe_str(brief.get('spine'))}",
            f"Location: {_safe_str(brief.get('location'))}",
            f"Primary subject: {_safe_str(work_order.get('primary_subject'))}",
            f"Form: {_safe_str(brief.get('form_id'))}",
            f"Scope mode: {_safe_str(scope.get('mode'))}",
            f"References: {roles}",
            "Core reader question: "
            f"{_safe_str(brief.get('reader_question'))}",
            f"Primary reader: {_safe_str(reader.get('primary_reader'))}",
        ]
    )
