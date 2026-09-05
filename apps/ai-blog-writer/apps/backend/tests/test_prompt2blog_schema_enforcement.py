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
