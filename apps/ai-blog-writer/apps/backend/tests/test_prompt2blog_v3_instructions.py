from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.features.prompt2blog.contracts_v4 import (
    EvidenceRequirement,
    Prompt2BlogV4Request,
)
from app.features.prompt2blog.evidence_v3 import normalize_evidence
from app.features.prompt2blog.instructions_v3 import (
    EVIDENCE_DISPOSITION_POLICY,
    PRECEDENCE,
    assemble_v3_instructions,
    stage_context_manifest,
)


FIXTURE_PATH = (
    Path(__file__).parents[3]
    / "data"
    / "fixtures"
    / "prompt2blog"
    / "lima-scope-drift-v4.json"
)


def _fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def _request(**overrides) -> Prompt2BlogV4Request:
    fixture = _fixture()
    payload = {
        "schema_version": 4,
        "brief": fixture["brief"],
        "work_order": fixture["work_order"],
        "evidence_package": fixture["evidence_package"],
        "profiles": {
            "length_id": "standard",
            "creativity_level": "medium",
        },
    }
    payload.update(overrides)
    return Prompt2BlogV4Request.model_validate(payload)


def test_instruction_layers_follow_the_fixed_authority_order():
    instructions = assemble_v3_instructions(_request())

    assert [layer.layer for layer in instructions.layers] == [
        "evidence",
        "brief",
        "form",
        "topic_modules",
        "audience",
        "house_style",
    ]
    assert instructions.precedence == list(PRECEDENCE)
    assert instructions.schema_version == 5
    # The brief leads and evidence follows it as material (#432, A5), and the
    # voice is present at all for the first time.
    assert instructions.stage_contexts.compose.included_sections == [
        "compose_authority",
        "voice",
        "brief",
        "evidence",
        "form",
        "topic_modules",
        "audience",
        "writing_conventions",
        "house_style",
    ]
    assert len(instructions.stage_contexts.compose.fingerprint) == 64


def test_stage_contexts_are_deterministic_and_keep_only_job_specific_material():
    fixture = _fixture()

    first = assemble_v3_instructions(_request()).stage_contexts
    second = assemble_v3_instructions(_request()).stage_contexts

    assert first == second
    # Facts by subject, not indexed by the question that produced them.
    assert "FACTS AVAILABLE, BY SUBJECT" in first.outline.text
    assert "## Allowed structures" in first.outline.text
    assert fixture["evidence_package"]["sources"][0]["url"].rstrip("/") not in (
        first.outline.text
    )
    assert "HOUSE STYLE" not in first.outline.text
    # The outline knows what kind of piece this is now. That is the change.
    assert "THE VOICE YOU ARE WRITING IN" in first.outline.text
    assert "THE FACTS YOU MAY USE" in first.compose.text
    assert "HOUSE STYLE" in first.compose.text
    assert "VERIFIED EVIDENCE" not in first.audit.text
    assert "TOPIC MODULES" not in first.audit.text
    assert "COMPACT SCOPE AND STYLE LOCK" in first.repair_lock.text
    assert "VERIFIED EVIDENCE" not in first.repair_lock.text
    assert EVIDENCE_DISPOSITION_POLICY in first.compose.text
    assert EVIDENCE_DISPOSITION_POLICY in first.repair_lock.text
    assert EVIDENCE_DISPOSITION_POLICY not in first.audit.text


def test_brief_layer_locks_form_subject_and_scope():
    fixture = _fixture()
    instructions = assemble_v3_instructions(_request())
    brief_layer = next(
        layer for layer in instructions.layers if layer.layer == "brief"
    )

    assert fixture["brief"]["seed"] in brief_layer.body
    assert "Primary subject: Lima" in brief_layer.body
    assert "Scope mode: single_subject" in brief_layer.body
    assert "- Medellín — context_only" in brief_layer.body
    assert "never become co-subjects" in brief_layer.body
    # v4 has no exclusions. The brief's must_name and fails_if carry what the
    # piece has to do and what counts as failing it (ADR 0030, W7).
    for name in fixture["brief"]["must_name"]:
        assert name in brief_layer.body
    assert fixture["brief"]["fails_if"] in brief_layer.body
    assert instructions.instruction_meta["form_id"] == "analysis"


def test_only_the_commissioned_modules_and_tags_reach_the_stack():
    instructions = assemble_v3_instructions(_request())
    modules_layer = next(
        layer for layer in instructions.layers if layer.layer == "topic_modules"
    )
    audience_layer = next(
        layer for layer in instructions.layers if layer.layer == "audience"
    )

    assert instructions.instruction_meta["topic_module_ids"] == (
        _fixture()["brief"]["topic_module_ids"]
    )
    assert "## Research questions" in modules_layer.body
    assert "Safety" not in instructions.instruction_meta["topic_module_ids"]
    assert "adjust emphasis only" in audience_layer.body


def test_evidence_layer_preserves_publisher_url_dates_and_exact_notes():
    fixture = _fixture()
    source = fixture["evidence_package"]["sources"][0]
    instructions = assemble_v3_instructions(_request())
    evidence_layer = next(
        layer for layer in instructions.layers if layer.layer == "evidence"
    )

    assert source["publisher"] in evidence_layer.body
    assert source["url"].rstrip("/") in evidence_layer.body
    assert source["retrieved_at"] in evidence_layer.body
    for note in source["notes"]:
        assert note in evidence_layer.body
    assert "never invent a bridge" in evidence_layer.body.casefold()
    assert "`remaining_gaps` as internal metadata only" in evidence_layer.body
    assert "visible gap" not in evidence_layer.body


def test_normalized_requirements_keep_work_order_order_and_report_gaps():
    request = _request()

    evidence = normalize_evidence(request.work_order, request.evidence_package)

    assert [item.requirement_id for item in evidence.requirements] == [
        item.requirement_id for item in request.work_order.requirements
    ]
    assert evidence.unresolved_requirement_ids() == ["r2", "r3"]
    receipt = evidence.receipt()
    assert receipt["requirement_status"]["r1"] == "supported"
    assert receipt["unresolved_requirement_ids"] == ["r2", "r3"]


def test_there_is_no_headline_context_because_nothing_writes_a_headline():
    """The seed is the title (ADR 0034).

    The stage that read this context is deleted, so building it would be
    assembling material for a reader that no longer exists -- and it would
    still show up in the debug manifest as though something used it.
    """
    contexts = assemble_v3_instructions(_request()).stage_contexts

    assert not hasattr(contexts, "title")
    assert set(stage_context_manifest(contexts)) == {
        "outline",
        "compose",
        "audit",
        "repair_lock",
    }


def test_unknown_catalog_ids_fail_instead_of_silently_dropping():
    # The request contract already rejects unknown IDs, so the assembler is
    # forced past it to prove it fails loudly rather than dropping the module.
    broken = _request().model_copy(deep=True)
    broken.brief.topic_module_ids = ["not-a-module"]

    with pytest.raises(ValueError, match="Unknown topic modules"):
        assemble_v3_instructions(broken)


def test_supported_requirement_cannot_also_declare_a_gap():
    with pytest.raises(ValidationError, match="cannot describe a gap"):
        EvidenceRequirement.model_validate(
            {
                "requirement_id": "r1",
                "status": "supported",
                "claim_ids": ["c1"],
                "gap": "Still incomplete.",
            }
        )


def test_first_hand_material_is_written_as_the_writers_own_knowledge():
    """The operator answering a question research could not is a fact, not a
    caveat. Attributing it back to them reintroduces exactly the disclaimer
    prose the voice rules ban."""
    from app.features.prompt2blog.instructions_v3 import _evidence_body

    class _Evidence:
        records_text = "RECORDS"

    body = _evidence_body(_Evidence())

    assert "state it directly, as fact" in body
    assert "no attribution, no sourcing language" in body


def test_the_writer_is_told_not_to_narrate_the_premise_check():
    """Over-transparency is one of the loudest signals a human did not write it.

    The evidence records now carry what the commission assumed and what
    research found. Without this line that block is an invitation to write
    "the 2025 ranking, which is the most recent published edition" into a
    travel piece.
    """
    instructions = assemble_v3_instructions(_request())
    evidence_layer = next(
        layer for layer in instructions.layers if layer.layer == "evidence"
    )

    assert (
        "A confirmed premise is simply a fact the article may use"
        in evidence_layer.body
    )
    assert "never mention that it was checked" in evidence_layer.body


def test_the_writer_is_told_not_to_narrate_a_resolved_conflict():
    """The premise line's twin, and the same failure shape.

    Conflict resolution sends the operator's own decision to the writer, and
    on the run that proved the feature the auditor caught the writer narrating
    the disagreement itself. The reader wants the settled figure, not the
    argument that produced it.
    """
    instructions = assemble_v3_instructions(_request())
    evidence_layer = next(
        layer for layer in instructions.layers if layer.layer == "evidence"
    )

    assert "A resolved conflict is the same" in evidence_layer.body
    assert "Never tell the reader that two records disagreed" in evidence_layer.body


# --- what each writing step knows (#432) ----------------------------------


def _flat(text: str) -> str:
    return " ".join(text.split())


def test_the_outline_is_told_which_publication_it_works_for():
    """The largest single change in the spec.

    Compose is obedient: give it a good plan and it writes well, give it an
    audit and it writes an excellent audit. The outline decides which, and it
    has never been told what kind of piece Questurian makes.
    """
    outline = assemble_v3_instructions(_request()).stage_contexts.outline.text

    assert "THE VOICE YOU ARE WRITING IN" in outline
    assert "It treats you as an adult with a decision to make." in outline
    assert "AUDIENCE GUIDANCE" in outline


def test_the_outline_gets_facts_by_subject_not_by_question():
    """One section per research question is a research plan, not an article.

    That is exactly what the Lima outline produced, because the ledger it was
    handed was indexed by requirement id.
    """
    outline = assemble_v3_instructions(_request()).stage_contexts.outline.text

    assert "FACTS AVAILABLE, BY SUBJECT" in outline
    # Coverage still has to be checkable, but it is labelled as bookkeeping so
    # it cannot be mistaken for a section plan.
    assert "not a section plan" in outline


def test_the_outline_may_not_write_about_the_research():
    # "Do not claim a transformation" became a section called Scope limits.
    outline = _flat(assemble_v3_instructions(_request()).stage_contexts.outline.text)

    assert "No section may take scope, limits, method, evidence or the state of our research as its subject." in outline


def test_the_outline_budget_leaves_room_for_what_compose_adds():
    """Every medium run overshot by construction.

    The plan budgeted the full target while compose was separately required to
    add an opening and takeaways that nobody counted.

    The reserve is now subtracted before the prompt is built rather than asked
    for in prose. The old wording survived beside the template rule that
    contradicted it, and run 95a74dce planned 730 against a 900 target twice --
    900 - 165 -- because it obeyed the more specific of the two.
    """
    from app.features.prompt2blog.support import UNPLANNED_WORDS, _section_budget

    assert _section_budget({"length": {"target_word_count": 900}}) == 900 - UNPLANNED_WORDS
    assert _section_budget({"length": {"target_word_count": 0}}) == 0
    assert _section_budget({}) == 0

    outline = _flat(assemble_v3_instructions(_request()).stage_contexts.outline.text)

    # The model is given the reserved number, never the subtraction.
    assert "do not subtract anything further" in outline.lower()
    assert "target minus that" not in outline


def test_compose_leads_with_the_brief_and_treats_evidence_as_material():
    """Evidence still constrains every fact; it stops being the reason the
    article exists, which is what produced a piece about its own research."""
    compose = assemble_v3_instructions(_request()).stage_contexts.compose.text

    assert "WHAT WE ARE MAKING" in compose
    assert "THE FACTS YOU MAY USE" in compose
    assert compose.index("WHAT WE ARE MAKING") < compose.index("THE FACTS YOU MAY USE")
    assert "constrain every factual claim absolutely" in _flat(compose)


def test_compose_is_given_the_voice_and_the_conventions():
    compose = assemble_v3_instructions(_request()).stage_contexts.compose.text

    assert "THE VOICE YOU ARE WRITING IN" in compose
    assert "WRITING CONVENTIONS" in compose


# --- the failure line reaches the stage that can act on it ------------------
#
# The line was already in the brief block every stage is shown. What was
# missing was anyone being asked to read it: run 849ae5aa walked into its own
# stated failure in the first sentence and the audit scored it 8.


def test_the_audit_is_shown_the_line_that_defines_failure():
    fixture = _fixture()
    audit = assemble_v3_instructions(_request()).stage_contexts.audit.text

    assert f"This piece fails if: {fixture['brief']['fails_if']}" in audit


def test_the_audit_prompt_asks_whether_the_draft_walks_into_it():
    from app.features.prompt2blog.prompts.editorial_v3 import (
        P2B_V3_QUALITY_AUDIT_PROMPT,
    )

    prompt = _flat(P2B_V3_QUALITY_AUDIT_PROMPT)

    assert "fails_if_quote" in prompt
    assert 'The line under "This piece fails if"' in prompt
    # Evidence, not a verdict: a boolean here was answered without reading.
    assert "Do not answer whether the draft avoids it" in prompt
    assert "the quote is checked against the draft" in prompt
    # Freehand text, so an auditor that cannot apply it must leave it alone
    # rather than invent a reading.
    assert "it is not a gate" in prompt


def test_the_outline_gets_its_facts_under_more_than_one_heading():
    """The grouping existed and never ran.

    `_facts_by_subject` read `claim.subject` through a getattr default, and
    `NormalizedClaim` has no such field, so every fact in every run landed
    under "General" -- the exact shape the function was written to prevent.
    It now groups on the work order's own search groups, which say which
    questions share sources rather than which question was asked.
    """
    fixture = _fixture()
    package = json.loads(json.dumps(fixture["evidence_package"]))
    # The shared fixture has one claim against one question, so it cannot show
    # a split. Give it a second fact against a second question rather than
    # editing a file the other tests in here read.
    first = package["claims"][0]
    second = dict(first, claim_id="c2", requirement_ids=["r2"])
    package["claims"].append(second)
    for requirement in package["requirements"]:
        if requirement["requirement_id"] == "r2":
            requirement.update(status="supported", claim_ids=["c2"], gap="")

    work_order = json.loads(json.dumps(fixture["work_order"]))
    for requirement in work_order["requirements"]:
        requirement["search_group"] = (
            "getting around" if requirement["requirement_id"] == "r1" else "prices"
        )

    request = _request(work_order=work_order, evidence_package=package)
    facts = assemble_v3_instructions(request).stage_contexts.outline.text
    block = facts[facts.index("FACTS AVAILABLE, BY SUBJECT"):]
    block = block[: block.index("COVERAGE BOOKKEEPING")]

    headings = [
        line
        for line in block.splitlines()
        if line and not line.startswith("- ") and line != "FACTS AVAILABLE, BY SUBJECT"
    ]

    assert headings == ["getting around", "prices"]
    assert "General" not in headings


def test_a_fact_answering_no_grouped_question_still_appears():
    """Grouping must never be a filter.

    A work order planned before #500 carries no search groups at all, so this
    is also the honest description of what those runs still get: one bucket,
    every fact present.
    """
    request = _request()
    stripped = request.model_copy(deep=True)
    for requirement in stripped.work_order.requirements:
        requirement.search_group = ""

    facts = assemble_v3_instructions(stripped).stage_contexts.outline.text
    block = facts[facts.index("FACTS AVAILABLE, BY SUBJECT"):]
    block = block[: block.index("COVERAGE BOOKKEEPING")]

    assert "General" in block
    assert len([line for line in block.splitlines() if line.startswith("- ")]) == len(
        normalize_evidence(stripped.work_order, stripped.evidence_package).claims
    )


def test_only_the_outline_is_handed_the_bare_question_list():
    """The list is provenance for one stage, and a checklist everywhere else.

    A plan now runs to forty-four questions. Under a bare `Requirements:`
    heading with nothing saying what they were, they reached compose, the audit
    and the repair lock as well -- and both of those prompts already use the
    word for something else: the audit calls a section's job its requirement,
    and repair is told it may not change "the requirements" meaning the
    approved scope. A judge marks a draft down for each of forty-four items it
    cannot find; repair puts them back a paragraph at a time. That is #506.

    Only the outline needs them, because it names the `requirement_ids` each
    section serves.

    This is about the bare list only. Compose still receives REQUIREMENT
    COVERAGE from the evidence projection, which carries the same questions
    with their status and says what it is -- it is how the writer knows to
    write around an `unpublished` question rather than narrate the hole.
    """
    fixture = _fixture()
    contexts = assemble_v3_instructions(_request()).stage_contexts
    entries = [
        f"- {item['requirement_id']} [{item['kind']}] — {item['question']}"
        for item in fixture["work_order"]["requirements"]
    ]
    assert entries, "fixture must declare questions for this test to mean anything"

    for entry in entries:
        assert entry in contexts.outline.text
    # And it is labelled, so the outline cannot read it as a coverage list.
    assert "not a checklist" in _flat(contexts.outline.text)

    for stage in (contexts.compose, contexts.audit, contexts.repair_lock):
        assert "Requirements:" not in stage.text
        for entry in entries:
            assert entry not in stage.text
    # The repair lock rendered them in its own shorter form. That is gone too.
    for item in fixture["work_order"]["requirements"]:
        assert (
            f"- {item['requirement_id']} — {item['question']}"
            not in contexts.repair_lock.text
        )
    # The audit is not left guessing: it still gets status per question.
    assert "SUPPORT AND OMISSION" in contexts.audit.text


def test_the_stages_without_the_questions_keep_the_rest_of_the_brief():
    """Dropping the list must not take the scope lock with it."""
    fixture = _fixture()
    contexts = assemble_v3_instructions(_request()).stage_contexts

    for stage in (contexts.compose, contexts.audit):
        assert fixture["brief"]["fails_if"] in stage.text
        assert "Primary subject: Lima" in stage.text
        assert "- Medellín — context_only" in stage.text
    lock = contexts.repair_lock.text
    assert fixture["brief"]["outcome"] in lock
    assert "Primary subject: Lima" in lock
    assert "Do not add factual material." in lock

def _two_claim_request(*, second_selected: bool):
    """The fixture plus a second claim on the same question, one of them cut."""
    fixture = _fixture()
    package = fixture["evidence_package"]
    first = package["claims"][0]
    second = {
        **first,
        "claim_id": "c2",
        "text": "A second fact about the same question, differently useful.",
        "selected": second_selected,
    }
    package = {
        **package,
        "claims": [first, second],
        "requirements": [
            {**item, "claim_ids": ["c1", "c2"]}
            if item["requirement_id"] == "r1"
            else item
            for item in package["requirements"]
        ],
    }
    return _request(evidence_package=package), second


def test_a_deselected_claim_never_reaches_the_writer():
    """Run 9e66bf84 handed compose 105 of 105 claims and one 200-word section
    56 of them -- three and a half words per claim, at which density there is
    no sentence you can write except a list (#534)."""
    request, cut = _two_claim_request(second_selected=False)
    contexts = assemble_v3_instructions(request).stage_contexts

    assert cut["text"] not in contexts.compose.text
    assert cut["text"] not in contexts.outline.text
    # The claim it was cut beside is still there, so this is a selection and
    # not an empty dossier.
    assert "c1" in contexts.compose.text


def test_a_deselected_claim_is_still_in_the_dossier_for_checking():
    """The rule that makes the cut safe. Groundedness and the readiness
    follow-up read `records_text`, so deselecting removes a fact from the
    writer's desk and never from the record -- nothing becomes unverifiable,
    and a supported question stays supported."""
    request, cut = _two_claim_request(second_selected=False)

    evidence = normalize_evidence(request.work_order, request.evidence_package)

    assert [claim.claim_id for claim in evidence.claims] == ["c1", "c2"]
    assert cut["text"] in evidence.records_text
    assert cut["text"] not in evidence.compose_records_text
    assert evidence.receipt()["requirement_status"]["r1"] == "supported"


def test_coverage_never_tells_the_writer_a_question_has_no_answers():
    """A `supported` question whose claims were all cut must not render as
    "claims: none". The writer would read that as a hole to fill, ask for the
    fact, and be refused it -- the checklist behaviour arriving by a different
    door."""
    fixture = _fixture()
    package = {
        **fixture["evidence_package"],
        "claims": [{**fixture["evidence_package"]["claims"][0], "selected": False}],
    }
    request = _request(evidence_package=package)

    evidence = normalize_evidence(request.work_order, request.evidence_package)

    assert "none kept for this article" in evidence.compose_records_text
    # And the canonical projection is untouched: it still names the claim.
    assert "claims: c1" in evidence.records_text


def test_the_outline_plans_from_what_the_writer_will_have():
    request, cut = _two_claim_request(second_selected=True)
    outline = assemble_v3_instructions(request).stage_contexts.outline.text

    assert cut["text"] in outline

