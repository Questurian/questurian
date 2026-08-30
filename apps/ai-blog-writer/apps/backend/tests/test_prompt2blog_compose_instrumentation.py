"""Where the compose prompt actually goes.

Build-check C2. The call measured 29,218 tokens and only about 11,000 could be
traced from stored data, which made "what should we cut" unanswerable. Stage 5
adds the voice and the brief to that same call, so the headroom had to become
readable before it was spent.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.features.prompt2blog.contracts_v4 import Prompt2BlogV4Request
from app.features.prompt2blog.instructions_v3 import assemble_v3_instructions

FIXTURE = (
    Path(__file__).parents[3]
    / "data"
    / "fixtures"
    / "prompt2blog"
    / "lima-scope-drift-v4.json"
)


def _contexts():
    fixture = json.loads(FIXTURE.read_text())
    request = Prompt2BlogV4Request.model_validate(
        {
            "schema_version": 4,
            "brief": fixture["brief"],
            "work_order": fixture["work_order"],
            "evidence_package": fixture["evidence_package"],
            "profiles": {"length_id": "medium", "creativity_level": "medium"},
        }
    )
    return assemble_v3_instructions(request).stage_contexts


def test_every_stage_context_reports_its_own_size():
    compose = _contexts().compose

    assert compose.characters == len(compose.text)
    assert set(compose.section_sizes) == set(compose.included_sections)
    assert sum(compose.section_sizes.values()) <= compose.characters


def test_the_biggest_part_of_the_compose_context_is_identifiable():
    """The point of measuring: being able to name what to cut.

    Not asserting which section is largest -- that changes as the catalog
    changes, and pinning it would make this test a tripwire for editing a data
    file. Asserting that the question is answerable.
    """
    sizes = _contexts().compose.section_sizes

    largest = max(sizes, key=sizes.get)
    assert sizes[largest] > 0
    assert largest in _contexts().compose.included_sections


def test_the_outline_context_stays_far_smaller_than_compose():
    # The outline is a planning call and has no business carrying the evidence
    # body or the house style. If this inverts, something leaked upstream.
    contexts = _contexts()

    assert contexts.outline.characters < contexts.compose.characters


def test_the_audit_never_carries_the_evidence_body():
    # It judges the draft, not the dossier. Grounding is a separate check with
    # a separate verdict, and duplicating the records here would be the single
    # most expensive way to say nothing new.
    assert "evidence" not in _contexts().audit.included_sections
