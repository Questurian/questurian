"""Execution and compatibility seams for Writer Brief generation."""

from __future__ import annotations

import json
import logging

from app.features.editor_assist.research_profile_contracts import (
    ResearchFinding,
    ResearchProfile,
    SelectedAngleEvidence,
    empty_buckets,
)
from app.features.editor_assist.writer_brief_execution import execute_writer_brief


def _profile() -> ResearchProfile:
    buckets = empty_buckets()
    buckets["experience-texture"] = [
        ResearchFinding(
            summary="Folkloric art and winding wood staircases.",
            citations=["https://example.com/rooms"],
        )
    ]
    return ResearchProfile(
        selected_angle=SelectedAngleEvidence(
            angle="best-for-night",
            status="supported",
            summary="Top 35 bars in the world, late close, mansion setting.",
            citations=["https://example.com/angle"],
        ),
        standard_buckets=buckets,
        usable_for_blurb=True,
    )


def test_execution_injects_curator_and_preserves_resolved_model():
    seen: dict[str, object] = {}

    def _invoke(**kwargs):
        seen.update(kwargs)
        return (
            json.dumps(
                {
                    "angle_directive": "Lead with Ayahuasca's late-night pacing.",
                    "source_facts": [
                        {"fact": "Mansion setting.", "citations": []},
                        {"fact": "Pisco-forward drinks.", "citations": []},
                    ],
                }
            ),
            "resolved-curator",
        )

    brief, trace = execute_writer_brief(
        venue_name="Ayahuasca",
        location_label="Barranco, Lima",
        category="nightlife",
        angle="best-for-night",
        research_profile=_profile(),
        model_name="requested-curator",
        max_tokens=10240,
        temperature=0.1,
        invoke_curator=_invoke,
        exception_logger=logging.getLogger(__name__),
    )

    assert brief.is_usable
    assert trace.model == "resolved-curator"
    assert seen["model_name"] == "requested-curator"
    assert seen["max_tokens"] == 10240
    assert seen["temperature"] == 0.1
    assert "Writer Brief" in str(seen["prompt"])


def test_execution_failure_returns_template_fallback_without_facts():
    def _raise(**_kwargs):
        raise RuntimeError("curator unavailable")

    brief, trace = execute_writer_brief(
        venue_name="Ayahuasca",
        location_label="Barranco, Lima",
        category="nightlife",
        angle="best-for-night",
        research_profile=_profile(),
        model_name="requested-curator",
        max_tokens=10240,
        temperature=0.1,
        invoke_curator=_raise,
        exception_logger=logging.getLogger(__name__),
    )

    assert brief.angle_directive.startswith(
        "Open by naming the kind of night Ayahuasca"
    )
    assert brief.source_facts == []
    assert not brief.is_usable
    assert trace.model == "requested-curator"
    assert trace.error == "curator call raised: RuntimeError('curator unavailable')"
