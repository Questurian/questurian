"""A required field the prompt tells the model to leave empty must stay empty-able.

Gemini receives these schemas now, and the shape is checked after generation,
so a floor the prompt contradicts is a run that dies on turn one rather than a
comment nobody reads.
"""
import pytest

from app.features.prompt2blog.grill_v4 import NEXT_TURN_SCHEMA
from app.features.prompt2blog.research_v4 import BATCH_SCHEMA
from utils.gemini_tools import validate_json_shape

# The turn the grill actually sends while it is still asking: a question, and
# every other slot accounted for but empty.
ASKING_TURN = {
    "done": False,
    "ask": "Which stretch of the malecon do you mean?",
    "recommendation": "Miraflores to Barranco, the continuous six miles.",
    "consensus": "",
    "markers_covered": [],
    "asks_about": "",
}


def test_the_grill_can_answer_while_it_is_still_asking():
    validate_json_shape(ASKING_TURN, NEXT_TURN_SCHEMA)


def test_the_grill_can_answer_when_it_is_finished():
    validate_json_shape(
        {**ASKING_TURN, "done": True, "ask": "", "recommendation": "",
         "consensus": "Six miles of clifftop park, free, Miraflores to Barranco."},
        NEXT_TURN_SCHEMA,
    )


@pytest.mark.parametrize("field", ["done", "ask", "recommendation", "consensus",
                                   "markers_covered", "asks_about"])
def test_a_missing_field_is_still_refused(field):
    with pytest.raises(ValueError, match="missing required"):
        validate_json_shape({k: v for k, v in ASKING_TURN.items() if k != field},
                            NEXT_TURN_SCHEMA)


def test_research_keeps_its_floors_because_nothing_asks_it_for_a_blank():
    with pytest.raises(ValueError, match="too short"):
        validate_json_shape(
            {"sources": [{"source_id": "", "title": "t", "retrieved_at": "2026-01-01",
                          "source_type": "web", "material_type": "reporting",
                          "url": "https://a.pe", "notes": ""}],
             "claims": [], "requirements": [], "gaps": []},
            BATCH_SCHEMA,
        )


# --- every model call in the writing graph names a job ---------------------
#
# The gateway migration was applied by matching `invoke_json(`, so the two
# `enforce_anti_ai` calls were never given a job. `_resolved_model` refuses a
# call that names neither a job nor a model, and `writing_model` is None
# whenever the request does not pick one -- which is the ordinary case. The
# first real v4 run since the gateway merge died in compose because of it, and
# no test noticed, because nothing asserted the call sites were migrated.

import re
from pathlib import Path

import pytest

V3_STAGES = Path(__file__).resolve().parents[1] / "app/features/prompt2blog/stages/v3"


@pytest.mark.parametrize("path", sorted(V3_STAGES.glob("*.py")), ids=lambda p: p.name)
def test_every_model_call_in_the_writing_graph_names_a_job(path):
    source = path.read_text()
    for call in re.finditer(
        r"dependencies\.llm\.(invoke_json|invoke_text|enforce_anti_ai)\((.*?)\n    \)",
        source,
        re.S,
    ):
        assert "job_id=" in call.group(2), (
            f"{path.name}: {call.group(1)} names no job, so the dashboard cannot "
            "route it and it fails outright when no model is picked"
        )


# --- compose is told the whole-article target, not only section budgets -----


def test_compose_and_outline_read_the_same_word_target():
    from app.features.prompt2blog.support import _target_word_count

    assert _target_word_count({"length": {"target_word_count": 900}}) == 900
    assert _target_word_count({"length": {}}) == 0
    assert _target_word_count({}) == 0


def test_the_compose_prompt_carries_the_target_word_count():
    from app.features.prompt2blog.prompts.editorial_v3 import (
        P2B_V3_COMPOSE_PROMPT,
        P2B_V3_OUTLINE_PROMPT,
    )

    # Outline always had this. Compose saw only the per-section budgets inside
    # the plan, and wrote 377 words against a 900 target on run 95a74dce.
    for prompt in (P2B_V3_COMPOSE_PROMPT, P2B_V3_OUTLINE_PROMPT):
        assert "TARGET WORD COUNT" in prompt
        assert "{target_word_count}" in prompt

    # The outline also gets the reserved figure its sections must total, so it
    # is never asked to reconcile two numbers.
    assert "{section_budget}" in P2B_V3_OUTLINE_PROMPT
    assert "{section_budget}" not in P2B_V3_COMPOSE_PROMPT


# --- the outline's facts arrive grouped, and the grouping is a real field ---


def test_facts_reach_the_outline_under_more_than_one_heading():
    """`getattr(claim, "subject", "")` read a field that has never existed.

    `NormalizedClaim` carries claim_id, text, source_ids, requirement_ids,
    as_of and confidence. The default swallowed the miss, so every fact in
    every run landed under "General" and the grouping this function exists for
    never once happened.
    """
    from app.features.prompt2blog.evidence_v3 import NormalizedClaim

    assert not hasattr(NormalizedClaim, "subject")
    assert "subject" not in NormalizedClaim.model_fields, (
        "if a real subject field is added, group on it directly rather than "
        "through the work order's search groups"
    )


# --- Phase 2: the pipeline stops arguing with itself -----------------------


def test_the_audit_is_told_which_questions_the_evidence_answered():
    """It asked repair to add water-fountain information that research had
    already filed unsupported, and repair is forbidden to invent facts."""
    from app.features.prompt2blog.instructions_v3 import _support_status

    class _Requirement:
        def __init__(self, rid, status, gap=""):
            self.requirement_id, self.status, self.gap = rid, status, gap

    class _Evidence:
        requirements = [
            _Requirement("r1", "supported"),
            _Requirement("water_refill_points", "unpublished", "No public fountains found."),
        ]

    text = _support_status(_Evidence())

    assert "r1: supported" in text
    assert "water_refill_points: unpublished — No public fountains found." in text
    assert "forbidden to invent" in text


def test_a_skipped_repair_says_why_rather_than_only_needs_revision():
    from app.features.prompt2blog.stages.v3.finalize import _repair_outcome

    skipped = _repair_outcome(
        {"repair_decision": {"route": "settle", "reason": "token_budget_reached"}}
    )
    assert skipped["ran"] is False
    assert "token budget was already spent" in skipped["explanation"]

    passed = _repair_outcome(
        {"repair_decision": {"route": "settle", "reason": "draft_passed_audit"}}
    )
    assert "passed the audit" in passed["explanation"]
    assert skipped["explanation"] != passed["explanation"]


def test_the_brief_writer_is_shown_what_each_form_is_not_for():
    from app.features.prompt2blog.brief_v4 import _form_exclusions
    from app.features.prompt2blog.editorial_catalog import load_editorial_catalog

    exclusions = _form_exclusions(load_editorial_catalog())

    assert "destination-guide: Do not use for a single practical problem" in exclusions
    assert len(exclusions.splitlines()) >= 10


# --- Phase 4: sentence openings, measured the same way twice ---------------


def test_the_splitter_does_not_cut_an_article_at_every_abbreviation():
    """Two splitters gave 59 and 68 units for the same article, which is why
    neither number was worth reporting."""
    from app.features.prompt2blog.quality import _sentences

    text = "The park is open 9:00 a.m. to 9:00 p.m. daily. Entry is free."

    assert len(_sentences(text)) == 2


def test_headings_and_list_markers_are_not_sentences():
    from app.features.prompt2blog.quality import _sentences

    text = "# A Heading\n\nThe path runs south.\n\n*   Malecon Pazos\n\n## Another\n"

    assert _sentences(text) == ["The path runs south.", "Malecon Pazos"]


def test_a_run_of_place_name_openings_is_reported_with_the_passage():
    from app.features.prompt2blog.quality import measure_sentence_openings

    metronome = (
        "Parque de la Pera has a play area. Parque Bernales is wooded. "
        "Parque Gandhi sits on the cliff. Parque Bicentenario opened in 2020."
    )
    varied = (
        "The path has a play area. It runs on through woodland. "
        "Further south the cliff drops away. You reach the 2020 park last."
    )

    flagged = measure_sentence_openings(metronome)
    clean = measure_sentence_openings(varied)

    assert flagged["opening_proper_noun_share"] == 1.0
    assert flagged["opening_longest_same_kind_run"] == 4
    assert "Parque de la Pera" in flagged["opening_run_example"]

    assert clean["opening_proper_noun_share"] == 0.0
    assert clean["opening_longest_same_kind_run"] == 0


def test_a_capitalised_first_word_is_not_by_itself_a_place_name():
    """Every sentence starts with a capital. Counting that would report 100%
    for any prose and mean nothing."""
    from app.features.prompt2blog.quality import measure_sentence_openings

    result = measure_sentence_openings(
        "The walk begins here. It ends there. You will want water."
    )

    assert result["opening_proper_noun_share"] == 0.0


def test_the_openings_are_measurements_and_never_gate_a_run():
    from app.features.prompt2blog.quality import (
        CONSTRAINT_MEASUREMENT_KEYS,
        HARD_CONSTRAINT_CHECK_KEYS,
        measure_sentence_openings,
    )

    for key in measure_sentence_openings("A sentence about Lima."):
        assert key in CONSTRAINT_MEASUREMENT_KEYS
        assert key not in HARD_CONSTRAINT_CHECK_KEYS
