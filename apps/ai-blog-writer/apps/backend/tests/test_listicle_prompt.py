"""What the interview is told, and when.

Two of the plan's changes are only visible in the prompt: the requirements are
named as requirements before any menu is written, and the catalogue is the
subject's rather than the restaurant one shown to everything.
"""

from __future__ import annotations

from app.features.listicle_pipeline.prompts import build_listicle_turn_prompt
from app.features.prompt2blog.contracts_v4 import GrillQuestion, GrillState
from app.features.listicle_pipeline.contracts import LISTICLE_MARKER_KEYS
from tests.listicle_test_support import turn


def _asking(seed: str, covered: list[str], turns=None) -> GrillState:
    return GrillState(
        run_id="prompt-1",
        seed=seed,
        status="asking",
        markers_covered=covered,
        marker_keys=LISTICLE_MARKER_KEYS,
        turns=turns or [],
        pending=GrillQuestion(
            question_id="q1", topic="next", ask="What next?", recommendation="-"
        ),
    )


def test_a_hotel_commission_is_not_shown_the_restaurant_catalogue():
    state = _asking(
        "20 independent hotels in Lima for longer stays",
        ["kind", "place", "count"],
        [turn("kind", "hotels"), turn("count", "20", recommendation="20")],
    )
    prompt = build_listicle_turn_prompt(state)
    assert "lodging-format" in prompt
    assert "long-stay" in prompt
    # The two that were being offered to hotels, and are about food.
    assert "regional-tradition" not in prompt
    assert "informal --" not in prompt


def test_a_bar_commission_gets_the_bar_dimensions():
    state = _asking(
        "The 15 best rooftop bars in Lima",
        ["kind", "place", "count"],
        [turn("kind", "rooftop bars"), turn("count", "15", recommendation="15")],
    )
    prompt = build_listicle_turn_prompt(state)
    assert "drink-specialty" in prompt
    assert "local-drinking" in prompt


def test_the_full_catalogue_waits_until_the_count_is_settled():
    """The turn that can act on it is the first turn after `count`, and the
    prompt already refuses to ask about angles before then. Three hundred lines
    of wording rules it is forbidden to use is input paid for and unread."""
    early = build_listicle_turn_prompt(
        _asking("20 rooftop bars in Lima", ["kind"], [turn("kind", "bars")])
    )
    assert "in outline" in early
    assert "write:" not in early

    late = build_listicle_turn_prompt(
        _asking(
            "20 rooftop bars in Lima",
            ["kind", "place", "count"],
            [turn("kind", "bars"), turn("count", "20", recommendation="20")],
        )
    )
    assert "write:" in late
    assert len(late) > len(early)


def test_the_requirements_are_named_as_requirements_rather_than_angles():
    prompt = build_listicle_turn_prompt(_asking("Rooftop bars in Lima", []))
    assert "REQUIREMENT" in prompt
    assert "never demote one into an optional angle" in prompt


def test_an_angle_has_to_add_a_route_rather_than_restate_the_commission():
    prompt = build_listicle_turn_prompt(
        _asking(
            "Rooftop bars in Lima",
            ["kind", "place", "count"],
            [turn("kind", "bars"), turn("count", "20", recommendation="20")],
        )
    )
    assert "distinct ROUTE" in prompt
    assert "not a restatement of the commission" in prompt


def test_the_angle_arithmetic_is_not_written_out_twice():
    """It lived in the prompt as prose and in `shapes` as code, and the two
    came to disagree. The prose is gone and the number is interpolated."""
    prompt = build_listicle_turn_prompt(
        _asking(
            "40 cevicherias in Lima",
            ["kind", "place", "count"],
            [turn("kind", "cevicherias"), turn("count", "40", recommendation="40")],
        )
    )
    assert "about 40 items wants 6 angles" not in prompt
    assert "recommend about 6" in prompt


def test_overlap_is_offered_as_a_warning_not_a_prohibition():
    prompt = build_listicle_turn_prompt(
        _asking(
            "20 cevicherias in Lima",
            ["kind", "place", "count"],
            [turn("kind", "cevicherias"), turn("count", "20", recommendation="20")],
        )
    )
    assert "a warning, not a rule" in prompt
    assert "NEVER CHOOSE TWO SHAPES FROM THE SAME GROUP" not in prompt


def test_the_options_are_asked_for_with_their_shape_and_role():
    prompt = build_listicle_turn_prompt(
        _asking(
            "20 cevicherias in Lima",
            ["kind", "place", "count"],
            [turn("kind", "cevicherias"), turn("count", "20", recommendation="20")],
        )
    )
    assert "{text, recommended, group, shape, role}" in prompt


def test_the_count_question_is_told_to_put_a_number_in_its_recommendation():
    """Because "yes" is the most common answer to it, and the number the
    acceptance agrees to has to be readable from what was proposed."""
    prompt = build_listicle_turn_prompt(_asking("The best cevicherias in Lima", []))
    assert "plain number" in prompt
