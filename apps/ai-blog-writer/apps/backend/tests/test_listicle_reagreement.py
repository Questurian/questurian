"""Saying it again changes the order, and only what was said again.

R1 of the verified plan of 2026-09-09. The version this replaces returned the
existing order unconditionally the moment an interview agreed, so a run that
reopened, discussed the count and settled on twenty went on storing forty --
and every screen showed forty, because the order is what every screen reads.

The fix is not "rebuild the order from the transcript". That undoes every
direct correction the operator made, which is the same fault one layer up. A
re-agreement is resolved field by field against what the interview had settled
last time: a field it changed its mind about wins, a field it did not is left
exactly as the order has it.
"""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline import service, spec, store
from tests.listicle_test_support import agreed_state, turn


@pytest.fixture
def run(isolated_db):
    state = agreed_state()
    store.save(state)
    service.create_order(state)
    return state


def _said_again(state, *extra):
    """The same interview, with more turns on the end."""
    updated = state.model_copy(update={"turns": [*state.turns, *extra]})
    store.save(updated)
    return updated


def test_a_changed_count_reaches_the_order(run):
    assert service.order(run.run_id).target_count == 20
    later = _said_again(run, turn("count", "40", recommendation="20"))

    revised = service.reagree_order(later)
    assert revised.target_count == 40
    assert revised.revision == 2
    assert service.order(run.run_id).target_count == 40, "and a read keeps it"


def test_a_re_agreement_that_says_nothing_new_saves_no_revision(run):
    before = service.order(run.run_id)
    same = _said_again(run)
    after = service.reagree_order(same)
    assert after.revision == before.revision
    assert store.load_order(run.run_id).revision == before.revision


def test_a_direct_correction_survives_a_count_only_re_agreement(run):
    """The operator typed a cut into the order directly. The interview then
    re-agrees about something else entirely, and their edit is still there."""
    service.revise_order(run.run_id, exclusions="no hotel restaurants")
    later = _said_again(run, turn("count", "12", recommendation="20"))

    revised = service.reagree_order(later)
    assert revised.target_count == 12
    assert revised.exclusions == "no hotel restaurants"


def test_a_later_interview_answer_supersedes_a_direct_correction_visibly(run):
    """When the two really do disagree, the explicit later answer wins -- and
    the override is on the screen rather than silent."""
    service.revise_order(run.run_id, exclusions="no hotel restaurants")
    later = _said_again(run, turn("cut", "no chains, no delivery-only, no hotel bars"))

    revised = service.reagree_order(later)
    assert "hotel bars" in revised.exclusions
    assert any("correct" in note.lower() or "check it" in note for note in revised.answer_notes)


def test_an_unchanged_angle_keeps_its_id_and_a_new_one_does_not_take_it(run):
    before = service.order(run.run_id)
    kept = before.angles[0]
    later = _said_again(
        run,
        turn(
            "angles",
            f"{kept.text}\nrooftop cevicherias with a view",
        ),
    )

    revised = service.reagree_order(later)
    ids = {angle.text: angle.angle_id for angle in revised.angles}
    assert ids[kept.text] == kept.angle_id, "the same search is the same search"
    fresh = ids["rooftop cevicherias with a view"]
    assert fresh not in {angle.angle_id for angle in before.angles}


def test_a_re_agreement_cannot_race_a_batch_that_is_spending(run):
    token = store.claim_batch(run.run_id, 1)
    assert token
    later = _said_again(run, turn("count", "40", recommendation="20"))
    with pytest.raises(store.RevisionConflict):
        service.reagree_order(later)
    store.release_batch(run.run_id, token)


# Corrections written against a version that has moved


def test_a_stale_correction_is_refused_with_the_revision_that_won(run):
    service.revise_order(run.run_id, target_count=30)
    with pytest.raises(store.RevisionConflict) as caught:
        service.revise_order(run.run_id, target_count=25, expected_revision=1)
    assert caught.value.current_revision == 2
    assert service.order(run.run_id).target_count == 30


def test_a_correction_against_the_current_revision_is_applied(run):
    revised = service.revise_order(run.run_id, target_count=30, expected_revision=1)
    assert revised.target_count == 30
    assert revised.revision == 2


def test_a_correction_that_corrects_nothing_saves_no_revision(run):
    before = service.order(run.run_id)
    after = service.revise_order(run.run_id, target_count=before.target_count)
    assert after.revision == before.revision
    assert store.next_revision(run.run_id) == before.revision + 1


def test_two_corrections_cannot_share_a_revision(run):
    import threading

    order = service.order(run.run_id)
    ready = threading.Barrier(2)
    seen: list[int] = []

    def correct(target: int) -> None:
        ready.wait(timeout=10)
        try:
            seen.append(service.revise_order(run.run_id, target_count=target).revision)
        except store.RevisionConflict:  # pragma: no cover -- either order is fine
            pass

    threads = [threading.Thread(target=correct, args=(n,)) for n in (30, 31)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)

    assert len(seen) == len(set(seen)), f"two corrections shared a revision: {seen}"
    assert order.revision not in seen


# A read is a read


def test_reading_the_order_never_rebuilds_it(run):
    service.revise_order(run.run_id, target_count=7)
    for _ in range(3):
        assert service.order(run.run_id).target_count == 7
    assert store.load_order(run.run_id).revision == 2


def test_the_baseline_is_what_the_interview_had_settled(run):
    baseline = store.load_baseline(run.run_id)
    assert baseline is not None
    assert baseline.target_count == 20
    assert baseline.angles == [a.text for a in service.order(run.run_id).angles]
    assert baseline == baseline.model_copy(
        update={
            **spec.resolve_interview(run, store.load_selections(run.run_id))
            .model_dump(exclude={"revision", "taken_at"}),
        }
    )
