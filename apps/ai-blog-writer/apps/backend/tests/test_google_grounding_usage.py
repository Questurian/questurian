"""A grounded call has to report what it cost.

This path is raw REST, so it never passes through the LangChain adapters the
token ledger watches. Prompt2Blog v4 puts grounded search on every run -- the
grill researches the seed before asking anything, and research gathers on it --
so a per-run ceiling that cannot see these calls is not a ceiling.
"""

from __future__ import annotations

from utils.google_grounding import GroundedGenerationResult, _usage_counts


def _response(**overrides) -> dict:
    payload = {
        "candidates": [{"content": {"parts": [{"text": "Lima is on the coast."}]}}],
        "modelVersion": "gemini-2.5-flash",
        "usageMetadata": {
            "promptTokenCount": 812,
            "candidatesTokenCount": 344,
            "totalTokenCount": 1156,
        },
    }
    payload.update(overrides)
    return payload


def test_usage_is_read_off_the_response():
    assert _usage_counts(_response()) == (812, 344, 1156)


def test_a_response_without_usage_reports_unknown_rather_than_zero():
    """None and 0 are different answers.

    "Cost nothing" and "cost unknown" have to stay distinguishable, or the
    ceiling silently treats an unmetered call as free -- which is exactly the
    call it most needs to see.
    """
    assert _usage_counts(_response(usageMetadata=None)) == (None, None, None)
    assert _usage_counts({}) == (None, None, None)
    assert _usage_counts(None) == (None, None, None)


def test_a_malformed_count_is_unknown_rather_than_guessed():
    malformed = _response(
        usageMetadata={
            "promptTokenCount": "812",
            "candidatesTokenCount": -1,
            "totalTokenCount": 1156,
        }
    )

    assert _usage_counts(malformed) == (None, None, 1156)


def test_the_result_carries_usage_and_defaults_to_unknown():
    # Defaulted so existing callers keep working, but defaulted to unknown
    # rather than to zero.
    bare = GroundedGenerationResult(text="", source_urls=[], model_name="m")

    assert bare.total_tokens is None
