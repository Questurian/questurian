"""Assembling the brief from an agreed grill.

The brief is never consumed and the finished article is judged against it, so
what goes in here is what the whole run answers to. The guard that matters most
is that the model cannot put words in the operator's mouth.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog.brief_v4 import (
    brief_fingerprint,
    brief_stage_record,
    build_brief,
    build_brief_prompt,
)
from app.features.prompt2blog.contracts_v4 import (
    MARKER_KEYS,
    GrillQuestion,
    GrillState,
    GrillTurn,
)
from app.features.prompt2blog.grill_v4 import GrillDependencies

SEED = "Lima is no longer simply the stopover before Machu Picchu"
FIRSTHAND = (
    "I was there 4 days last year. mostly ate. the ceviche place in Surquillo "
    "market was better than any of the fancy ones"
)


class FakeLLM:
    def __init__(self, response: dict[str, Any]):
        self.response = response
        self.prompts: list[str] = []

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
        self.prompts.append(prompt)
        return self.response, "{}"


def _turn(question_id: str, ask: str, answer: str) -> GrillTurn:
    return GrillTurn(
        question=GrillQuestion(
            question_id=question_id, topic="t", ask=ask, recommendation="r"
        ),
        answer=answer,
    )


def _agreed(**overrides) -> GrillState:
    payload: dict[str, Any] = dict(
        run_id="run-1",
        seed=SEED,
        location="Lima, Peru",
        status="agreed",
        consensus="A first-timer's guide for someone with a Lima layover.",
        markers_covered=list(MARKER_KEYS),
        turns=[
            _turn("q1", "Guide or the case?", "yeah guide. but a bit of a pitch"),
            _turn("q3", "What have you got that isn't public?", FIRSTHAND),
        ],
    )
    payload.update(overrides)
    return GrillState(**payload)


def _payload(**overrides) -> dict[str, Any]:
    payload = {
        "form_id": "destination-guide",
        "topic_module_ids": ["food-drink"],
        "primary_reader": "layover traveller, Cusco-bound",
        "reader_tags": ["first-time-visitor"],
        "reader_question": "Is Lima worth two extra nights?",
        "outcome": "book two extra nights on a layover",
        "spine": "food, with a cheap-beats-famous argument",
        "must_name": ["Surquillo market", "Huaca Pucllana"],
        "fails_if": "reads like a tourist board",
        "material": [{"kind": "firsthand", "quoted_answer": FIRSTHAND}],
    }
    payload.update(overrides)
    return payload


def _deps(payload: dict[str, Any]) -> GrillDependencies:
    return GrillDependencies(llm=FakeLLM(payload), research=lambda _s: ("", [], None))


def test_an_agreed_grill_becomes_a_brief():
    brief = build_brief(_agreed(), _deps(_payload()))

    assert brief.spine == "food, with a cheap-beats-famous argument"
    assert brief.fails_if == "reads like a tourist board"
    assert brief.must_name == ["Surquillo market", "Huaca Pucllana"]


def test_a_grill_still_asking_cannot_be_briefed():
    still_asking = GrillState(
        run_id="r",
        seed=SEED,
        status="asking",
        pending=GrillQuestion(question_id="q", topic="t", ask="a", recommendation="r"),
    )

    with pytest.raises(ValueError, match="reached agreement"):
        build_brief(still_asking, _deps(_payload()))


def test_first_hand_material_is_the_operator_s_exact_words():
    brief = build_brief(_agreed(), _deps(_payload()))

    assert brief.material[0].kind == "firsthand"
    assert brief.material[0].statement == FIRSTHAND


def test_material_the_operator_never_said_is_dropped():
    """The model nominates material; it does not get to write it.

    "Better than the fancy ones" becoming "cheaper than the fancy ones" is a
    claim nobody made and nothing will ever check, because first-hand material
    is excused from fact-checking by design.
    """
    tampered = _payload(
        material=[
            {
                "kind": "firsthand",
                "quoted_answer": "The ceviche at Surquillo market is cheaper than the fancy places.",
            }
        ]
    )

    brief = build_brief(_agreed(), _deps(tampered))

    assert brief.material == []


def test_material_with_an_unknown_kind_is_dropped():
    brief = build_brief(
        _agreed(),
        _deps(_payload(material=[{"kind": "vibes", "quoted_answer": FIRSTHAND}])),
    )

    assert brief.material == []


def test_no_material_is_a_research_led_piece_not_a_failure():
    brief = build_brief(_agreed(), _deps(_payload(material=[])))

    assert brief.material == []
    assert brief.spine  # the piece is still fully briefed


def test_the_seed_survives_as_provenance_only():
    brief = build_brief(_agreed(), _deps(_payload()))

    assert brief.seed == SEED
    # It is not the title, and nothing downstream treats it as a promise.
    assert brief.outcome != SEED


def test_a_brief_cannot_be_built_without_a_settled_location():
    """Guessing a place is how an article about somewhere else gets written."""
    with pytest.raises(ValueError, match="did not settle a location"):
        build_brief(_agreed(location=""), _deps(_payload()))


def test_the_fingerprint_follows_the_contents():
    first = build_brief(_agreed(), _deps(_payload()))
    same = build_brief(_agreed(), _deps(_payload()))
    changed = build_brief(_agreed(), _deps(_payload(spine="ruins, not food")))

    assert first.brief_fingerprint == same.brief_fingerprint
    assert first.brief_fingerprint != changed.brief_fingerprint


def test_the_fingerprint_does_not_include_itself():
    payload = {"spine": "food"}

    assert brief_fingerprint(payload) == brief_fingerprint(dict(payload))


def _flat(text: str) -> str:
    """The prompt is wrapped prose, so phrases span line breaks."""
    return " ".join(text.split())


def test_the_prompt_tells_the_model_not_to_tidy_the_operator_s_words():
    prompt = build_brief_prompt(_agreed())

    assert "EXACT copy" in prompt
    assert "do not summarise, tidy or merge" in _flat(prompt)
    assert SEED in prompt
    assert FIRSTHAND in prompt


def test_the_prompt_guards_the_analysis_form():
    # analysis went 0 for 3 in v3, selected by a model reading a title. It is
    # reachable only when the operator said they want to make a case.
    assert "make a case rather than write a guide" in _flat(build_brief_prompt(_agreed()))


def test_the_stage_record_shows_material_back_for_approval():
    # The operator approves the brief, so they have to be able to see exactly
    # what the system thinks they said about their own experience.
    record = brief_stage_record(build_brief(_agreed(), _deps(_payload())))

    assert record["material"] == [{"kind": "firsthand", "statement": FIRSTHAND}]
    assert record["fails_if"] == "reads like a tourist board"


# --- what the first real run hit at the brief step -------------------------


def test_required_strings_cannot_be_empty_in_the_schema():
    """`required` means the key exists, not that the value is useful.

    The first real run returned `primary_reader: ""`, which satisfied the
    schema completely and then failed Pydantic's own minimum -- a validation
    error about string length shown to someone who had just approved a brief.
    """
    from app.features.prompt2blog.brief_v4 import BRIEF_SCHEMA

    reader = BRIEF_SCHEMA["properties"]["primary_reader"]
    assert reader["minLength"] == 1


def test_every_v4_schema_got_the_same_guard():
    # It was wrong in the same way in four places, so it is fixed as a shape
    # rather than as four instances.
    #
    # `consensus` used to be asserted here too, and that was the wrong field to
    # generalise to. A brief's `primary_reader` is empty only when the model
    # failed; the grill's `consensus` is empty on every turn it is still
    # asking, because the prompt tells it to leave it so. The floor was
    # harmless while nothing checked it and fatal the moment Gemini started
    # being sent the schema -- the first real v4 run died on turn one with
    # `response.consensus: too short`. The state-dependent fields are asserted
    # in test_prompt2blog_schema_enforcement.py, which pins them open.
    from app.features.prompt2blog.grill_v4 import NEXT_TURN_SCHEMA
    from app.features.prompt2blog.research_v4 import EVIDENCE_SCHEMA
    from app.features.prompt2blog.work_order_v4 import WORK_ORDER_SCHEMA

    options = NEXT_TURN_SCHEMA["properties"]["options"]["items"]
    assert options["properties"]["text"]["minLength"] == 1
    assert WORK_ORDER_SCHEMA["properties"]["primary_subject"]["minLength"] == 1
    assert (
        EVIDENCE_SCHEMA["properties"]["sources"]["items"]["properties"]["title"][
            "minLength"
        ]
        == 1
    )


def test_an_empty_field_is_asked_about_again_before_giving_up():
    from app.features.prompt2blog.brief_v4 import BriefIncomplete

    thin = _payload(primary_reader="")
    deps = GrillDependencies(
        llm=FakeLLM(thin), research=lambda _s: ("", [], None)
    )

    with pytest.raises(BriefIncomplete) as error:
        build_brief(_agreed(), deps)

    assert len(deps.llm.prompts) == 2, "it should have asked again"
    assert "who it is for" in error.value.missing


def test_a_repeated_must_name_does_not_take_the_brief_down():
    """This reached the operator as a raw Pydantic error, mid-flow, after the
    grill had been paid for: "must_name entry values must be unique".

    The contract is right to refuse a brief that names the same thing twice.
    Refusing a whole good brief over a duplicated string is not.
    """
    deps = _deps(_payload(must_name=["Barranco", "barranco", "Miraflores"]))

    brief = build_brief(_agreed(), deps)

    assert brief.must_name == ["Barranco", "Miraflores"]


def test_a_must_name_sent_as_one_string_is_not_split_into_letters():
    """Run b78a9fe8 (2026-09-01) sent `must_name` as a sentence instead of a
    list, and the parser walked it one character at a time: the brief named
    "S", "t", "a", "n", "d" as things the article had to mention, the research
    plan was built on that, and nothing raised.
    """
    deps = _deps(_payload(must_name="Standout hospitality in Barranco"))

    brief = build_brief(_agreed(), deps)

    assert brief.must_name == ["Standout hospitality in Barranco"]


def test_a_list_written_as_lines_of_prose_becomes_its_entries():
    deps = _deps(_payload(must_name="- Surquillo market\n- Huaca Pucllana\n"))

    brief = build_brief(_agreed(), deps)

    assert brief.must_name == ["Surquillo market", "Huaca Pucllana"]


def test_repeats_are_dropped_from_every_list_the_model_fills():
    deps = _deps(
        _payload(
            reader_tags=["first-time-visitor", "first-time-visitor", "budget-focused"],
            topic_module_ids=["food-drink", "food-drink"],
        )
    )

    brief = build_brief(_agreed(), deps)

    assert brief.reader.tags == ["first-time-visitor", "budget-focused"]
    assert brief.topic_module_ids == ["food-drink"]


def test_an_invented_reader_tag_is_dropped_rather_than_fatal():
    # A closed vocabulary the model is never shown. Inventing one is normal.
    deps = _deps(_payload(reader_tags=["first-time-visitor", "food-obsessed"]))

    assert build_brief(_agreed(), deps).reader.tags == ["first-time-visitor"]


def test_a_brief_that_cannot_assemble_says_so_in_words_and_keeps_the_payload():
    """Whatever else fails the contract, the operator gets a sentence and the
    run keeps what came back."""
    from app.features.prompt2blog.brief_v4 import BriefUnusable

    deps = _deps(_payload(form_id="not-a-real-form"))

    with pytest.raises(BriefUnusable) as error:
        build_brief(_agreed(), deps)

    assert "form_id" in error.value.reason
    assert error.value.raw, "the payload has to travel with the failure"


def test_the_prompt_explains_every_field_it_requires():
    """Run 90b3f9bc (2026-08-30 20:01Z) came back with form, reader and
    reader-question empty — the exact three fields the rules never mentioned.

    The rules explained spine, outcome, fails-if, must-name and material, and
    said nothing about the other three. The model left blank what it was never
    asked for.
    """
    from app.features.prompt2blog.brief_v4 import build_brief_prompt

    prompt = " ".join(build_brief_prompt(_agreed()).split())

    assert "`form_id` is the kind of article" in prompt
    assert "`primary_reader` is who this is for" in prompt
    assert "`reader_question` is the question in that reader's head" in prompt
    # The schema cannot carry this on the Gemini path: its translator drops
    # minLength. So the prompt has to say it in words.
    assert "an empty string is not an answer" in prompt


def test_the_form_vocabulary_travels_in_the_schema():
    """`enum` is one of the few constraints Gemini's translator keeps.

    A bare string field named `form_id`, with its fifteen legal values stated
    nowhere, is a field a model is entitled to leave empty.
    """
    from typing import get_args

    from app.features.prompt2blog.brief_v4 import BRIEF_SCHEMA
    from app.features.prompt2blog.contracts_v4 import ArticleFormId

    assert BRIEF_SCHEMA["properties"]["form_id"]["enum"] == list(get_args(ArticleFormId))


def test_the_failure_says_what_is_missing_in_words():
    """Not a string-length error for a field nobody has heard of.

    The run has already paid for the grill by this point, so the operator is
    owed a sentence rather than a traceback.
    """
    from app.features.prompt2blog.brief_v4 import BriefIncomplete

    deps = GrillDependencies(
        llm=FakeLLM(_payload(spine="", fails_if="")),
        research=lambda _s: ("", [], None),
    )

    with pytest.raises(BriefIncomplete) as error:
        build_brief(_agreed(), deps)

    assert "what the piece is built on" in str(error.value)
    assert "what would make it a failure" in str(error.value)
    assert error.value.raw, "what came back has to travel with the failure"


def test_a_commissioning_answer_is_not_filed_as_evidence():
    """Run 95a74dce filed six of them as `interview`, 1,349 characters.

    `interview` is the one kind the evidence policy lets the writer assert with
    no source, so an editorial instruction filed there gains the standing of a
    reported fact. Those answers already reach every stage as the brief fields
    they became.
    """
    from app.features.prompt2blog.brief_v4 import _material_from

    spine = "The walk itself, north to south, in the order your feet meet it."
    state = _agreed(
        turns=[
            _turn("q1", "What is the spine?", spine),
            _turn("q2", "Anything of your own?", FIRSTHAND),
        ]
    )
    payload = {
        "spine": spine,
        "material": [
            {"kind": "interview", "quoted_answer": spine},
            {"kind": "firsthand", "quoted_answer": FIRSTHAND},
        ],
    }

    material = _material_from(payload, state)

    assert [item.statement for item in material] == [FIRSTHAND], (
        "the spine is an instruction the brief already carries, not evidence"
    )


def test_the_exact_quote_safeguard_is_untouched():
    """A paraphrase of a real answer is still dropped."""
    from app.features.prompt2blog.brief_v4 import _material_from

    state = _agreed(turns=[_turn("q1", "Anything of your own?", FIRSTHAND)])
    payload = {
        "material": [{"kind": "firsthand", "quoted_answer": FIRSTHAND[:-1] + " roughly."}]
    }

    assert _material_from(payload, state) == []


def test_a_rule_about_every_item_leaves_must_name_for_fails_if():
    """`must_name` is a coverage checklist, so a rule in it is enforced repetition.

    Run e001d48c was briefed with "For each working ascensor named: what a
    visitor pays at the window" and three more like it. The finished article
    printed the fare in six of its seven sections; the writer was obeying, and
    the audit scored the same list, so saying it once would have failed. The
    repetition was identical in the first draft and after repair, which is how
    it was traced back to the brief rather than to the repair loop.
    """
    deps = _deps(
        _payload(
            must_name=[
                "The visitor fare of 1,000 pesos",
                "For each working ascensor named: what a visitor pays",
                "Each ascensor: the street you step out onto",
            ],
            fails_if="reads like a tourist board",
        )
    )

    brief = build_brief(_agreed(), deps)

    assert brief.must_name == ["The visitor fare of 1,000 pesos"]
    # Kept, not discarded: the obligation moves to the line the whole article
    # is judged against instead of a list scored one entry at a time.
    assert brief.fails_if.startswith("reads like a tourist board")
    assert "For each working ascensor named: what a visitor pays" in brief.fails_if
    assert "Each ascensor: the street you step out onto" in brief.fails_if


def test_a_name_that_merely_starts_with_every_is_still_a_name():
    deps = _deps(_payload(must_name=["Every Man Jack bar", "Huaca Pucllana"]))

    brief = build_brief(_agreed(), deps)

    assert brief.must_name == ["Every Man Jack bar", "Huaca Pucllana"]


def test_the_prompt_tells_the_brief_writer_not_to_write_per_item_rules():
    deps = _deps(_payload())
    build_brief(_agreed(), deps)

    prompt = deps.llm.prompts[0]
    assert "Never write a rule" in prompt
    assert '"For each museum named: what it costs" is not a name' in prompt
    assert "belongs in `fails_if`" in prompt
