"""The list of edits a person makes by hand, and the fact it must never supply.

Run 062c0b86 (2026-09-01) was titled "Lima Has a Pyramid Older Than the Inca
Empire" and the article never gives a date. Nine research questions, not one of
which asked how old the pyramid is.

The tempting note is "add a sentence saying it dates to around 400 AD". That
number would be invented at the last possible moment, after every evidence
check in the pipeline has run, and would enter a published article through the
one door with nothing else guarding it. Most of what follows is about that.
"""

from __future__ import annotations

from typing import Any

from app.features.prompt2blog.contracts_v4 import (
    ArticleBrief,
    BriefReader,
    EvidencePackage,
)
from app.features.prompt2blog.notes_v4 import (
    HAVE_IT,
    MAX_ITEMS,
    NOT_ESTABLISHED,
    article_headings,
    build_punch_list,
    build_punch_list_prompt,
    numbers_the_run_does_not_have,
    unused_claims,
)

ARTICLE = """# Lima Has a Pyramid Older Than the Inca Empire

Allow about ninety minutes for the visit.

## What the digs found

The site sits in Miraflores and the adobe is stacked in bookshelf rows.

## The night tour

It opens Wednesday to Monday, and the terrace restaurant seats 40.
"""


def _brief(**overrides) -> ArticleBrief:
    payload: dict[str, Any] = dict(
        brief_fingerprint="bf-1",
        seed="Lima Has a Pyramid Older Than the Inca Empire",
        location="Lima, Peru",
        form_id="destination-guide",
        reader=BriefReader(primary_reader="layover traveller"),
        reader_question="Is the Huaca worth an evening?",
        outcome="book the night tour",
        spine="a working dig you can eat beside",
        fails_if="reads like a tourist board",
    )
    payload.update(overrides)
    return ArticleBrief(**payload)


def _evidence(**overrides) -> EvidencePackage:
    payload = {
        "work_order_fingerprint": "wo-1",
        "sources": [
            {
                "source_id": "s1",
                "title": "Site report",
                "publisher": "Municipalidad de Miraflores",
                "url": "https://miraflores.gob.pe/huaca",
                "retrieved_at": "2026-09-01",
                "source_type": "official",
                "material_type": "web",
                "notes": ["Dig summary."],
            }
        ],
        "claims": [
            {
                "claim_id": "c1",
                "text": "Excavations recovered 16,000 shark vertebrae from the site.",
                "source_ids": ["s1"],
                "requirement_ids": ["r1"],
                "confidence": "high",
            },
            {
                "claim_id": "c2",
                "text": "The adobe is stacked in bookshelf rows across the Miraflores site.",
                "source_ids": ["s1"],
                "requirement_ids": ["r1"],
                "confidence": "high",
            },
        ],
        "requirements": [
            {"requirement_id": "r1", "status": "supported", "claim_ids": ["c1", "c2"]}
        ],
    }
    payload.update(overrides)
    return EvidencePackage.model_validate(payload)


class FakeLLM:
    """Returns whatever the test wants the read to have come back as."""

    def __init__(self, payload: dict[str, Any]):
        self.payload = payload
        self.prompts: list[str] = []

    def invoke_json(self, *, prompt: str, **_kwargs: Any) -> tuple[dict[str, Any], str]:
        self.prompts.append(prompt)
        return self.payload, ""


def _run(payload: dict[str, Any], **overrides) -> dict[str, Any]:
    llm = FakeLLM(payload)
    return build_punch_list(
        brief=overrides.get("brief", _brief()),
        title="Lima Has a Pyramid Older Than the Inca Empire",
        article_markdown=overrides.get("article", ARTICLE),
        evidence=overrides.get("evidence", _evidence()),
        llm=llm,
        model_name=None,
    )


def _item(**overrides) -> dict[str, Any]:
    item = {
        "kind": "rephrase",
        "heading": "The night tour",
        "where": "It opens Wednesday to Monday",
        "note": "Dinner beside a lit pyramid is buried inside opening hours.",
        "needs": NOT_ESTABLISHED,
    }
    item.update(overrides)
    return item


# --- the fact it must never supply -----------------------------------------


def test_an_item_carrying_a_figure_the_run_does_not_have_is_thrown_away():
    """The Huaca date. Nothing in the run establishes it, so a note offering
    one is a fact invented after every evidence check has already run."""
    result = _run(
        {
            "items": [
                _item(
                    kind="add_sentence",
                    heading="What the digs found",
                    note="Add a sentence saying the pyramid dates to around 400 AD.",
                )
            ]
        }
    )

    assert result["items"] == []
    assert "400" in result["dropped"][0]


def test_a_note_may_repeat_a_figure_the_dossier_established():
    """The guard is against inventing, not against arithmetic-free reuse. The
    shark vertebrae are researched, graded and sitting unused."""
    result = _run(
        {
            "items": [
                _item(
                    kind="move",
                    heading="What the digs found",
                    note="16,000 shark vertebrae is the most repeatable fact here and it is missing.",
                    needs=HAVE_IT,
                    claim_ids=["c1"],
                )
            ]
        }
    )

    assert len(result["items"]) == 1
    assert result["dropped"] == []


def test_a_note_may_repeat_a_figure_the_article_already_prints():
    result = _run({"items": [_item(note="The 40 seats are worth saying earlier.")]})

    assert len(result["items"]) == 1
    assert result["dropped"] == []


def test_a_figure_the_article_spells_out_in_words_is_still_dropped():
    """A known limitation, kept on purpose and visible when it fires.

    The article says "ninety minutes"; a note saying "90 minutes" is talking
    about a number the run does have, and loses its item anyway. Reading word
    forms would fix it and would also be the first crack in a guard whose
    whole value is that it is dumb and total. Losing one note of six is cheap;
    an invented figure in a published article is not, and the drop is reported
    rather than silent.
    """
    result = _run({"items": [_item(note="Lead with the 90 minutes, not the history.")]})

    assert result["items"] == []
    assert "90" in result["dropped"][0]


def test_the_guard_reads_a_number_the_same_however_it_is_punctuated():
    assert numbers_the_run_does_not_have(
        "16000 vertebrae", article_markdown=ARTICLE, evidence=_evidence()
    ) == []
    assert numbers_the_run_does_not_have(
        "dates to 400 AD", article_markdown=ARTICLE, evidence=_evidence()
    ) == ["400"]


def test_the_prompt_forbids_stating_the_value_and_says_why():
    prompt = build_punch_list_prompt(
        brief=_brief(),
        title="Lima Has a Pyramid Older Than the Inca Empire",
        article_markdown=ARTICLE,
        evidence=_evidence(),
        unused=[],
    )
    flat = " ".join(prompt.split())

    assert "Never state the value." in flat
    assert "you need a date before this headline is honest" in flat
    assert "the only step with nothing checking it" in flat


# --- the two kinds, and which one an item really is ------------------------


def test_saying_the_run_has_it_requires_naming_a_claim_that_exists():
    """Otherwise "you have this already" is itself a fact stated from memory."""
    result = _run(
        {"items": [_item(needs=HAVE_IT, claim_ids=["c99"])]}
    )

    assert result["items"][0]["needs"] == NOT_ESTABLISHED
    assert result["items"][0]["have"] == []


def test_a_have_it_item_quotes_the_dossier_rather_than_the_model():
    """The model gives ids; the text comes from the evidence package. An item
    cannot misstate the fact it is pointing at."""
    result = _run(
        {
            "items": [
                _item(
                    needs=HAVE_IT,
                    claim_ids=["c1"],
                    note="The strongest fact in the research never made the piece.",
                )
            ]
        }
    )

    assert result["items"][0]["have"] == [
        {
            "claim_id": "c1",
            "text": "Excavations recovered 16,000 shark vertebrae from the site.",
        }
    ]


def test_an_item_with_no_claims_is_the_second_kind_by_default():
    result = _run({"items": [_item()]})

    assert result["items"][0]["needs"] == NOT_ESTABLISHED


# --- placeable, short, ranked ----------------------------------------------


def test_an_item_points_at_a_heading_the_article_actually_has():
    result = _run({"items": [_item(heading="the night tour")]})

    assert result["items"][0]["heading"] == "The night tour"


def test_an_invented_heading_leaves_the_item_pointing_at_the_whole_piece():
    """Rather than dropping a note that may still be worth reading. It just
    stops pretending to be placeable."""
    result = _run({"items": [_item(heading="Getting there")]})

    assert result["items"][0]["heading"] == ""
    assert result["items"][0]["note"]


def test_the_list_is_capped_because_a_long_one_is_scrolled_past():
    result = _run({"items": [_item(where=f"spot {index}") for index in range(20)]})

    assert len(result["items"]) == MAX_ITEMS


def test_the_order_the_read_gave_is_the_order_kept():
    result = _run(
        {
            "items": [
                _item(note="First thing."),
                _item(note="Second thing."),
            ]
        }
    )

    assert [item["note"] for item in result["items"]] == ["First thing.", "Second thing."]


def test_an_item_with_no_note_or_no_kind_is_dropped_rather_than_guessed():
    result = _run({"items": [_item(note=""), _item(kind="reword")]})

    assert result["items"] == []
    assert len(result["dropped"]) == 2


def test_headings_are_read_off_the_article():
    assert article_headings(ARTICLE) == [
        "Lima Has a Pyramid Older Than the Inca Empire",
        "What the digs found",
        "The night tour",
    ]


# --- the half that needs no model ------------------------------------------


def test_a_researched_claim_the_article_never_used_is_found_without_a_model():
    """The safest items on the list: checked and graded before the writing
    started, so raising them cannot invent anything."""
    unused = unused_claims(_evidence(), ARTICLE)

    assert [item["claim_id"] for item in unused] == ["c1"]


def test_a_claim_the_article_did_use_is_not_reported_as_missing():
    # c2's bookshelf rows and Miraflores are both in the article.
    assert all(item["claim_id"] != "c2" for item in unused_claims(_evidence(), ARTICLE))


def test_a_claim_with_nothing_distinctive_in_it_is_left_alone():
    """One match is enough, and no match at all means nothing to look for.
    Telling an operator they left something out when they did not is worse
    than staying quiet about one they did."""
    evidence = _evidence(
        claims=[
            {
                "claim_id": "c3",
                "text": "the site is open to visitors on most days",
                "source_ids": ["s1"],
                "requirement_ids": ["r1"],
                "confidence": "low",
            }
        ],
        requirements=[
            {"requirement_id": "r1", "status": "supported", "claim_ids": ["c3"]}
        ],
    )

    assert unused_claims(evidence, ARTICLE) == []


def test_the_unused_claims_are_reported_whatever_the_model_said():
    """They stand on their own. The deterministic half does not depend on the
    read agreeing with it."""
    result = _run({"items": []})

    assert [item["claim_id"] for item in result["researched_and_unused"]] == ["c1"]


# --- what the read is actually asked ---------------------------------------


def test_the_prompt_finally_reads_the_line_that_defines_failure():
    """`fails_if` has been on the brief since v4 and nothing has ever read
    it."""
    prompt = build_punch_list_prompt(
        brief=_brief(),
        title="t",
        article_markdown=ARTICLE,
        evidence=_evidence(),
        unused=[],
    )

    assert "IT FAILS IF: reads like a tourist board" in prompt
    assert "nothing in this system has ever read it" in " ".join(prompt.split())


def test_the_prompt_says_it_is_not_a_rewrite_and_not_a_score():
    prompt = build_punch_list_prompt(
        brief=_brief(),
        title="t",
        article_markdown=ARTICLE,
        evidence=_evidence(),
        unused=[],
    )

    assert "Not a rewrite. Not a score." in prompt


def test_the_read_is_given_the_headline_as_a_promise_to_the_reader():
    prompt = build_punch_list_prompt(
        brief=_brief(),
        title="Lima Has a Pyramid Older Than the Inca Empire",
        article_markdown=ARTICLE,
        evidence=_evidence(),
        unused=[],
    )
    flat = " ".join(prompt.split())

    assert "is a promise to a reader who clicked it" in flat
    assert "an age, a number, a superlative, a first or an oldest" in flat


# --- the shape the read actually came back in ------------------------------


def test_a_bare_list_of_items_is_still_a_punch_list():
    """Run 849ae5aa returned four good items as a bare array against a schema
    asking for {"items": [...]} -- including the one that caught the article
    contradicting its own headline on rainfall. All four were thrown away and
    the operator got an empty list on an article with real problems in it."""
    result = _run([_item(note="First thing."), _item(note="Second thing.")])

    assert [item["note"] for item in result["items"]] == ["First thing.", "Second thing."]


def test_the_list_is_read_under_its_other_names_too():
    for name in ("edits", "notes", "punch_list", "fixes"):
        result = _run({name: [_item(note=f"Found under {name}.")]})
        assert result["items"], f"a list named {name} was dropped"


def test_a_payload_with_nothing_usable_in_it_is_simply_empty():
    assert _run({"summary": "the article is fine"})["items"] == []

