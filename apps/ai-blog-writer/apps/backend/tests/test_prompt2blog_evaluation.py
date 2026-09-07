"""What the comparison set must not let a candidate get away with.

The evaluation machinery exists to stop one flattering run being read as an
improvement, so the tests that matter are the ones about refusing to conclude:
a sheet that cannot leak which version wrote which draft, a criterion that
never gets added to another criterion, and a verdict that says "not enough
evidence" when that is the truth.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.features.prompt2blog.contracts_v4 import (
    Prompt2BlogModelRouting,
    Prompt2BlogV4Request,
)
from app.features.prompt2blog.evaluation import (
    DIRECTION_MIN_FIXTURES,
    SCORE_CRITERIA,
    SPARSE_CLAIM_COUNT,
    ComparisonKey,
    EntryScore,
    EvalFixture,
    EvalStore,
    EvalVariant,
    ScoreSheet,
    blind_comparison,
    capture_fixture,
    coverage_report,
    fixture_traits,
    measurement_summary,
    run_sample,
    unblind,
)
from app.features.prompt2blog.selection_v4 import selection_from_flags

FIXTURE_PATH = (
    Path(__file__).parents[3]
    / "data"
    / "fixtures"
    / "prompt2blog"
    / "lima-scope-drift-v4.json"
)


def _payload() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def _request(**overrides) -> Prompt2BlogV4Request:
    raw = _payload()
    payload = {
        "schema_version": 4,
        "brief": raw["brief"],
        "work_order": raw["work_order"],
        "evidence_package": raw["evidence_package"],
        "profiles": {"length_id": "medium", "creativity_level": "medium"},
    }
    payload.update(overrides)
    return Prompt2BlogV4Request.model_validate(payload)


def _fixture(fixture_id: str = "lima", **overrides) -> EvalFixture:
    request = overrides.pop("request", None) or _request()
    selection = selection_from_flags(
        request.brief,
        request.work_order,
        request.evidence_package,
        target_word_count=900,
        note="test fixture",
    )
    return capture_fixture(
        "run-0001",
        fixture_id=fixture_id,
        label=overrides.pop("label", "Lima layover"),
        request=request,
        selection=selection,
        clock=lambda: "2026-09-06T00:00:00+00:00",
        **overrides,
    )


def _artifact(**overrides) -> dict:
    payload = {
        "improved_article": {"title": "Two extra nights", "content": "body"},
        "final_markdown": "# Two extra nights\n\nthree words here",
        "run_cost": {"calls": 8, "total_tokens": 90_000, "billed_cost_usd": 0.41},
        "readiness_blockers": [],
        "repair_outcome": "repaired",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Fixtures describe themselves
# ---------------------------------------------------------------------------


def test_traits_are_read_off_the_inputs_not_typed_by_hand():
    request = _request()
    traits = fixture_traits(
        request.brief, request.work_order, request.evidence_package
    )
    # Properties of the stored file, not of anything this test arranged: the
    # Lima dossier is well under the sparse line, its claims are dated, and one
    # of its requirements never settled.
    assert "sparse_research" in traits
    assert "dated_facts" in traits
    assert "unsettled_requirement" in traits
    assert len(request.evidence_package.claims) < SPARSE_CLAIM_COUNT


def test_first_hand_material_is_a_trait_of_the_brief():
    raw = _payload()
    assert not raw["brief"].get("material")
    plain = _request()
    assert "first_hand_material" not in fixture_traits(
        plain.brief, plain.work_order, plain.evidence_package
    )

    raw["brief"]["material"] = [
        {"kind": "firsthand", "statement": "I waited 45 minutes on my visit"}
    ]
    witnessed = _request(brief=raw["brief"])
    # The one the grounding checker used to call invented. A comparison set
    # with none of these has said nothing about the case that broke.
    assert "first_hand_material" in fixture_traits(
        witnessed.brief, witnessed.work_order, witnessed.evidence_package
    )


def test_a_dossier_with_no_dates_does_not_claim_dated_facts():
    raw = _payload()
    for claim in raw["evidence_package"]["claims"]:
        claim.pop("as_of", None)
    request = _request(evidence_package=raw["evidence_package"])
    assert "dated_facts" not in fixture_traits(
        request.brief, request.work_order, request.evidence_package
    )


def test_coverage_names_what_the_set_cannot_speak_for():
    report = coverage_report([_fixture()])
    # The point of the report is the gap, not the tally. A set with no
    # conflicting evidence in it has said nothing about conflicting evidence,
    # and this is where that becomes visible before a candidate is judged.
    assert "declared_conflict" in report["traits_missing"]
    assert report["covers_every_trait"] is False


def test_a_fixture_round_trips_through_the_store(tmp_path):
    store = EvalStore(tmp_path)
    store.save_fixture(_fixture())
    restored = store.fixture("lima")
    assert restored.request.brief.brief_fingerprint == (
        _request().brief.brief_fingerprint
    )
    assert restored.selection_record.selected_claim_ids()


# ---------------------------------------------------------------------------
# A variant changes the candidate, never the control
# ---------------------------------------------------------------------------


def test_applying_a_variant_leaves_the_fixture_untouched():
    fixture = _fixture()
    variant = EvalVariant(
        variant_id="candidate",
        label="opus writer",
        model_routing=Prompt2BlogModelRouting(writing_model="claude-opus-5"),
        creativity_level="high",
    )
    applied = variant.apply(fixture.request)

    assert applied.model_routing.writing_model == "claude-opus-5"
    assert applied.profiles.creativity_level == "high"
    # The fixture on disk is the only reason two samples can be said to share
    # inputs. If applying a variant edited it, the second variant would be run
    # against the first one's request.
    assert fixture.request.model_routing.writing_model is None
    assert fixture.request.profiles.creativity_level == "medium"


def test_a_variant_that_says_nothing_about_creativity_keeps_the_fixtures():
    fixture = _fixture()
    applied = EvalVariant(variant_id="baseline", label="main").apply(fixture.request)
    assert applied.profiles.creativity_level == "medium"


# ---------------------------------------------------------------------------
# Buying a draft
# ---------------------------------------------------------------------------


def test_a_sample_copies_the_runs_own_receipt():
    fixture = _fixture()
    variant = EvalVariant(variant_id="baseline", label="main")
    sample = run_sample(
        fixture,
        variant,
        executor=lambda **_: _artifact(),
        revision=("abc123", False),
    )
    assert sample.status == "completed"
    assert sample.measurements.billed_cost_usd == 0.41
    assert sample.measurements.calls == 8
    # Counted off the article, not off the outline's budget: what a draft cost
    # and how long it is are facts about the draft.
    assert sample.measurements.word_count == 7
    assert sample.run_id.startswith("eval-")


def test_a_variant_that_cannot_write_is_recorded_rather_than_lost():
    def explode(**_):
        raise RuntimeError("provider refused")

    sample = run_sample(
        _fixture(),
        EvalVariant(variant_id="candidate", label="opus"),
        executor=explode,
        revision=("abc123", False),
    )
    # Dropping it would silently turn the comparison into "the fixtures this
    # candidate survived", which is the flattering version of the question.
    assert sample.status == "failed"
    assert "provider refused" in sample.error
    assert sample.markdown == ""


def test_a_dirty_tree_is_recorded_because_it_is_not_reproducible():
    sample = run_sample(
        _fixture(),
        EvalVariant(variant_id="baseline", label="main"),
        executor=lambda **_: _artifact(),
        revision=("abc123", True),
    )
    assert sample.code_revision == "abc123"
    assert sample.code_dirty is True


# ---------------------------------------------------------------------------
# The reader cannot see who wrote what
# ---------------------------------------------------------------------------


def _samples(fixture: EvalFixture, *variant_ids: str) -> list:
    return [
        run_sample(
            fixture,
            EvalVariant(variant_id=variant_id, label=variant_id),
            # Deliberately neutral prose. A draft that names its own variant
            # would make the blinding assertions below pass for the wrong
            # reason -- and would not be blind in real use either.
            executor=lambda **_: _artifact(
                improved_article={"title": "A layover worth taking", "content": "x"},
                final_markdown="Two nights, and what they buy you.",
            ),
            revision=("abc123", False),
        )
        for variant_id in variant_ids
    ]


def test_the_sheet_carries_no_trace_of_which_variant_wrote_which_draft():
    fixture = _fixture()
    samples = _samples(fixture, "baseline", "candidate")
    sheet, key = blind_comparison(fixture, samples, rng=random.Random(7))

    serialized = json.dumps(sheet.model_dump(mode="json"))
    # Not "the field is absent" but "the string does not occur", because a
    # reader opens the file. A variant id in a note or a title would blind
    # nothing.
    assert "baseline" not in serialized
    assert "candidate" not in serialized
    assert set(key.mapping) == {"A", "B"}
    assert set(key.mapping.values()) == {sample.sample_id for sample in samples}


def test_the_letters_are_shuffled_so_a_reader_cannot_learn_the_order():
    fixture = _fixture()
    samples = _samples(fixture, "baseline", "candidate")
    orders = {
        tuple(
            blind_comparison(fixture, samples, rng=random.Random(seed))[1].mapping[
                letter
            ]
            for letter in ("A", "B")
        )
        for seed in range(12)
    }
    assert len(orders) == 2


def test_a_failed_draft_still_gets_a_letter():
    fixture = _fixture()
    good = _samples(fixture, "baseline")[0]
    bad = run_sample(
        fixture,
        EvalVariant(variant_id="candidate", label="c"),
        executor=lambda **_: (_ for _ in ()).throw(RuntimeError("nope")),
        revision=("abc123", False),
    )
    sheet, _ = blind_comparison(fixture, [good, bad], rng=random.Random(1))
    assert {entry.status for entry in sheet.entries} == {"completed", "failed"}


def test_one_draft_is_not_a_comparison():
    fixture = _fixture()
    with pytest.raises(ValueError, match="at least two"):
        blind_comparison(fixture, _samples(fixture, "baseline"))


def test_drafts_from_different_fixtures_cannot_be_compared():
    first = _fixture("lima")
    second = _fixture("bogota")
    mixed = _samples(first, "baseline") + _samples(second, "candidate")
    with pytest.raises(ValueError, match="one fixture"):
        blind_comparison(first, mixed)


def test_the_key_is_stored_apart_from_the_sheet(tmp_path):
    fixture = _fixture()
    store = EvalStore(tmp_path)
    sheet, key = blind_comparison(
        fixture, _samples(fixture, "baseline", "candidate"), rng=random.Random(3)
    )
    sheet_path, key_path = store.save_comparison(sheet, key)
    # Two files, two directories. A single file with the answer inside it is
    # blind only until somebody scrolls.
    assert sheet_path.parent != key_path.parent
    assert "baseline" not in sheet_path.read_text()


# ---------------------------------------------------------------------------
# Scoring refuses the shapes that would hide a trade
# ---------------------------------------------------------------------------


def test_a_criterion_nobody_defined_is_refused():
    with pytest.raises(ValidationError):
        EntryScore(
            display_label="A",
            scores=[{"criterion": "vibes", "value": 5}],
        )


def test_a_criterion_cannot_be_scored_twice_for_one_draft():
    with pytest.raises(ValidationError):
        EntryScore(
            display_label="A",
            scores=[
                {"criterion": "voice", "value": 5},
                {"criterion": "voice", "value": 2},
            ],
        )


def test_a_score_outside_the_scale_is_refused():
    with pytest.raises(ValidationError):
        EntryScore(display_label="A", scores=[{"criterion": "voice", "value": 9}])


# ---------------------------------------------------------------------------
# What a result is entitled to say
# ---------------------------------------------------------------------------


def _scored(
    fixture_ids: list[str],
    winner: dict[str, str],
    *,
    criteria: tuple[str, ...] = SCORE_CRITERIA,
):
    """One comparison per fixture, with `winner` naming who leads each one."""
    sheets: list[ScoreSheet] = []
    keys: list[ComparisonKey] = []
    samples: list = []
    for fixture_id in fixture_ids:
        fixture = _fixture(fixture_id)
        pair = _samples(fixture, "baseline", "candidate")
        samples.extend(pair)
        sheet, key = blind_comparison(
            fixture, pair, comparison_id=f"cmp-{fixture_id}", rng=random.Random(0)
        )
        keys.append(key)
        by_variant = {sample.variant_id: sample.sample_id for sample in pair}
        ahead = winner[fixture_id]
        entries = []
        for letter, sample_id in key.mapping.items():
            leading = sample_id == by_variant[ahead]
            entries.append(
                EntryScore(
                    display_label=letter,
                    scores=[
                        {"criterion": name, "value": 5 if leading else 3}
                        for name in criteria
                    ],
                )
            )
        sheets.append(
            ScoreSheet(
                comparison_id=sheet.comparison_id,
                reviewer="alan",
                created_at="2026-09-06T00:00:00+00:00",
                entries=entries,
            )
        )
    return sheets, keys, samples


def test_two_fixtures_are_not_enough_to_report_a_direction():
    sheets, keys, samples = _scored(
        ["lima", "bogota"], {"lima": "candidate", "bogota": "candidate"}
    )
    result = unblind(sheets, keys, samples)
    assert result["verdict"]["decision"] == "not enough evidence"
    assert str(DIRECTION_MIN_FIXTURES) in result["verdict"]["reason"]


def test_one_fixture_the_candidate_loses_withdraws_the_claim():
    sheets, keys, samples = _scored(
        ["lima", "bogota", "quito"],
        {"lima": "candidate", "bogota": "candidate", "quito": "baseline"},
    )
    result = unblind(sheets, keys, samples)
    # A change that helps two articles and hurts one has not been shown to be
    # safe, however good the average looks.
    assert result["verdict"]["decision"] == "no direction"
    assert all(row["reportable_direction"] is False for row in result["criteria"])


def test_a_consistent_lead_across_enough_fixtures_is_reported():
    sheets, keys, samples = _scored(
        ["lima", "bogota", "quito"],
        {"lima": "candidate", "bogota": "candidate", "quito": "candidate"},
    )
    result = unblind(sheets, keys, samples)
    assert result["verdict"]["decision"] == "direction found"
    assert result["verdict"]["leaders"] == ["candidate"]


def test_the_report_never_produces_one_number():
    sheets, keys, samples = _scored(
        ["lima", "bogota", "quito"],
        {"lima": "candidate", "bogota": "candidate", "quito": "candidate"},
    )
    result = unblind(sheets, keys, samples)
    reported = {row["criterion"] for row in result["criteria"]}
    assert reported == set(SCORE_CRITERIA)
    # The whole reason the criteria stay apart is that a candidate can buy
    # usefulness with unsupported additions. Nothing anywhere in the result may
    # offer a total that prices that as a win.
    serialized = json.dumps(result, default=str)
    for banned in ("overall", "total_score", "composite", "combined_score"):
        assert banned not in serialized


def test_a_sheet_whose_key_is_missing_is_named_not_ignored():
    sheets, keys, samples = _scored(["lima"], {"lima": "candidate"})
    result = unblind(sheets, [], samples)
    # Dropping it would quietly shrink the evidence while the report still read
    # as if every comparison had been counted.
    assert result["unresolved"] == ["cmp-lima"]
    assert result["criteria"] == []


def test_the_factual_footing_criteria_are_named_in_the_verdict():
    sheets, keys, samples = _scored(
        ["lima", "bogota", "quito"],
        {"lima": "candidate", "bogota": "candidate", "quito": "candidate"},
        criteria=("usefulness", "unsupported_additions", "caveat_retention"),
    )
    verdict = unblind(sheets, keys, samples)["verdict"]
    assert set(verdict["factual_footing_criteria"]) == {
        "unsupported_additions",
        "caveat_retention",
    }


# ---------------------------------------------------------------------------
# Measurements stay measurements
# ---------------------------------------------------------------------------


def test_failures_and_unready_drafts_are_counted_separately():
    fixture = _fixture()
    good = _samples(fixture, "candidate")[0]
    unready = run_sample(
        fixture,
        EvalVariant(variant_id="candidate", label="c"),
        executor=lambda **_: _artifact(readiness_blockers=["a claim is unchecked"]),
        revision=("abc123", False),
    )
    failed = run_sample(
        fixture,
        EvalVariant(variant_id="candidate", label="c"),
        executor=lambda **_: (_ for _ in ()).throw(RuntimeError("nope")),
        revision=("abc123", False),
    )
    summary = measurement_summary([good, unready, failed])["candidate"]
    assert summary["samples"] == 3
    assert summary["completed"] == 2
    assert summary["failed"] == 1
    assert summary["samples_with_readiness_blockers"] == 1
    # A draft that never existed must not drag the average cost of the drafts
    # that did.
    assert summary["mean_billed_cost_usd"] == 0.41
