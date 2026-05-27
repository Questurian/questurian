"""Parser-level coverage for Research Profile response sanitization.

Targets the failure modes observed in the first accommodations audit run:
grounded models returning prose inside citations arrays, and leaving inline
[N, N] citation markers in summary text.
"""
import json

from app.features.editor_assist.research_profile import (
    _clean_citations,
    _clean_summary,
    _parse_research_profile_response,
)


def test_clean_citations_keeps_only_urls():
    raw = [
        "https://example.com/a",
        "http://example.com/b",
        " and ",
        "The hotel's design combines music, technology...",
        "",
        "ftp://example.com/c",  # not http(s)
        42,  # non-string
        "https://example.com/d ",  # trailing whitespace OK after strip
    ]
    assert _clean_citations(raw) == [
        "https://example.com/a",
        "http://example.com/b",
        "https://example.com/d",
    ]


def test_clean_citations_returns_empty_when_not_a_list():
    assert _clean_citations(None) == []
    assert _clean_citations("https://example.com/a") == []
    assert _clean_citations({"url": "https://example.com/a"}) == []


def test_clean_summary_strips_inline_citation_markers():
    raw = (
        "The hotel sits on a ridge above the medina [3, 9, 10, 13], with "
        "walking access to the souk [3, 6]."
    )
    assert _clean_summary(raw) == (
        "The hotel sits on a ridge above the medina, with walking access to the souk."
    )


def test_clean_summary_strips_single_marker():
    assert _clean_summary("A clean lead [4].") == "A clean lead."


def test_clean_summary_strips_range_marker():
    assert _clean_summary("Built in 1928 [3-5].") == "Built in 1928."


def test_clean_summary_handles_non_string():
    assert _clean_summary(None) == ""
    assert _clean_summary(42) == ""


def test_parser_drops_findings_with_only_prose_citations():
    """The bug we shipped a fix for: grounded model puts prose into the
    citations array, parser used to accept any non-empty string. Now it must
    drop the finding because no valid URL citation remains."""
    response = json.dumps({
        "selected_angle": {
            "angle": "location-and-setting",
            "status": "supported",
            "summary": "Set on a ridge above the medina [3, 9].",
            "citations": [
                " and ",
                "The hotel's design combines music, technology, and an industrial aesthetic.",
            ],
            "reason": "Multiple sources confirm setting.",
        },
        "standard_buckets": {
            "neighborhood-context": [
                {
                    "summary": "Walking distance to the souk [3, 6].",
                    "citations": ["adjacent finding prose, not a URL"],
                },
            ],
        },
        "warnings": [],
    })
    profile, drop_reason = _parse_research_profile_response(
        raw_text=response, requested_angle="location-and-setting"
    )
    # Selected angle had no real URL citation -> downgraded to unsupported.
    assert profile.selected_angle.status == "unsupported"
    assert profile.selected_angle.citations == []
    # Bucket finding dropped.
    assert profile.standard_buckets["neighborhood-context"] == []
    assert drop_reason and "uncited" in drop_reason


def test_parser_passes_clean_summaries_through_without_markers():
    response = json.dumps({
        "selected_angle": {
            "angle": "location-and-setting",
            "status": "supported",
            "summary": "Set on a ridge above the medina [3, 9, 10, 13].",
            "citations": ["https://example.com/setting"],
            "reason": "",
        },
        "standard_buckets": {
            "neighborhood-context": [
                {
                    "summary": "Walking distance to the souk [3, 6].",
                    "citations": ["https://example.com/souk"],
                },
            ],
        },
        "warnings": [],
    })
    profile, _ = _parse_research_profile_response(
        raw_text=response, requested_angle="location-and-setting"
    )
    assert profile.selected_angle.summary == "Set on a ridge above the medina."
    finding = profile.standard_buckets["neighborhood-context"][0]
    assert finding.summary == "Walking distance to the souk."
    assert finding.citations == ["https://example.com/souk"]
