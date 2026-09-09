"""Searching once, and recovering precisely from the half that failed.

The version this replaced ran six searches inside one request and stored what
came back as one blob. A failure on the sixth threw away the five that had
worked, a reload could not tell "not run yet" from "not read yet", and a re-run
replaced the last good version before the new one had finished.
"""

from __future__ import annotations

import pytest

from app.features.listicle_pipeline import service, store
from tests.listicle_test_support import agreed_state


@pytest.fixture
def run(isolated_db):
    state = agreed_state()
    store.save(state)
    return state


def _replies(**by_marker):
    """A research stub keyed on a word only one angle's prompt contains."""

    def research(prompt: str):
        for token, reply in by_marker.items():
            if token in prompt:
                if isinstance(reply, Exception):
                    raise reply
                return reply, ["https://example.test"], 10
        raise AssertionError(f"unexpected prompt: {prompt[:120]}")

    return research


def test_a_failure_on_one_angle_keeps_every_other_angles_work(run):
    research = _replies(
        decades="Canta Rana | Barranco | open since the 1980s",
        cheap=TimeoutError("read timed out"),
    )
    payload = service.search(run.run_id, research)

    states = {row["angle"]: row["state"] for row in payload["angles"]}
    assert states["cevicherias open for decades"] == "completed"
    assert states["very cheap cevicherias people rate highly"] == "failed"
    assert [c["name"] for c in payload["candidates"]] == ["Canta Rana"]


def test_retrying_one_angle_runs_only_that_angle(run):
    service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | open since the 1980s",
            cheap=TimeoutError("read timed out"),
        ),
    )

    asked: list[str] = []

    def research(prompt: str):
        asked.append(prompt)
        return "Al Toke Pez | Surquillo | counter", [], 5

    order = service.order(run.run_id)
    failed = [a.angle_id for a in order.angles if "cheap" in a.text]
    payload = service.search(run.run_id, research, only=failed)

    assert len(asked) == 1
    assert "cheap" in asked[0]
    # And the angle that already worked is still there, not re-run and not
    # thrown away.
    assert {c["name"] for c in payload["candidates"]} == {"Canta Rana", "Al Toke Pez"}


def test_reopening_a_run_reads_the_results_rather_than_searching_again(run):
    service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | since the 1980s",
            cheap="Al Toke Pez | Surquillo | counter",
        ),
    )
    again = service.progress(run.run_id)
    assert again["found"] == 2
    assert again["complete"] is True


def test_an_unrun_order_reports_nothing_rather_than_an_empty_result(run):
    assert service.progress(run.run_id) is None


def test_a_second_start_on_a_running_order_is_refused(run):
    store.claim_batch(run.run_id, 1)
    with pytest.raises(ValueError, match="already running"):
        service.search(run.run_id, _replies(decades="x | y | z"))


def test_the_lock_is_released_even_when_the_batch_raises(run):
    def research(prompt: str):
        raise RuntimeError("the whole batch fell over")

    # Every angle failing is not an exception -- a failed search is a recorded
    # fact -- so the lock has to be released on the ordinary path too.
    service.search(run.run_id, research)
    assert store.batch_is_running(run.run_id) is False


def test_stored_work_is_reused_when_the_request_has_not_changed(run):
    service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | since the 1980s",
            cheap="Al Toke Pez | Surquillo | counter",
        ),
    )

    def refuse(prompt: str):
        raise AssertionError("nothing should have been searched again")

    payload = service.search(run.run_id, refuse)
    assert payload["found"] == 2


def test_changing_the_wording_invalidates_that_angles_stored_result(run):
    service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | since the 1980s",
            cheap="Al Toke Pez | Surquillo | counter",
        ),
    )
    order = service.order(run.run_id)
    edited = [
        {"angle_id": a.angle_id, "text": a.text, "shape_key": a.shape_key, "role": a.role}
        for a in order.angles
    ]
    edited[0]["text"] = "cevicherias open for decades in Callao"
    service.revise_order(run.run_id, angles=edited)

    asked: list[str] = []

    def research(prompt: str):
        asked.append(prompt)
        return "Rovira | Callao | since 1907", [], 3

    service.search(run.run_id, research)
    assert len(asked) == 1
    assert "Callao" in asked[0]


def test_a_count_that_changes_what_each_search_asks_for_invalidates_reuse(run):
    """The count decides how many each search asks for, so a correction that
    changes the ask is a different request of every angle -- not the same
    answers relabelled."""
    service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | since the 1980s",
            cheap="Al Toke Pez | Surquillo | counter",
        ),
    )
    before = service.order(run.run_id)
    revised = service.revise_order(run.run_id, target_count=6)
    assert [a.wanted for a in revised.angles] != [a.wanted for a in before.angles]

    asked: list[str] = []

    def research(prompt: str):
        asked.append(prompt)
        return "Canta Rana | Barranco | since the 1980s", [], 3

    service.search(run.run_id, research)
    assert len(asked) == 2


def test_a_correction_that_changes_no_request_does_not_re_buy_the_research(run):
    """Reuse is decided by the request, not by the revision number. Both these
    orders ask each search for the same fifteen places, so the stored answers
    are still answers to the questions being asked -- and re-running them would
    spend money to learn nothing."""
    service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | since the 1980s",
            cheap="Al Toke Pez | Surquillo | counter",
        ),
    )
    before = service.order(run.run_id)
    revised = service.revise_order(run.run_id, target_count=60)
    assert [a.wanted for a in revised.angles] == [a.wanted for a in before.angles]

    def refuse(prompt: str):
        raise AssertionError("nothing should have been searched again")

    payload = service.search(run.run_id, refuse)
    assert payload["found"] == 2
    assert payload["target"] == 60


def test_a_stale_result_never_appears_as_the_current_revisions(run):
    service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | since the 1980s",
            cheap="Al Toke Pez | Surquillo | counter",
        ),
    )
    order = service.order(run.run_id)
    edited = [
        {"angle_id": a.angle_id, "text": a.text, "shape_key": a.shape_key, "role": a.role}
        for a in order.angles
    ]
    edited[0]["text"] = "cevicherias open for decades in Callao"
    revised = service.revise_order(run.run_id, angles=edited)

    view = service.progress(run.run_id)
    assert view["revision"] == revised.revision
    rows = {row["angle"]: row for row in view["angles"]}
    assert rows["cevicherias open for decades in Callao"]["state"] == "not_started"
    # The angle that did not change keeps its result, and says when it was
    # gathered rather than implying it was gathered now.
    kept = rows["very cheap cevicherias people rate highly"]
    assert kept["state"] == "completed"
    assert kept["gathered_at"]


def test_a_full_refresh_is_a_deliberate_action_and_re_runs_everything(run):
    service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | since the 1980s",
            cheap="Al Toke Pez | Surquillo | counter",
        ),
    )
    asked: list[str] = []

    def research(prompt: str):
        asked.append(prompt)
        return "Canta Rana | Barranco | since the 1980s", [], 3

    service.search(run.run_id, research, reuse=False)
    assert len(asked) == 2


def test_an_interrupted_attempt_is_not_reported_as_a_failure(run):
    """Nobody knows whether the provider answered, and retrying may be charged
    a second time. Saying "failed" implies a certainty nothing here has."""
    from app.features.listicle_pipeline.contracts import SearchAttempt

    order = service.order(run.run_id)
    store.save_attempt(
        SearchAttempt(
            run_id=run.run_id,
            revision=order.revision,
            angle_id=order.angles[0].angle_id,
            angle_text=order.angles[0].text,
            state="running",
            started_at="2026-09-08T00:00:00+00:00",
        )
    )
    view = service.progress(run.run_id)
    row = next(r for r in view["angles"] if r["angle_id"] == order.angles[0].angle_id)
    assert row["state"] == "interrupted"
    assert "charged again" in row["reason"]
    assert "failed" not in row["reason"]


def test_an_unagreed_interview_refuses_to_search(isolated_db):
    from app.features.prompt2blog.contracts_v4 import GrillQuestion, GrillState
    from app.features.listicle_pipeline.contracts import LISTICLE_MARKER_KEYS

    state = GrillState(
        run_id="halfway",
        seed="20 cevicherias in Lima",
        status="asking",
        marker_keys=LISTICLE_MARKER_KEYS,
        pending=GrillQuestion(
            question_id="q1", topic="count", ask="How many?", recommendation="20"
        ),
    )
    store.save(state)
    with pytest.raises(ValueError, match="not agreed"):
        service.search("halfway", _replies())


def test_a_missing_run_is_a_missing_run(isolated_db):
    with pytest.raises(LookupError):
        service.search("nope", _replies())


def test_contribution_is_reported_without_calling_the_repeated_one_best(run):
    payload = service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | since the 1980s\nEl Mercado | Miraflores | old",
            cheap="El Mercado | Miraflores | cheap menu",
        ),
    )
    rows = {row["angle"]: row for row in payload["angles"]}
    decades = rows["cevicherias open for decades"]
    assert (decades["found"], decades["shared"], decades["exclusive"]) == (2, 1, 1)
    cheap = rows["very cheap cevicherias people rate highly"]
    assert (cheap["found"], cheap["shared"], cheap["exclusive"]) == (1, 1, 0)


def test_a_short_pool_says_so_without_adding_an_unapproved_search(run):
    payload = service.search(
        run.run_id, _replies(decades="Canta Rana | Barranco | x", cheap="")
    )
    assert payload["shortfall"] == 19
    assert len(payload["angles"]) == 2


def test_a_run_stored_before_attempts_existed_still_opens(run):
    """Real results, from before work was recorded per angle. They open, and
    every field the screen reads is filled with the honest default -- a missing
    field is not a smaller result, it is a crash on a page the operator opened
    expecting their research."""
    store.save_results(
        run.run_id,
        {
            "run_id": run.run_id,
            "target": 20,
            "found": 1,
            "shortfall": 19,
            "rows_returned": 1,
            "angles": [
                {
                    "angle": "cevicherias open for decades",
                    "rows": 1,
                    "sources": 2,
                    "failed": False,
                    "reason": "",
                }
            ],
            "candidates": [
                {
                    "name": "Canta Rana",
                    "district": "Barranco",
                    "evidence": "since the 1980s",
                    "found_by": ["cevicherias open for decades"],
                    "overlap": 1,
                }
            ],
        },
    )
    view = service.progress(run.run_id)
    assert view["legacy"] is True
    assert view["found"] == 1
    # The fields the new screen reads, present rather than missing.
    assert view["candidates"][0]["possible_duplicates"] == []
    assert view["candidates"][0]["sightings"] == []
    assert view["angles"][0]["state"] == "completed"
    assert view["uncertain_identity"] == 0
    assert view["running"] is False


def test_a_new_result_replaces_the_legacy_view_rather_than_sitting_beside_it(run):
    store.save_results(run.run_id, {"candidates": [{"name": "Old", "found_by": []}]})
    payload = service.search(
        run.run_id,
        _replies(decades="Canta Rana | Barranco | x", cheap="Al Toke Pez | Surquillo | y"),
    )
    assert payload.get("legacy") is not True
    assert service.progress(run.run_id)["found"] == 2


def test_a_legacy_result_on_a_run_with_no_order_is_still_read_safely(isolated_db):
    """The oldest case: results stored before orders existed, on a run whose
    interview cannot rebuild one."""
    store.save_results(
        "ancient",
        {"target": 12, "candidates": [{"name": "Canta Rana", "found_by": ["a"]}]},
    )
    view = service.progress("ancient")
    assert view["legacy"] is True
    assert view["target"] == 12
    assert view["candidates"][0]["sightings"] == []


# What an angle bought, kept after the run that bought it
#
# Contribution -- how many places a search returned and how many of them
# nothing else found -- was computed when the results screen was drawn and
# thrown away with it. In run 33fca394 the `purist` angle returned ten rows for
# one exclusive place and `hours` returned six for none: roughly two of seven
# searches bought nothing, nothing noticed, and the numbers only existed after
# the money was spent.


def test_contribution_is_written_onto_the_attempt(run):
    payload = service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | open since the 1980s\nEl Mercado | Miraflores | a classic",
            cheap="Canta Rana | Barranco | cheap and good",
        ),
    )
    assert payload["found"] == 2

    stored = {a.angle_id: a for a in store.load_attempts(run.run_id)}
    decades = next(a for a in stored.values() if "decades" in a.angle_text)
    cheap = next(a for a in stored.values() if "cheap" in a.angle_text)

    assert decades.contribution_recorded and cheap.contribution_recorded
    # `decades` found both; only El Mercado was its alone.
    assert (decades.found, decades.shared, decades.exclusive) == (2, 1, 1)
    # `cheap` found one place, and the other search found it too.
    assert (cheap.found, cheap.shared, cheap.exclusive) == (1, 1, 0)


def test_a_search_that_bought_nothing_exclusive_is_named(run):
    payload = service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | open since the 1980s",
            cheap="Canta Rana | Barranco | cheap and good",
        ),
    )
    # Both found the same one place, so neither found anything the other
    # missed. Said, rather than left to be worked out from a table.
    assert len(payload["empty_handed"]) == 2


def test_retrying_one_angle_rewrites_what_the_others_contributed(run):
    """Contribution is a fact about the pool, so it cannot be frozen when a
    search lands. Retrying one angle changes what every other angle turns out
    to have contributed."""
    service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | open since the 1980s",
            cheap=TimeoutError("read timed out"),
        ),
    )
    before = next(
        a for a in store.load_attempts(run.run_id) if "decades" in a.angle_text
    )
    assert before.exclusive == 1

    order = store.load_order(run.run_id)
    cheap_id = next(a.angle_id for a in order.angles if "cheap" in a.text)
    service.search(
        run.run_id,
        _replies(cheap="Canta Rana | Barranco | cheap and good"),
        only=[cheap_id],
        reuse=False,
    )

    after = next(
        a for a in store.load_attempts(run.run_id) if "decades" in a.angle_text
    )
    assert after.exclusive == 0, "the retry found the same place, so nothing is exclusive"


def test_what_an_angle_bought_last_time_is_readable_before_paying_again(run):
    from app.features.listicle_pipeline import runner

    service.search(
        run.run_id,
        _replies(
            decades=(
                "Canta Rana | Barranco | open since the 1980s\n"
                "El Mercado | Miraflores | a classic"
            ),
            cheap="Canta Rana | Barranco | cheap and good",
        ),
    )

    # A second run about the same subject. The wording the model writes differs
    # every time, so the shape is what identifies the search across runs.
    second = agreed_state(run_id="run0002")
    store.save(second)
    order = service.order("run0002")
    notes = runner.prior_contribution(order)

    cheap_id = next(a.angle_id for a in order.angles if "cheap" in a.text)
    assert "no place the other searches missed" in notes[cheap_id]
    decades_id = next(a.angle_id for a in order.angles if "decades" in a.text)
    assert "1 place nothing else found" in notes[decades_id]


def test_a_different_subject_is_not_told_about_this_ones_history(run):
    """What the `cheap` shape does for cevicherias in Lima says nothing about
    what it does for bookshops in Buenos Aires."""
    from app.features.listicle_pipeline import runner
    from tests.listicle_test_support import default_turns, turn

    service.search(
        run.run_id,
        _replies(
            decades="Canta Rana | Barranco | open since the 1980s",
            cheap="Canta Rana | Barranco | cheap and good",
        ),
    )

    turns = [t for t in default_turns() if t.question.asks_about != "place"]
    turns.insert(1, turn("place", "Buenos Aires, Argentina"))
    elsewhere = agreed_state(run_id="run0003", turns=turns)
    store.save(elsewhere)

    assert runner.prior_contribution(service.order("run0003")) == {}


def test_a_first_run_about_a_subject_is_told_nothing(isolated_db):
    from app.features.listicle_pipeline import runner

    state = agreed_state()
    store.save(state)
    assert runner.prior_contribution(service.order(state.run_id)) == {}
