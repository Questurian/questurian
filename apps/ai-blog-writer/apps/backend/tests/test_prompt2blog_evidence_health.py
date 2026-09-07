"""Improvement 08: weak input, named before confident prose is written from it.

The gate already asks whether the dossier answers the questions. It never asked
whether the answers are the kind an article can stand on, so a menu price
checked eighteen months ago and one checked last week reach the writer looking
identical -- and the article states both in the present tense.

The temptation here is an expiry, and it is wrong. How long a fact stays true
depends on the fact: a founding date never goes stale, a tasting-menu price
goes stale in a season. So the comparison is against what the *article*
promised, and the tests that matter are the ones proving a piece which promised
nothing is left alone.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.features.prompt2blog.contracts_v4 import (
    ArticleBrief,
    BriefReader,
    EvidenceClaim,
    EvidenceConflict,
    EvidencePackage,
    EvidenceRequirement,
    EvidenceSource,
)
from app.features.prompt2blog.evidence_health import (
    CURRENCY_PROMISE_MONTHS,
    assess_evidence_health,
    is_time_sensitive,
    promises_currency,
)

TODAY = date(2026, 9, 7)


def _brief(**overrides) -> ArticleBrief:
    payload = dict(
        brief_fingerprint="bf-1",
        seed="Where to eat in Lima right now",
        location="Lima, Peru",
        form_id="service-guide",
        reader=BriefReader(primary_reader="layover traveller", tags=[]),
        reader_question="What does a good meal cost right now?",
        outcome="book a table tonight",
        spine="cheap beats famous",
        fails_if="reads like a tourist board",
    )
    payload.update(overrides)
    return ArticleBrief(**payload)


def _source(source_id: str = "s1", **overrides) -> EvidenceSource:
    payload = dict(
        source_id=source_id,
        title="Surquillo price survey",
        publisher="Peru Retail",
        url="https://example.pe/prices",
        retrieved_at=date(2026, 8, 1),
        source_type="reporting",
        material_type="web",
        notes=["Stall prices."],
    )
    payload.update(overrides)
    return EvidenceSource(**payload)


def _claim(claim_id: str, text: str, **overrides) -> EvidenceClaim:
    payload = dict(
        claim_id=claim_id,
        text=text,
        source_ids=["s1"],
        requirement_ids=["r1"],
        confidence="high",
    )
    payload.update(overrides)
    return EvidenceClaim(**payload)


def _evidence(claims, sources=None, conflicts=None) -> EvidencePackage:
    return EvidencePackage(
        work_order_fingerprint="wo-1",
        sources=sources or [_source()],
        claims=claims,
        requirements=[
            EvidenceRequirement(
                requirement_id="r1",
                status="supported",
                claim_ids=[claim.claim_id for claim in claims],
            )
        ],
        conflicts=conflicts or [],
    )


def _health(brief=None, evidence=None, today=TODAY, **kwargs):
    return assess_evidence_health(
        brief or _brief(),
        evidence
        or _evidence([_claim("c1", "Stall ceviche costs $8.", as_of=date(2026, 8, 1))]),
        today=today,
        **kwargs,
    )


def _kinds(health) -> set[str]:
    return {finding.kind for finding in health.findings}


# ---------------------------------------------------------------------------
# What makes a statement answerable for being current
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Stall ceviche costs $8.",
        "The museum opens at 09:00 on weekdays.",
        "The airport bus departs every 20 minutes.",
        "Tickets are 45 soles.",
        "The tasting menu is currently unavailable.",
    ],
)
def test_a_statement_a_reader_acts_on_today_is_time_sensitive(text):
    assert is_time_sensitive(text) is True


@pytest.mark.parametrize(
    "text",
    [
        "Huaca Pucllana was built by the Lima culture.",
        "Barranco sits south of Miraflores.",
        "The neighbourhood is walkable and quiet after dark.",
    ],
)
def test_a_statement_that_does_not_go_stale_is_not_flagged_as_time_sensitive(text):
    assert is_time_sensitive(text) is False


# ---------------------------------------------------------------------------
# A promise, not a topic
# ---------------------------------------------------------------------------


def test_an_article_that_says_right_now_has_promised_currency():
    assert promises_currency(_brief()) is True


def test_an_article_about_an_earlier_moment_has_promised_the_opposite():
    """And must not be nagged for resting on older facts.

    Nagging it would train the operator to ignore all of this, which is the way
    a diagnostic stops working without anybody switching it off.
    """
    snapshot = _brief(
        seed="What Barranco was like before the boom",
        reader_question="How had the neighbourhood changed by 2019?",
        outcome="understand what was lost",
    )
    assert promises_currency(snapshot) is False


def test_the_promise_is_read_off_the_lines_written_for_a_reader():
    """`spine` and `fails_if` are the operator talking to the pipeline.

    A spine that happens to contain the word "current" is not a promise
    anybody made to a reader.
    """
    internal = _brief(
        seed="Where to eat in Lima",
        reader_question="Which stalls are worth the trip?",
        outcome="pick a stall",
        spine="the current consensus is wrong",
        fails_if="fails if it ignores current prices",
    )
    assert promises_currency(internal) is False


# ---------------------------------------------------------------------------
# The four findings
# ---------------------------------------------------------------------------


def test_a_price_with_no_date_is_named():
    health = _health(evidence=_evidence([_claim("c1", "Stall ceviche costs $8.")]))
    assert "undated_time_sensitive" in _kinds(health)


def test_a_fact_that_does_not_go_stale_needs_no_date():
    health = _health(
        evidence=_evidence([_claim("c1", "Huaca Pucllana sits in Miraflores.")])
    )
    assert "undated_time_sensitive" not in _kinds(health)


def test_a_fact_nobody_can_return_to_is_named():
    health = _health(
        evidence=_evidence(
            [_claim("c1", "The guide said the walk takes an hour.", as_of=TODAY)],
            sources=[
                _source(url=None, publisher=None, material_type="first-person-notes")
            ],
        )
    )
    assert "no_source_to_return_to" in _kinds(health)


def test_a_fact_with_one_reachable_source_is_not_named():
    health = _health(
        evidence=_evidence(
            [
                _claim(
                    "c1",
                    "The walk takes an hour.",
                    as_of=TODAY,
                    source_ids=["s1", "s2"],
                )
            ],
            sources=[
                _source(),
                _source(
                    source_id="s2",
                    url=None,
                    publisher=None,
                    material_type="first-person-notes",
                ),
            ],
        )
    )
    assert "no_source_to_return_to" not in _kinds(health)


def test_two_chosen_facts_that_disagree_with_nobody_deciding_are_named():
    """The writer will pick one and not say that it did."""
    health = _health(
        evidence=_evidence(
            [
                _claim("c1", "Entry costs 15 soles.", as_of=TODAY),
                _claim("c2", "Entry costs 30 soles.", as_of=TODAY),
            ],
            conflicts=[
                EvidenceConflict(
                    conflict_id="k1",
                    claim_ids=["c1", "c2"],
                    summary="Two prices are published for the same entry.",
                )
            ],
        )
    )
    assert "unsettled_conflict" in _kinds(health)


def test_a_conflict_somebody_settled_is_not_raised_again():
    health = _health(
        evidence=_evidence(
            [
                _claim("c1", "Entry costs 15 soles.", as_of=TODAY),
                _claim("c2", "Entry costs 30 soles.", as_of=TODAY),
            ],
            conflicts=[
                EvidenceConflict(
                    conflict_id="k1",
                    claim_ids=["c1", "c2"],
                    summary="Two prices are published.",
                    resolution="The 15-soles rate is the resident price.",
                )
            ],
        )
    )
    assert "unsettled_conflict" not in _kinds(health)


def test_a_conflict_the_operator_already_cut_one_side_of_is_settled():
    """Deselecting one of two contradictory facts *is* the decision."""
    health = _health(
        evidence=_evidence(
            [
                _claim("c1", "Entry costs 15 soles.", as_of=TODAY),
                _claim("c2", "Entry costs 30 soles.", as_of=TODAY, selected=False),
            ],
            conflicts=[
                EvidenceConflict(
                    conflict_id="k1",
                    claim_ids=["c1", "c2"],
                    summary="Two prices are published.",
                )
            ],
        )
    )
    assert "unsettled_conflict" not in _kinds(health)


# ---------------------------------------------------------------------------
# The promise the evidence cannot keep
# ---------------------------------------------------------------------------


def test_a_promise_of_now_resting_on_old_prices_is_the_one_thing_that_interrupts():
    old = date(2024, 1, 1)
    health = _health(
        evidence=_evidence([_claim("c1", "Stall ceviche costs $8.", as_of=old)])
    )
    assert "currency_promise_unmet" in _kinds(health)
    assert health.unmet_promise is True
    assert health.checked_against == "2024-01-01"


def test_a_promise_of_now_resting_on_recent_prices_passes_quietly():
    recent = date(2026, 6, 1)
    health = _health(
        evidence=_evidence([_claim("c1", "Stall ceviche costs $8.", as_of=recent)])
    )
    assert "currency_promise_unmet" not in _kinds(health)
    assert health.unmet_promise is False


def test_an_article_about_an_earlier_moment_may_rest_on_old_prices():
    """The success criterion, stated as a test.

    A snapshot article uses historical facts on purpose. This is the whole
    reason the comparison is against the promise rather than against a
    universal expiry.
    """
    snapshot = _brief(
        seed="What Barranco cost before the boom",
        reader_question="How had prices changed by 2019?",
        outcome="understand what was lost",
    )
    health = _health(
        brief=snapshot,
        evidence=_evidence(
            [_claim("c1", "A menu cost $4 then.", as_of=date(2019, 5, 1))]
        ),
    )
    assert health.promises_currency is False
    assert "currency_promise_unmet" not in _kinds(health)
    assert health.unmet_promise is False


def test_the_window_is_a_property_of_the_promise_not_of_the_fact():
    """Just inside and just outside, on the same dossier.

    Nothing about the fact changes across this line. What changes is whether an
    article is entitled to say "right now" while resting on it.
    """
    inside = date(2026, 9, 7)
    boundary = date(inside.year - 1, inside.month, 1)
    fresh = _health(
        evidence=_evidence([_claim("c1", "Ceviche costs $8.", as_of=boundary)]),
        today=inside,
    )
    stale = _health(
        evidence=_evidence(
            [_claim("c1", "Ceviche costs $8.", as_of=date(2025, 8, 1))]
        ),
        today=inside,
    )
    assert CURRENCY_PROMISE_MONTHS == 12
    assert "currency_promise_unmet" not in _kinds(fresh)
    assert "currency_promise_unmet" in _kinds(stale)


# ---------------------------------------------------------------------------
# Scope, and what it refuses to say
# ---------------------------------------------------------------------------


def test_a_fact_the_operator_already_cut_is_not_this_articles_problem():
    """Reporting it would bury the one that is."""
    health = _health(
        evidence=_evidence(
            [
                _claim("c1", "Ceviche costs $8.", as_of=TODAY),
                _claim("c2", "Entry costs 30 soles.", selected=False),
            ]
        )
    )
    assert "undated_time_sensitive" not in _kinds(health)


def test_the_record_says_what_a_date_is_not_evidence_of():
    record = _health().as_record()
    assert "never whether a fact is true" in record["means"]
    assert "has been re-checked" in record["means"]


def test_a_clean_dossier_produces_nothing_to_read():
    health = _health()
    assert health.findings == []
    assert health.unmet_promise is False


def test_nothing_here_changes_the_evidence():
    """It reads records and reports. No enrichment, silent or otherwise."""
    evidence = _evidence([_claim("c1", "Ceviche costs $8.")])
    before = evidence.model_dump_json()
    _health(evidence=evidence)
    assert evidence.model_dump_json() == before
