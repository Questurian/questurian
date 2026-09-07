"""Whether an edit still says what the evidence says.

The probe that started this. Packet: "A costs $20. B costs $40." Proposal: "A
costs $40. B costs $20." Every number in the proposal is in the packet, both
claims are wrong, and the introduced-figure check reported nothing -- it
compares sets of tokens, and the two sets are identical.

The checker is a controlled fixture throughout. These assert what the code does
with a verdict, not that a real model produces the right one; no claim about
real model quality follows from any of them.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog.edit_review import (
    SUPPORTED,
    UNCHECKED,
    UNSUPPORTED,
    EditReview,
    binding_failure,
    candidate_hash,
    evidence_fingerprint,
    review_section_edit,
)

ARTICLE = (
    "The direct answer.\n\n"
    "## Prices\n\nA costs $20. B costs $40.\n\n"
    "## Getting there\n\nThe bus runs hourly.\n"
)
PACKET = {
    "evidence_fingerprint": "ev-1",
    "selection_fingerprint": "sel-1",
    "facts": [
        {"claim_id": "c1", "text": "A costs $20.", "as_of": "March 2026"},
        {"claim_id": "c2", "text": "B costs $40."},
    ],
    "notes": [{"text": "Prices are for the high season only."}],
    "supplied_material": [{"kind": "visit", "statement": "I waited 45 minutes."}],
}


class _Checker:
    """A checker that answers with whatever the test decided it should."""

    def __init__(self, response: Any) -> None:
        self.response = response
        self.prompts: list[str] = []

    def invoke_json(self, *, job_id, prompt, **_kwargs):
        self.prompts.append(prompt)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response, "{}"


def _review(response: Any, candidate: str = "## Prices\n\nA costs $40.") -> EditReview:
    return review_section_edit(
        llm=_Checker(response),
        run_id="run-1",
        section_id="s1",
        content=ARTICLE,
        original="## Prices\n\nA costs $20. B costs $40.",
        candidate=candidate,
        packet=PACKET,
        base_revision=3,
    )


def test_swapped_prices_are_reported_as_unsupported():
    """The probe. Every figure is in the packet and the claim is still false."""
    review = _review(
        {
            "grounded": False,
            "assessment": "The prices are attached to the wrong things.",
            "unsupported_claims": [
                {
                    "claim": "A costs $40",
                    "reason": "The record says A costs $20 and B costs $40.",
                    "severity": "high",
                }
            ],
        },
        candidate="## Prices\n\nA costs $40. B costs $20.",
    )

    assert review.status == UNSUPPORTED
    assert review.checked is True
    assert review.blocks_without_a_decision is True
    assert review.high_severity[0]["claim"] == "A costs $40"


def test_a_grounded_edit_passes():
    review = _review(
        {
            "grounded": True,
            "assessment": "Every figure matches the record it comes from.",
            "unsupported_claims": [],
        }
    )

    assert review.status == SUPPORTED
    assert review.checked is True
    assert review.blocks_without_a_decision is False


def test_a_malformed_verdict_is_unchecked_and_never_a_pass():
    """Absence read as agreement is the failure this whole path exists to avoid."""
    review = _review({"grounded": "yes", "assessment": "", "unsupported_claims": []})

    assert review.status == UNCHECKED
    assert review.checked is False
    # And unchecked is not a fail either -- it is a decision for a person.
    assert review.blocks_without_a_decision is True


def test_a_provider_failure_degrades_rather_than_blocking():
    review = _review(RuntimeError("the checker is down"))

    assert review.status == UNCHECKED
    assert review.checked is False
    assert "provider call failed" in review.assessment


def test_the_checker_reads_the_section_in_its_article():
    """A claim can be wrong only in context, and a recommendation is only
    overstated relative to what the article already said."""
    checker = _Checker(
        {"grounded": True, "assessment": "Fine.", "unsupported_claims": []}
    )
    review_section_edit(
        llm=checker,
        run_id="run-1",
        section_id="s1",
        content=ARTICLE,
        original="## Prices\n\nA costs $20. B costs $40.",
        candidate="## Prices\n\nA is the cheaper one.",
        packet=PACKET,
        base_revision=0,
    )

    prompt = checker.prompts[0]
    assert "## Getting there" in prompt
    # The section being judged is not repeated into its own context block.
    assert prompt.count("The bus runs hourly.") == 1
    assert "I waited 45 minutes." in prompt
    assert "Prices are for the high season only." in prompt
    assert "as of March 2026" in prompt


def test_first_hand_material_is_named_as_testimony_with_its_own_scope():
    """The prompt has to say what makes "I waited 45 minutes" different from
    "the wait is 45 minutes", or the checker has no basis to separate them."""
    checker = _Checker(
        {"grounded": True, "assessment": "Fine.", "unsupported_claims": []}
    )
    review_section_edit(
        llm=checker,
        run_id="run-1",
        section_id="s1",
        content=ARTICLE,
        original="## Prices\n\nA costs $20.",
        candidate="## Prices\n\nThe wait is 45 minutes.",
        packet=PACKET,
        base_revision=0,
    )

    prompt = checker.prompts[0]
    assert "testimony with its own scope" in prompt
    assert "the wait is 45 minutes" in prompt.lower()


def test_a_review_is_bound_to_what_it_read():
    review = _review(
        {"grounded": True, "assessment": "Fine.", "unsupported_claims": []}
    )

    assert review.run_id == "run-1"
    assert review.section_id == "s1"
    assert review.base_revision == 3
    assert review.candidate_hash == candidate_hash("## Prices\n\nA costs $40.")
    assert review.evidence_fingerprint == "ev-1:sel-1"


# ---------------------------------------------------------------------------
# The binding, checked on the way back in
# ---------------------------------------------------------------------------


def _bound(**overrides) -> EditReview:
    fields = {
        "status": SUPPORTED,
        "checked": True,
        "run_id": "run-1",
        "section_id": "s1",
        "candidate_hash": candidate_hash("## Prices\n\nA is $20."),
        "base_revision": 3,
        "evidence_fingerprint": "ev-1:sel-1",
    }
    fields.update(overrides)
    return EditReview(**fields)


def _failure(review, candidate: str = "## Prices\n\nA is $20.") -> str:
    return binding_failure(
        review,
        run_id="run-1",
        section_id="s1",
        candidate=candidate,
        packet=PACKET,
    )


def test_a_matching_review_binds():
    assert _failure(_bound()) == ""


def test_client_modified_text_cannot_inherit_a_successful_review():
    """The whole reason the binding exists.

    The review was generated on the server, went to a browser as JSON, and came
    back in a request body. A verdict that says a candidate is grounded says it
    about the candidate it read.
    """
    assert _failure(_bound(), "## Prices\n\nA is $999.") == (
        "this review was made for different text"
    )


def test_a_review_from_another_run_or_section_does_not_bind():
    assert _failure(_bound(run_id="run-2")) == (
        "this review was made for a different run"
    )
    assert _failure(_bound(section_id="s2")) == (
        "this review was made for a different section"
    )


def test_a_review_made_against_other_evidence_does_not_bind():
    assert _failure(_bound(evidence_fingerprint="ev-9:sel-9")) == (
        "this review was made against different evidence"
    )


def test_no_review_at_all_is_a_binding_failure_not_a_pass():
    assert _failure(None) == "this edit carries no review"


def test_a_run_with_no_fingerprints_still_gets_an_evidence_identity():
    """Weaker than the fingerprints, and better than binding to nothing."""
    legacy = {"facts": [{"text": "A costs $20."}]}
    first = evidence_fingerprint(legacy)
    assert first.startswith("facts:")
    assert first == evidence_fingerprint({"facts": [{"text": "A costs $20."}]})
    assert first != evidence_fingerprint({"facts": [{"text": "A costs $25."}]})
