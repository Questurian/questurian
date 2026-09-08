"""The assignment, assembled by hand.

The thing under test is that nothing surprising happens. Every field of the
brief reaches the writer, the operator's own words arrive unedited, and the
same brief produces the same bytes twice -- because the fingerprint those bytes
are filed under is what tells one draft's assignment from another's.

The negative assertions matter as much as the positive ones. ADR 0036 removed
an instruction stack the operator never saw; a test that only checks the brief
is present would pass just as happily with the whole stack appended after it.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest

from app.features.prompt2blog.contracts_v4 import (
    ArticleBrief,
    BriefMaterial,
    BriefReader,
)
from app.features.prompt2blog.writer_prompt import (
    RESEARCH_NOTE_HEADING,
    STYLE_VERSION,
    TEMPLATE_VERSION,
    PromptCannotBeAssembled,
    assemble_writer_prompt,
    prompt_stage_record,
)

WHEN = date(2026, 9, 7)


def _brief(**overrides) -> ArticleBrief:
    payload: dict[str, Any] = dict(
        brief_fingerprint="bf-1",
        seed="Valparaiso built thirty hill elevators to get people home",
        location="Valparaiso, Chile",
        form_id="destination-guide",
        topic_module_ids=["food-drink"],
        reader=BriefReader(
            primary_reader="a first-time visitor on foot with half an afternoon",
            tags=["first-time-visitor"],
        ),
        reader_question="which ascensores are running today and what do I pay",
        outcome="choose three working ascensores to ride this afternoon",
        spine="they are working transit, not a photo stop",
        must_name=["The 1,000 peso visitor fare", "The 200 peso resident fare"],
        material=[
            BriefMaterial(
                kind="firsthand",
                statement="I rode Reina Victoria in March",
                note="one visit",
            )
        ],
        fails_if="reads like a tourist board",
    )
    payload.update(overrides)
    return ArticleBrief(**payload)


def _assemble(brief: ArticleBrief | None = None, **overrides):
    kwargs: dict[str, Any] = dict(
        target_word_count=900,
        form_label="Destination guide",
        research_date=WHEN,
        brief_notes=[],
    )
    kwargs.update(overrides)
    return assemble_writer_prompt(brief or _brief(), **kwargs)


def test_every_brief_field_reaches_the_writer():
    """A field on the brief and missing from the prompt is a field nobody asked for."""
    brief = _brief()
    text = _assemble(brief).text

    for value in (
        brief.seed,
        brief.location,
        brief.reader.primary_reader,
        brief.reader_question,
        brief.outcome,
        brief.spine,
        brief.fails_if,
        "Destination guide",
    ):
        assert value in text, value


def test_must_name_entries_arrive_one_per_line():
    text = _assemble().text
    assert "- The 1,000 peso visitor fare" in text
    assert "- The 200 peso resident fare" in text


def test_first_hand_material_is_verbatim():
    """The one input nothing downstream fact-checks.

    It is true by virtue of who said it, so a paraphrase here is an unsourced
    claim wearing a person's authority.
    """
    text = _assemble().text
    assert "I rode Reina Victoria in March" in text
    assert "one visit" in text


def test_empty_lists_say_so_rather_than_leaving_a_hole():
    """An empty section reads as an oversight, and an oversight gets filled in."""
    text = _assemble(_brief(must_name=[], material=[])).text
    assert "Nothing specifically named." in text
    assert "None. No first-hand experience was supplied." in text


def test_labels_travel_but_the_rules_behind_them_do_not():
    text = _assemble(brief_notes=["Reader is a First-time visitor", "Covers Food and drink"]).text
    assert "Reader is a First-time visitor" in text
    assert "Covers Food and drink" in text


def test_no_metadata_block_when_the_brief_carries_none():
    assert "Also on the brief:" not in _assemble().text


def test_the_old_instruction_stack_is_not_appended():
    """ADR 0036's whole point, asserted as an absence.

    The prompt shown to the operator is the prompt that gets sent. A test that
    only checked the brief was present would pass with the forty-one
    prohibitions, the SEO block and the form rulebook stapled underneath it.
    """
    text = _assemble().text.lower()
    for banned in (
        "work order",
        "requirement_id",
        "evidence package",
        "search engine",
        "seo",
        "keyword",
        "groundedness",
        "punch list",
        "section count",
    ):
        assert banned not in text, banned


def test_the_reader_is_told_they_cannot_see_the_brief_or_the_note():
    """Repeat fault, found in two consecutive real runs.

    Valparaiso `e001d48c` closed with a paragraph reporting what had been
    verified on which date. Juarez `8a8c681b` opened a paragraph with "The
    concrete case, since it should be earned rather than asserted" -- the
    brief's own wording, answered on the page.

    A rule against this already existed in the style brief ("commentary about
    your writing") and did not stop either one, because the writer did not
    classify those sentences as commentary: the assignment separately asks it
    to state limitations, and nothing said whose limitations. So this pins the
    idea that fixed it rather than another prohibition -- the reader cannot see
    either document, and a sentence that only makes sense to someone who has
    read them does not belong in the article.
    """
    text = _assemble().text
    assert "has never seen this brief" in text
    assert "will never see your research note" in text
    assert "do not quote it, answer it or acknowledge it on the page" in text


def test_a_limitation_is_stated_about_the_subject_not_about_the_research():
    """The distinction the writer had no way to draw.

    "State a limitation in the article" is a real requirement and stays. What
    was missing is that a limitation of the world is useful to a reader and a
    limitation of the afternoon's research is not, and the assignment now says
    which is which with one example of each.
    """
    text = _assemble().text
    assert "as a fact about the subject rather than about your research" in text
    assert "is a report on your afternoon" in text


def test_the_research_note_decides_when_it_disagrees_with_the_article():
    """Repeat fault, serious in both real runs.

    Valparaiso asserted a fare two paragraphs after saying its source did not
    resolve it. Juarez asserted a ranking its own note had recorded as
    unreadable, and got it wrong.

    "Resolve contradictions between them" was already in the assignment and
    failed both times, because resolving a contradiction by deleting the hedge
    satisfies it exactly as well as deleting the claim. The instruction is now
    asymmetric: the note wins, and the claim is what gives way.
    """
    text = _assemble().text
    assert "the note decides" in text
    assert "may not appear anywhere in the article as a settled fact" in text
    assert "rather than to drop the doubt" in text


def test_a_promise_made_to_the_reader_is_kept_for_every_item():
    """The strongest repeat so far: three runs, three times, two cities.

    Valparaiso `e001d48c` was required to say where you can sit at each of four
    named lifts and answered for two. Its reader arrived from Vina or the bus
    and the itinerary assumed the port. Juarez `8a8c681b` dropped the language
    thread at 3:30pm. Juarez `37ff2bd8` dropped it at the one transaction in
    the day that actually needed it, and its review named the mechanism: the
    question was "answered wherever it was easy and dropped wherever it was
    hard".

    The cause is this assignment's own rule. "If a requested detail cannot be
    established, avoid an unsupported assertion and identify the omission in
    the separate research note" is right for a single fact and wrong for a
    commitment the article has already made four times: the writer obeyed it,
    moved the gap to a note the reader never sees, and left silence where the
    reader reads reassurance. So the fix is a limit on that rule rather than a
    new prohibition, and it carries its own guard against becoming a labelled
    field under every heading -- which is the shape that produced
    database-flavoured prose before.
    """
    text = _assemble().text
    assert "answer it for every item, including the ones where you could not establish it" in text
    assert "silence reads as reassurance" in text
    assert "not as a labelled field repeated under every heading" in text


def test_the_research_note_heading_is_stated_exactly_once():
    """The parser matches this heading, so the prompt and the parser share a constant."""
    text = _assemble().text
    assert text.count(RESEARCH_NOTE_HEADING) == 1


def test_the_research_date_is_stated_and_stored():
    prompt = _assemble()
    assert "2026-09-07" in prompt.text
    assert prompt.research_date == WHEN


def test_retrieved_pages_are_named_as_data():
    """A page the writer opens is research material, not a second assignment."""
    assert "not instructions" in _assemble().text


def test_the_same_brief_assembles_the_same_bytes():
    first = _assemble()
    second = _assemble()
    assert first.text == second.text
    assert first.prompt_fingerprint == second.prompt_fingerprint


def test_a_changed_brief_changes_the_fingerprint():
    changed = _brief(brief_fingerprint="bf-2", spine="a different argument entirely")
    assert _assemble().prompt_fingerprint != _assemble(changed).prompt_fingerprint


def test_a_changed_length_changes_the_fingerprint():
    assert (
        _assemble().prompt_fingerprint
        != _assemble(target_word_count=1500).prompt_fingerprint
    )


def test_the_prompt_carries_the_brief_it_was_built_from():
    assert _assemble().brief_fingerprint == "bf-1"


def test_versions_are_recorded_on_every_prompt():
    prompt = _assemble()
    assert prompt.template_version == TEMPLATE_VERSION
    assert prompt.style_version == STYLE_VERSION


def test_assembly_refuses_a_length_of_zero():
    with pytest.raises(PromptCannotBeAssembled):
        _assemble(target_word_count=0)


def test_assembly_refuses_a_blank_form():
    with pytest.raises(PromptCannotBeAssembled):
        _assemble(form_label="   ")


def test_the_stage_record_keeps_the_whole_text():
    """A receipt that paraphrases the assignment cannot answer what was asked for."""
    prompt = _assemble()
    record = prompt_stage_record(prompt)
    assert record["text"] == prompt.text
    assert record["characters"] == len(prompt.text)
    assert record["prompt_fingerprint"] == prompt.prompt_fingerprint
