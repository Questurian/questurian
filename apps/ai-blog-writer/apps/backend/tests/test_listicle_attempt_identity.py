"""Work that has been paid for survives the next thing that goes wrong.

Every case here is one of the ten reproductions from the verified plan of
2026-09-09, turned into a regression. They prove state and accounting
invariants -- not that any place on any list is worth writing about.

The three in this file are the ones about identity and ownership:

**R2.** A refresh that fails must not destroy the result it was meant to
replace. The storage this replaced was keyed by angle and revision, so a second
search of one angle was an UPDATE of the first: two candidates before an
injected timeout, zero after, and one row left in the database where two
searches had happened.

**R3.** Two callers must not both own one batch. The claim read the lock on a
deferred connection, decided nobody held it, and then wrote -- so two readers
that interleaved both won.

**R10.** A reused result is a reference, not a second execution. Re-filing it
under each new revision made one paid search read as "30 rows and 30 places
nothing else found" when it had returned ten.
"""

from __future__ import annotations

import threading

import pytest

from app.features.listicle_pipeline import runner, service, store
from tests.listicle_test_support import agreed_state


@pytest.fixture
def run(isolated_db):
    state = agreed_state()
    store.save(state)
    return state


def _replies(**by_marker):
    def research(prompt: str):
        for token, reply in by_marker.items():
            if token in prompt:
                if isinstance(reply, Exception):
                    raise reply
                return reply, ["https://example.test"], 10
        raise AssertionError(f"unexpected prompt: {prompt[:120]}")

    return research


# R2 -- a failed refresh keeps the work it failed to replace


def test_a_failed_refresh_keeps_the_result_it_could_not_replace(run):
    good = service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | open since the 1980s",
            cheap="Al Toke Pez | Surquillo | counter seating",
        ),
    )
    assert good["found"] == 2

    after = service.search(
        run.run_id,
        _replies(
            decades=TimeoutError("read timed out"),
            cheap=TimeoutError("read timed out"),
        ),
        reuse=False,
    )

    assert after["found"] == 2, "the places that were paid for are still there"
    attempts = store.load_attempts(run.run_id)
    assert len(attempts) == 4, "two searches, twice, is four attempts"
    assert sum(a.state == "completed" for a in attempts) == 2
    assert sum(a.state == "failed" for a in attempts) == 2

    row = after["angles"][0]
    assert row["showing_earlier"] is True
    assert row["latest_state"] == "failed"
    assert "refresh failed" in row["reason"]
    assert row["gathered_at"], "the screen can say when the standing work was done"
    assert after["failed_refreshes"], "a complete list can still have a failure in it"


def test_a_refresh_that_finds_nothing_is_a_real_result(run):
    """An empty answer is a finding about the angle. It becomes current, and
    the earlier attempt stays retrievable rather than being substituted for
    it."""
    service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | open since the 1980s",
            cheap="Al Toke Pez | Surquillo | counter seating",
        ),
    )
    after = service.search(
        run.run_id,
        _replies(decades="nothing published", cheap="nothing published"),
        reuse=False,
    )

    assert after["found"] == 0
    assert not after["failed_refreshes"]
    assert all(row["showing_earlier"] is False for row in after["angles"])
    completed = [a for a in store.load_attempts(run.run_id) if a.state == "completed"]
    assert len(completed) == 4, "the earlier successful attempts still exist"


def test_a_terminal_attempt_cannot_be_rewritten(run):
    from app.features.listicle_pipeline.contracts import SearchAttempt

    finished = SearchAttempt(
        run_id=run.run_id,
        angle_id="a1",
        state="completed",
        rows=3,
        finished_at="2026-09-09T00:00:00+00:00",
    )
    store.save_attempt(finished)
    with pytest.raises(ValueError, match="already finished"):
        store.save_attempt(finished.model_copy(update={"state": "failed", "rows": 0}))
    assert store.load_attempt(finished.attempt_id).rows == 3


def test_an_invocation_records_every_request_that_reached_the_provider(run):
    """One search is not one billable call. The runner retries, and a request
    whose answer never arrived may still have been charged for."""
    service.search(
        run.run_id,
        _replies(
            decades=TimeoutError("read timed out"),
            cheap="Al Toke Pez | Surquillo | counter seating",
        ),
    )
    attempts = {a.angle_id: a for a in store.load_attempts(run.run_id)}
    failed = next(a for a in attempts.values() if a.state == "failed")
    answered = next(a for a in attempts.values() if a.state == "completed")
    assert len(failed.provider_calls) == 3, "three requests were put to the provider"
    assert {c.outcome for c in failed.provider_calls} == {"failed"}
    assert len(answered.provider_calls) == 1


# R3 -- one batch, one owner


def test_two_simultaneous_starts_produce_one_owner(run):
    """Forced to interleave. The claim now reads, checks and writes inside one
    immediate transaction, so the second caller reads what the first wrote."""
    claimed: list[str] = []
    barrier = threading.Barrier(2)

    def claim() -> None:
        barrier.wait(timeout=10)
        claimed.append(store.claim_batch(run.run_id, 1))

    threads = [threading.Thread(target=claim) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)

    assert sum(1 for token in claimed if token) == 1, claimed


def test_a_lost_lease_cannot_release_or_publish_over_its_successor(run):
    first = store.claim_batch(run.run_id, 1)
    assert first
    store.release_batch(run.run_id, first)
    second = store.claim_batch(run.run_id, 1)
    assert second and second != first

    # The old owner tries to tidy up after the new one. It changes nothing.
    store.release_batch(run.run_id, first)
    assert store.holds_batch(run.run_id, second)
    assert not store.holds_batch(run.run_id, first)


def test_a_batch_that_lost_its_lease_stops_before_it_spends(run):
    token = store.claim_batch(run.run_id, 1)
    order = service.order(run.run_id)
    store.release_batch(run.run_id, token)
    store.claim_batch(run.run_id, 1)

    bought: list[str] = []

    def research(prompt: str):
        bought.append(prompt)
        return "Canta Rana | Barranco | x", [], 0

    with pytest.raises(runner.LeaseLost):
        runner.run_order(order, research, owner_token=token)
    assert bought == [], "nothing was bought on a run this batch no longer owns"


def test_a_running_batch_renews_past_its_original_window(run):
    token = store.claim_batch(run.run_id, 1)
    assert store.renew_batch(run.run_id, token)
    assert not store.renew_batch(run.run_id, "not-the-owner")


# R10 -- a reference is not a second execution


def test_one_execution_reused_across_revisions_is_counted_once(run):
    """A revision that arrives back at the request an earlier one made reuses
    that work, and the reuse is a reference. Re-filing it under each revision
    is what made one paid search read as three."""
    calls: list[str] = []

    def research(prompt: str):
        calls.append(prompt)
        rows = "\n".join(f"Place {i} | Centro | candidate" for i in range(10))
        return rows, [], 0

    service.search(run.run_id, research)
    executions = len(calls)
    assert executions == 2

    original = service.order(run.run_id).exclusions
    service.revise_order(run.run_id, exclusions="no chains either")
    service.revise_order(run.run_id, exclusions=original)
    service.search(run.run_id, research)

    assert len(calls) == executions, "the request came back, so the work did too"
    assert all(row["reused"] for row in service.progress(run.run_id)["angles"])

    second = agreed_state(run_id="run0002")
    store.save(second)
    order = service.order("run0002")
    notes = runner.prior_contribution(order)
    assert notes, "the earlier run is readable before this one is paid for"
    for note in notes.values():
        assert "30 rows" not in note
        assert "10 rows" in note


def test_two_angles_with_the_same_wording_stay_distinguishable(run):
    """Identical text under different ids is two searches, and collapsing them
    would report one search's coverage as two."""
    order = service.order(run.run_id)
    same = order.angles[0].text
    service.revise_order(
        run.run_id,
        angles=[
            {"angle_id": "a1", "text": same, "shape_key": "", "role": "broad"},
            {"angle_id": "a2", "text": same, "shape_key": "", "role": "broad"},
        ],
    )
    service.search(run.run_id, lambda _: ("Canta Rana | Barranco | x", [], 0))
    snapshot = store.latest_pool_snapshots(
        runner.subject_of(service.order(run.run_id)), exclude_run=""
    )
    assert snapshot
    ids = {entry.angle_id for entry in snapshot[0].contributions}
    assert ids == {"a1", "a2"}
