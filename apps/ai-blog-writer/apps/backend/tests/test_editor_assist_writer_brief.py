"""Tests for the Writer Brief curator (ADR 0007)."""

from __future__ import annotations

import json

from app.features.editor_assist import writer_brief as wb_mod
from app.features.editor_assist.research_profile import (
    ResearchFinding,
    ResearchProfile,
    SelectedAngleEvidence,
)
from app.features.editor_assist.writer_brief import (
    MAX_SOURCE_FACTS,
    MIN_SOURCE_FACTS,
    ANGLE_DIRECTIVES_BY_CATEGORY,
    SourceFact,
    WriterBrief,
    build_curator_prompt,
    parse_writer_brief_response,
    render_source_facts_block,
    run_writer_brief,
)


def _profile(
    *,
    selected_angle="best-for-night",
    selected_status="supported",
    selected_summary="Top 35 bars in the world, late close, mansion setting.",
    buckets=None,
) -> ResearchProfile:
    standard = {
        "reputation-summary": [],
        "specific-offerings": [],
        "experience-texture": [],
        "history-or-ownership": [],
        "practical-usefulness": [],
        "best-for": [],
        "standout-hook": [],
        "social-proof": [],
        "visual-assets": [],
        "caveats-or-fit-warnings": [],
        "timing-tips": [],
    }
    for bucket, findings in (buckets or {}).items():
        standard[bucket] = findings
    return ResearchProfile(
        selected_angle=SelectedAngleEvidence(
            angle=selected_angle,
            status=selected_status,
            summary=selected_summary,
            citations=["https://example.com/angle"],
        ),
        standard_buckets=standard,
        usable_for_blurb=True,
    )


def _ok_payload() -> str:
    return json.dumps({
        "angle_directive": (
            "Open by naming the kind of night Ayahuasca is best for, and give "
            "one concrete reason rooted in the room, the drinks, the crowd, or "
            "the pacing."
        ),
        "source_facts": [
            {
                "fact": "Set in the Berninzon mansion in Barranco.",
                "citations": ["https://example.com/mansion"],
            },
            {
                "fact": "Pisco-forward cocktail program with house-macerated herbs.",
                "citations": ["https://example.com/cocktails"],
            },
            {
                "fact": "Open late, roughly until 2 or 3 AM.",
                "citations": ["https://example.com/hours"],
            },
        ],
    })


# ---------- Prompt ----------


def test_curator_prompt_includes_venue_template_and_findings():
    profile = _profile(
        buckets={
            "experience-texture": [
                ResearchFinding(
                    summary="Folkloric art and winding wood staircases.",
                    citations=["https://example.com/rooms"],
                ),
            ],
        },
    )
    prompt = build_curator_prompt(
        venue_name="Ayahuasca",
        location_label="Barranco, Lima",
        category="nightlife",
        angle="best-for-night",
        angle_directive_template=ANGLE_DIRECTIVES_BY_CATEGORY["nightlife"]["best-for-night"],
        research_profile=profile,
    )
    assert "Ayahuasca" in prompt
    assert "Barranco, Lima" in prompt
    assert "Angle: best-for-night" in prompt
    # The {venue} placeholder is filled before the directive reaches the
    # curator; the curator sees a finished sentence, not template mechanics.
    assert "{venue}" not in prompt
    assert "Ayahuasca is best for" in prompt
    assert "experience-texture: Folkloric art" in prompt
    assert "selected-angle (best-for-night): Top 35 bars" in prompt
    assert f"{MIN_SOURCE_FACTS} to {MAX_SOURCE_FACTS} source_facts" in prompt


def test_curator_prompt_without_angle_template_falls_back_to_generic_directive():
    profile = _profile(selected_angle=None, selected_status="not-requested", selected_summary="")
    prompt = build_curator_prompt(
        venue_name="Ayahuasca",
        location_label="Barranco, Lima",
        category="nightlife",
        angle=None,
        angle_directive_template=None,
        research_profile=profile,
    )
    assert "Angle directive starting point: write a one-line directive" in prompt
    assert "Ayahuasca" in prompt


# ---------- Parser ----------


def test_parser_keeps_facts_and_fills_venue_placeholder():
    brief, drop = parse_writer_brief_response(
        raw_text=_ok_payload(),
        venue_name="Ayahuasca",
        angle="best-for-night",
        angle_directive_template=ANGLE_DIRECTIVES_BY_CATEGORY["nightlife"]["best-for-night"],
    )
    assert drop is None
    assert brief.angle == "best-for-night"
    assert brief.venue == "Ayahuasca"
    assert "Ayahuasca" in brief.angle_directive
    assert "{venue}" not in brief.angle_directive
    assert len(brief.source_facts) == 3
    assert brief.source_facts[0].citations == ["https://example.com/mansion"]
    assert brief.is_usable


def test_parser_substitutes_template_when_directive_missing():
    payload = json.dumps({"source_facts": [
        {"fact": "a", "citations": []},
        {"fact": "b", "citations": []},
    ]})
    brief, drop = parse_writer_brief_response(
        raw_text=payload,
        venue_name="Ayahuasca",
        angle="best-for-night",
        angle_directive_template=ANGLE_DIRECTIVES_BY_CATEGORY["nightlife"]["best-for-night"],
    )
    assert drop is not None and "angle_directive missing" in drop
    assert "Ayahuasca" in brief.angle_directive
    assert brief.is_usable


def test_parser_caps_source_facts_at_max():
    facts = [{"fact": f"fact {i}", "citations": []} for i in range(MAX_SOURCE_FACTS + 3)]
    payload = json.dumps({"angle_directive": "x", "source_facts": facts})
    brief, drop = parse_writer_brief_response(
        raw_text=payload,
        venue_name="Ayahuasca",
        angle="best-for-night",
        angle_directive_template=None,
    )
    assert len(brief.source_facts) == MAX_SOURCE_FACTS
    assert drop is not None and "capped" in drop


def test_parser_drops_entries_missing_fact_text():
    payload = json.dumps({
        "angle_directive": "x",
        "source_facts": [
            {"fact": "", "citations": []},
            {"citations": ["https://example.com"]},
            {"fact": "valid fact", "citations": ["https://example.com"]},
        ],
    })
    brief, drop = parse_writer_brief_response(
        raw_text=payload,
        venue_name="Ayahuasca",
        angle="best-for-night",
        angle_directive_template=None,
    )
    assert [entry.fact for entry in brief.source_facts] == ["valid fact"]
    assert drop is not None


def test_parser_handles_non_json_response():
    brief, drop = parse_writer_brief_response(
        raw_text="not json at all",
        venue_name="Ayahuasca",
        angle="best-for-night",
        angle_directive_template=ANGLE_DIRECTIVES_BY_CATEGORY["nightlife"]["best-for-night"],
    )
    assert drop == "response was not a JSON object"
    # Falls back to filled template; no facts.
    assert "Ayahuasca" in brief.angle_directive
    assert brief.source_facts == []
    assert not brief.is_usable


def test_parser_strips_json_code_fence():
    fenced = "```json\n" + _ok_payload() + "\n```"
    brief, _drop = parse_writer_brief_response(
        raw_text=fenced,
        venue_name="Ayahuasca",
        angle="best-for-night",
        angle_directive_template=ANGLE_DIRECTIVES_BY_CATEGORY["nightlife"]["best-for-night"],
    )
    assert brief.is_usable
    assert len(brief.source_facts) == 3


# ---------- Templates ----------


def test_nightlife_angle_directives_cover_each_nightlife_angle():
    # ADR 0008: nightlife pool reduced to a single angle.
    nightlife_directives = ANGLE_DIRECTIVES_BY_CATEGORY["nightlife"]
    expected = {"best-for-night"}
    assert set(nightlife_directives.keys()) == expected
    for template in nightlife_directives.values():
        assert "{venue}" in template


def test_dining_angle_directives_cover_each_dining_angle():
    # ADR 0009: dining keeps its six-angle pool on the lean writer path.
    dining_directives = ANGLE_DIRECTIVES_BY_CATEGORY["dining"]
    expected = {
        "signature-dish",
        "atmosphere",
        "founders-backstory",
        "insider-tip",
        "best-for",
        "whats-different",
    }
    assert set(dining_directives.keys()) == expected
    for template in dining_directives.values():
        assert "{venue}" in template


def test_attractions_angle_directives_cover_each_attractions_angle():
    # ADR 0012: attractions keeps the ADR 0004 six-angle pool on the lean path.
    attractions_directives = ANGLE_DIRECTIVES_BY_CATEGORY["attractions"]
    expected = {
        "signature-feature",
        "setting",
        "history-built",
        "visit-time-tip",
        "best-for-visit-type",
        "whats-different",
    }
    assert set(attractions_directives.keys()) == expected
    for template in attractions_directives.values():
        assert "{venue}" in template


# ---------- run_writer_brief orchestration ----------


def test_run_writer_brief_returns_usable_brief_on_happy_path(monkeypatch):
    monkeypatch.setattr(
        wb_mod, "_invoke_curator_model",
        lambda *a, **kw: (_ok_payload(), "gemini-2.5-flash"),
    )
    brief, trace = run_writer_brief(
        venue_name="Ayahuasca",
        location_label="Barranco, Lima",
        category="nightlife",
        angle="best-for-night",
        research_profile=_profile(),
    )
    assert brief.is_usable
    assert brief.angle == "best-for-night"
    assert trace.error is None
    assert trace.raw_response


def test_run_writer_brief_marks_unusable_when_curator_returns_zero_facts(monkeypatch):
    payload = json.dumps({"angle_directive": "x", "source_facts": []})
    monkeypatch.setattr(
        wb_mod, "_invoke_curator_model",
        lambda *a, **kw: (payload, "gemini-2.5-flash"),
    )
    brief, _trace = run_writer_brief(
        venue_name="Ayahuasca",
        location_label="Barranco, Lima",
        category="nightlife",
        angle="best-for-night",
        research_profile=_profile(),
    )
    assert not brief.is_usable
    assert len(brief.source_facts) < MIN_SOURCE_FACTS


def test_run_writer_brief_falls_back_to_template_on_call_failure(monkeypatch):
    def _boom(*_a, **_kw):
        raise RuntimeError("vertex down")

    monkeypatch.setattr(wb_mod, "_invoke_curator_model", _boom)
    brief, trace = run_writer_brief(
        venue_name="Ayahuasca",
        location_label="Barranco, Lima",
        category="nightlife",
        angle="best-for-night",
        research_profile=_profile(),
    )
    assert trace.error is not None and "vertex down" in trace.error
    assert "Ayahuasca" in brief.angle_directive
    assert brief.source_facts == []
    assert not brief.is_usable


def test_run_writer_brief_handles_empty_response(monkeypatch):
    monkeypatch.setattr(
        wb_mod, "_invoke_curator_model",
        lambda *a, **kw: ("", "gemini-2.5-flash"),
    )
    brief, trace = run_writer_brief(
        venue_name="Ayahuasca",
        location_label="Barranco, Lima",
        category="nightlife",
        angle="best-for-night",
        research_profile=_profile(),
    )
    assert trace.error == "curator returned empty text"
    assert not brief.is_usable


# ---------- Source facts rendering ----------


def test_render_source_facts_block_omits_citations():
    brief = WriterBrief(
        angle_directive="x",
        source_facts=[
            SourceFact(fact="Mansion setting.", citations=["https://example.com"]),
            SourceFact(fact="Late close.", citations=[]),
        ],
        angle="best-for-night",
        venue="Ayahuasca",
    )
    block = render_source_facts_block(brief)
    assert block.startswith("Source facts (use only what you need):")
    assert "- Mansion setting." in block
    assert "- Late close." in block
    assert "https://example.com" not in block


def test_render_source_facts_block_empty_when_no_facts():
    brief = WriterBrief(
        angle_directive="x",
        source_facts=[],
        angle="best-for-night",
        venue="Ayahuasca",
    )
    assert render_source_facts_block(brief) == ""
