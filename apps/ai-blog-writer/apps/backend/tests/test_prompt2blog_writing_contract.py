"""Finding 04: the active writing instructions have to agree with each other.

Compose received, in one prompt, "gaps are internal metadata only" and "missing
support remains a visible gap"; "preserve stated uncertainty" and "it never
hedges"; a brief that defines the article and house rules still talking about
commissions, requirements and exclusions.

Precedence language does not fix that. A model handed two contradictory
directions obeys one of them, and which one is not ours to choose. These tests
read the prompts that are actually assembled, for real forms, and check that
the contradictions are gone rather than ranked.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.features.prompt2blog.config import (
    PROMPT2BLOG_HOUSE_RULES_FILE,
    PROMPT2BLOG_VOICE_FILE,
)
from app.features.prompt2blog.contracts_v4 import Prompt2BlogV4Request
from app.features.prompt2blog.editorial_catalog import load_editorial_catalog
from app.features.prompt2blog.instructions_v3 import (
    PRECEDENCE,
    resolve_structure_policy,
)
from app.features.prompt2blog.prompts.editorial_v3 import P2B_V3_COMPOSE_PROMPT
from tests.prompt2blog_packet_support import runtime_for

FIXTURE_PATH = (
    Path(__file__).parents[3]
    / "data"
    / "fixtures"
    / "prompt2blog"
    / "lima-scope-drift-v4.json"
)

# One from each half of the catalogue: a form that wants the answer-first shape
# and a form that does not.
REPRESENTATIVE_FORMS = ("service-guide", "feature-profile", "personal-essay-travelogue")


def _compose_prompt(form_id: str) -> str:
    """The prompt compose actually sends, template and context together."""
    fixture = json.loads(FIXTURE_PATH.read_text())
    fixture["brief"]["form_id"] = form_id
    runtime = runtime_for(
        Prompt2BlogV4Request.model_validate(
            {
                "schema_version": 4,
                "brief": fixture["brief"],
                "work_order": fixture["work_order"],
                "evidence_package": fixture["evidence_package"],
                "profiles": {"length_id": "medium", "creativity_level": "medium"},
            }
        )
    )
    structure = resolve_structure_policy(runtime.instructions)
    return P2B_V3_COMPOSE_PROMPT.format(
        outline="No plan.",
        structure_rules=structure.compose_rules(),
        target_word_count="900",
        instructions=runtime.instructions["stage_contexts"]["compose"]["text"],
        seo_guideline="",
        style_directive="",
    )


def _flat(text: str) -> str:
    return " ".join(text.split()).lower()


@pytest.mark.parametrize("form_id", REPRESENTATIVE_FORMS)
def test_no_prompt_asks_to_hide_and_to_show_the_same_gap(form_id: str):
    prompt = _flat(_compose_prompt(form_id))

    # The policy that owns this says: omit it, and record it as internal
    # metadata. Nothing may also ask for it on the page.
    assert "internal metadata only" in prompt
    assert "visible gap" not in prompt
    assert "remains a visible gap" not in prompt


@pytest.mark.parametrize("form_id", REPRESENTATIVE_FORMS)
def test_no_prompt_both_preserves_and_forbids_uncertainty(form_id: str):
    prompt = _flat(_compose_prompt(form_id))

    assert "never hedges" not in prompt
    # What replaced it: the distinction the pipeline actually wants.
    assert "supported uncertainty: preserve its exact scope" in prompt


@pytest.mark.parametrize("form_id", REPRESENTATIVE_FORMS)
def test_the_prompt_describes_this_article_not_an_old_commission_form(form_id: str):
    prompt = _flat(_compose_prompt(form_id))

    # v4 has no requirements list and no exclusions list; the brief is the
    # article. House rules used to demand both be "preserved", which is a
    # revision repair could never satisfy.
    assert "exclusions" not in prompt
    assert "every required question must be supported" not in prompt


@pytest.mark.parametrize("form_id", REPRESENTATIVE_FORMS)
def test_one_authority_order_and_it_says_what_each_layer_owns(form_id: str):
    prompt = _compose_prompt(form_id)
    order = " > ".join(PRECEDENCE)

    assert prompt.count(f"AUTHORITY ORDER: {order}") == 1
    assert "control every factual claim" in prompt
    assert "The approved brief controls intent" in prompt
    assert "The article form controls structure" in prompt
    assert "House style controls expression" in prompt


def test_house_style_no_longer_states_a_second_authority_order():
    house = PROMPT2BLOG_HOUSE_RULES_FILE.read_text(encoding="utf-8").lower()

    assert "## authority order" not in house
    assert "follow this order" not in house
    # And it no longer carries the completion standard, which was the
    # research-question checklist wearing a readiness hat. Readiness is
    # `policies.py`.
    assert "completion standard" not in house


def test_the_voice_keeps_a_limit_that_changes_the_reader_s_decision():
    voice = PROMPT2BLOG_VOICE_FILE.read_text(encoding="utf-8")

    assert "never hedges" not in voice
    # The positive half has to survive the edit: this is still the file that
    # says leave the guess out.
    assert "leaves the second thing out" in voice
    assert "part of the fact, not a hedge on it" in voice


def test_compose_asks_for_what_grounding_actually_enforces():
    """The audit's evidence boundary, in one assertion.

    "Every factual statement must trace to a claim" is stricter than the
    checker, which exempts general background and judgement. A rule nothing
    enforces trains the writer to ignore the ones that are enforced.
    """
    assert "Every factual statement must trace" not in P2B_V3_COMPOSE_PROMPT
    assert "General background a well-informed writer would state" in (
        P2B_V3_COMPOSE_PROMPT
    )


def test_attribution_has_one_answer_across_the_active_rules():
    catalog = load_editorial_catalog()
    house = _flat(catalog.house_rules.instructions)
    conventions = _flat(catalog.writing_conventions.instructions)

    for body in (house, conventions):
        assert "never names a source" in body or "never in the article" in body
    # Compose used to ask, in its own hard rules, to "preserve attribution"
    # three lines above being told attribution never reaches the prose.
    assert "preserve attribution" not in _flat(P2B_V3_COMPOSE_PROMPT)
