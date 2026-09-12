"""What the cut check covered, and what it did not.

R5, R6, R7 and S1 of the verified plan of 2026-09-09. Four faults, one shape:
the review said "checked" about a pool it had not actually judged.

**R5.** Verdicts were stored by name. Two branches of one bar are two
candidates with one name; the reviewer flagged the branch inside a hotel and
the independent street bar in another district came back flagged too, with the
same sentence.

**R6.** A review was looked up by revision. A refresh replaced every venue, the
review of the new pool failed, and the old verdict answered for the new pool --
which read as checked, with nothing barred.

**R7.** The prompt truncated at 120 candidates. Nine searches at their legal
allowances reach 121, and the 121st was never shown to anyone while the pool
reported itself checked.

**S1.** A second POST that reused every search still bought a second review of
identical evidence.
"""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline import cut_review, runner, service, store
from app.features.listicle_pipeline.contracts import SearchOrder, SelectedAngle
from tests.listicle_test_support import agreed_state


@pytest.fixture
def run(isolated_db):
    state = agreed_state()
    store.save(state)
    service.create_order(state)
    return state


def _reviewer(answer=None, *, seen=None, fail_on=None):
    calls = {"n": 0}

    def review(job_id, prompt, tool_name, schema):
        calls["n"] += 1
        if seen is not None:
            seen.append(prompt)
        if fail_on is not None and calls["n"] in fail_on:
            raise TimeoutError("reviewer timed out")
        return answer or {"barred": []}

    review.calls = calls  # type: ignore[attr-defined]
    return review


def _replies(**by_marker):
    def research(prompt: str):
        for token, reply in by_marker.items():
            if token in prompt:
                return reply, [], 0
        raise AssertionError(f"unexpected prompt: {prompt[:120]}")

    return research


# R5 -- a flag belongs to a row, not to a name


def test_two_branches_with_one_name_do_not_share_a_flag(run):
    """The reproduction, end to end. Both rows are called Azul; only one is
    inside a hotel."""
    service.revise_order(run.run_id, exclusions="No bars inside hotels")
    payload = service.search(
        run.run_id,
        _replies(
            decades="Azul | Centro | inside a hotel",
            cheap="Azul | Barranco | independent street bar",
        ),
    )
    assert len(payload["candidates"]) == 2

    order = service.order(run.run_id)
    centro = next(c for c in payload["candidates"] if c["district"] == "Centro")
    service._review_candidates(
        order,
        payload,
        _reviewer(
            {
                "barred": [
                    {
                        "number": 1 if payload["candidates"][0] is centro else 2,
                        "name": "Azul",
                        "why": "Inside a hotel",
                        "confidence": "clear",
                    }
                ]
            }
        ),
    )
    after = service.progress(run.run_id)
    flagged = [c for c in after["candidates"] if c["barred"]]
    assert len(flagged) == 1
    assert flagged[0]["district"] == "Centro"


# R6 -- a review belongs to the pool it judged


def test_a_changed_pool_is_not_answered_by_the_old_review(run):
    service.revise_order(run.run_id, exclusions="No hotel bars")
    service.search(
        run.run_id,
        _replies(decades="Old Venue | Centro | standalone", cheap="Old Venue | Centro | standalone"),
        review=_reviewer(),
    )
    assert service.progress(run.run_id)["cut_checked"] is True

    def explode(*_):
        raise TimeoutError("reviewer timed out")

    refreshed = service.search(
        run.run_id,
        _replies(decades="New Venue | Norte | inside a hotel", cheap="New Venue | Norte | inside a hotel"),
        reuse=False,
        review=explode,
    )
    assert [c["name"] for c in refreshed["candidates"]] == ["New Venue"]
    assert refreshed["cut_checked"] is False
    assert refreshed["cut_review_status"] in {"not_checked", "failed"}


def test_a_pool_with_nothing_barred_is_not_a_pool_that_passed(run):
    service.revise_order(run.run_id, exclusions="")
    payload = service.search(
        run.run_id,
        _replies(decades="Canta Rana | Barranco | x", cheap="Al Toke Pez | Surquillo | y"),
        review=_reviewer(),
    )
    assert payload["cut_review_status"] == "not_needed"
    assert payload["cut_checked"] is False


# S1 -- identical evidence is judged once


def test_a_reuse_only_search_buys_no_second_review(run):
    service.revise_order(run.run_id, exclusions="no chains")
    reviewer = _reviewer()
    research = _replies(
        decades="Canta Rana | Barranco | x", cheap="Al Toke Pez | Surquillo | y"
    )
    service.search(run.run_id, research, review=reviewer)
    first = reviewer.calls["n"]
    assert first == 1

    service.search(run.run_id, research, review=reviewer)
    assert reviewer.calls["n"] == first, "identical evidence, identical cut, no new call"


def test_a_changed_cut_is_a_cache_miss(run):
    reviewer = _reviewer()
    research = _replies(
        decades="Canta Rana | Barranco | x", cheap="Al Toke Pez | Surquillo | y"
    )
    service.revise_order(run.run_id, exclusions="no chains")
    service.search(run.run_id, research, review=reviewer)
    service.revise_order(run.run_id, exclusions="no chains, no delivery-only")
    service.search(run.run_id, research, review=reviewer)
    assert reviewer.calls["n"] == 2


# R7 -- coverage is a question with an answer


def _big_order(run_id: str, count: int) -> tuple[SearchOrder, list[dict]]:
    order = SearchOrder(
        run_id=run_id,
        kind="hotels",
        place="Lima",
        target_count=200,
        exclusions="No hotel bars",
        angles=[
            SelectedAngle(angle_id=f"a{i}", text=f"Route {i}", wanted=15)
            for i in range(9)
        ],
    )
    candidates = [
        {
            "candidate_id": f"c{i:03}",
            "name": f"Venue{i:03}",
            "district": "Centro",
            "sightings": [{"evidence": "candidate"}],
        }
        for i in range(count)
    ]
    return order, candidates


def test_a_pool_larger_than_one_call_is_chunked_and_every_row_is_sent(isolated_db):
    order, candidates = _big_order("coverage", 121)
    seen: list[str] = []
    review = cut_review.review_candidates(order, candidates, _reviewer(seen=seen))

    assert len(seen) == 3, "121 rows at 60 a call is three calls, said before it runs"
    assert any("Venue120" in prompt for prompt in seen), "the last row reached a reviewer"
    assert review.status == "complete"
    assert review.covers_everything
    assert len(review.reviewed_candidate_ids) == 121


def test_a_normal_pool_is_still_one_call(isolated_db):
    order, candidates = _big_order("normal", 43)
    seen: list[str] = []
    cut_review.review_candidates(order, candidates, _reviewer(seen=seen))
    assert len(seen) == 1


def test_a_failed_chunk_leaves_a_partial_review_that_counts_itself(isolated_db):
    order, candidates = _big_order("partial", 121)
    review = cut_review.review_candidates(
        order, candidates, _reviewer(fail_on={2})
    )
    assert review.status == "partial"
    assert not review.covers_everything
    assert len(review.reviewed_candidate_ids) == 61, "60 from chunk one, 1 from chunk three"
    assert [c.index for c in review.chunks if c.state != "complete"] == [1]


def test_a_retry_buys_only_the_missing_chunk(isolated_db):
    order, candidates = _big_order("retry", 121)
    store.save_order(order)
    payload = {"candidates": candidates}

    failing = _reviewer(fail_on={2})
    service._review_candidates(order, payload, failing)
    assert failing.calls["n"] == 3
    stored = store.load_pool_review(
        order.run_id, cut_review.review_fingerprint(order, candidates)
    )
    assert stored.status == "partial"

    retry = _reviewer()
    service._review_candidates(order, payload, retry)
    assert retry.calls["n"] == 1, "one chunk was missing, so one call was bought"
    healed = store.load_pool_review(
        order.run_id, cut_review.review_fingerprint(order, candidates)
    )
    assert healed.status == "complete"
    assert healed.covers_everything

    # And a third pass buys nothing at all.
    quiet = _reviewer()
    service._review_candidates(order, payload, quiet)
    assert quiet.calls["n"] == 0


def test_a_finding_about_a_row_that_was_not_sent_fails_its_chunk(isolated_db):
    """Never quietly discarded. A chunk that reports itself complete while a
    real flag was thrown away is the falsehood this whole batch exists to
    stop."""
    order, candidates = _big_order("bogus", 10)
    review = cut_review.review_candidates(
        order,
        candidates,
        _reviewer({"barred": [{"number": 99, "name": "Venue099", "why": "x",
                               "confidence": "clear"}]}),
    )
    assert review.status == "failed"
    assert review.verdicts == []


def test_an_unjudged_row_is_marked_rather_than_left_looking_clean(run):
    """A partial review's unreviewed rows carry no flag, and the absence of a
    flag is exactly what "this place is fine" looks like."""
    service.revise_order(run.run_id, exclusions="no chains")
    payload = service.search(
        run.run_id,
        _replies(decades="Canta Rana | Barranco | x", cheap="Al Toke Pez | Surquillo | y"),
    )
    order = service.order(run.run_id)
    fingerprint = cut_review.review_fingerprint(order, payload["candidates"])
    partial = cut_review.review_candidates(order, payload["candidates"], _reviewer())
    store.save_pool_review(
        partial.model_copy(
            update={
                "status": "partial",
                "reviewed_candidate_ids": partial.expected_candidate_ids[:1],
                "fingerprint": fingerprint,
            }
        )
    )
    after = runner.assemble(order)
    assert after["cut_checked"] is False
    assert after["cut_review_status"] == "partial"
    assert [c["cut_reviewed"] for c in after["candidates"]] == [True, False]
