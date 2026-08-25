"""Deterministic v3 quality inputs derived from the commission.

V3 has no writing brief. The measurable constraints the audit needs still
exist, but they come from the approved commission and the resolved length
profile, so nothing has to be reconstructed from prose.
"""

from __future__ import annotations

from typing import Any

from .support import _safe_dict, _safe_int, _safe_str


def v3_constraint_brief(
    commission: dict[str, Any],
    option_context: dict[str, Any],
) -> dict[str, Any]:
    """Builds the brief `_build_constraint_checks` measures a v3 draft against.

    Keyword and must-include fields stay empty on purpose: v3 commissions carry
    no SEO brief, and inventing one here would fail drafts for missing a
    requirement nobody approved.
    """
    length = _safe_dict(_safe_dict(option_context).get("length"))
    return {
        "formatting": {
            "target_word_count": _safe_int(length.get("target_word_count"), default=0),
            "paragraph_length": _safe_str(length.get("paragraph_length"))
            or _safe_str(length.get("label")),
        },
        "call_to_action": _safe_str(commission.get("call_to_action")),
        "seo": {"primary_keyword": "", "secondary_keywords": []},
        "must_include": [],
    }


def v3_commission_summary(commission: dict[str, Any]) -> str:
    """One compact block of the commission facts a headline must respect."""
    scope = _safe_dict(commission.get("scope"))
    references = scope.get("references") or []
    roles = ", ".join(
        f"{_safe_str(reference.get('name'))} ({_safe_str(reference.get('role'))})"
        for reference in references
    )
    audience = _safe_dict(commission.get("audience"))
    return "\n".join(
        [
            f"Original title: {_safe_str(commission.get('original_title'))}",
            f"Location: {_safe_str(commission.get('location'))}",
            f"Primary subject: {_safe_str(commission.get('primary_subject'))}",
            f"Form: {_safe_str(commission.get('form_id'))}",
            f"Scope mode: {_safe_str(scope.get('mode'))}",
            f"References: {roles}",
            "Core reader question: "
            f"{_safe_str(commission.get('core_reader_question'))}",
            f"Primary reader: {_safe_str(audience.get('primary_reader'))}",
        ]
    )
