"""Naming the country, in all three places that decide where a search lands.

Run 76b36468 (2026-08-31) asked for "a community-led project offering guided
neighborhood visits in Buenos Aires" and came back with a garden collective in
Puerto Madero, Argentina. The article is about Medellin, whose Buenos Aires is
the neighbourhood the Ayacucho tram runs through.

    grill extracted:  "Medellin"        (no country)
    gather prompt:    "a travel article about Medellin"
    the question:     "in Buenos Aires in 2024"
    the search:        Argentina

The answer came back `supported`, so nothing downstream would have caught it.
v3 had the operator type a location and they always typed "city, country"; v4
replaced that with a field the grill infers and no format rule.
"""

from __future__ import annotations

from app.features.prompt2blog.contracts_v4 import (
    ArticleBrief,
    BriefReader,
    GrillQuestion,
    GrillState,
    WorkOrderRequirement,
)
from app.features.prompt2blog.grill_v4 import build_next_turn_prompt
from app.features.prompt2blog.research_v4 import build_gather_prompt
from app.features.prompt2blog.work_order_v4 import build_work_order_prompt


def _flat(text: str) -> str:
    return " ".join(text.split())


def _brief(location: str = "Medellin, Colombia") -> ArticleBrief:
    return ArticleBrief(
        brief_fingerprint="bf-1",
        seed="Beyond Comuna 13",
        location=location,
        form_id="destination-guide",
        reader=BriefReader(primary_reader="Travellers"),
        reader_question="Where else?",
        outcome="Go to Moravia",
        spine="Medellin is answering its tourism boom",
        fails_if="It reads like a policy essay",
    )


def test_the_grill_is_told_to_name_the_country():
    prompt = _flat(
        build_next_turn_prompt(
            GrillState(
                run_id="r",
                seed="Beyond Comuna 13",
                status="asking",
                pending=GrillQuestion(
                    question_id="q1", topic="t", ask="a", recommendation="r"
                ),
            )
        )
    )

    assert "city AND its country" in prompt
    assert '"Medellin, Colombia", never "Medellin"' in prompt
    # The failure named, so nobody later reads this as fussiness.
    assert "neighbourhood called Buenos Aires" in prompt


def test_the_work_order_is_told_its_questions_travel_alone():
    prompt = _flat(build_work_order_prompt(_brief()))

    assert "Every question names its place unambiguously" in prompt
    assert "the Buenos Aires neighbourhood of Medellin, Colombia" in prompt
    assert "sees the question and little else" in prompt


def test_the_search_pins_the_country_above_the_question():
    """The location was already in this prompt as a framing line, and a place
    name inside the question outranked it. This is the sentence that holds."""
    prompt = _flat(
        build_gather_prompt(
            _brief(),
            WorkOrderRequirement(
                requirement_id="q6",
                question="What community-led project offers guided visits in Buenos Aires?",
                kind="load_bearing",
            ),
        )
    )

    assert "EVERYTHING BELOW IS IN Medellin, Colombia" in prompt
    assert "it is the one in Medellin, Colombia that is meant" in prompt


def test_the_search_says_why_answering_about_elsewhere_is_the_worse_failure():
    """A wrong-country answer comes back `supported`. A missing one blocks and
    gets looked at."""
    prompt = _flat(
        build_gather_prompt(
            _brief(),
            WorkOrderRequirement(
                requirement_id="q6", question="Anything?", kind="load_bearing"
            ),
        )
    )

    assert "worse than not answering" in prompt
    assert "nothing downstream can tell" in prompt


def test_the_pin_follows_whatever_location_the_brief_carries():
    prompt = build_gather_prompt(
        _brief("Lima, Peru"),
        WorkOrderRequirement(requirement_id="q1", question="Ceviche?", kind="texture"),
    )

    assert "EVERYTHING BELOW IS IN Lima, Peru" in prompt
    assert "Medellin" not in prompt
