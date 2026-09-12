"""One place, prepared and researched: what it costs and what it refuses.

The property every test here is written around is the one the money depends on:
**a provider call happens when, and only when, somebody presses the button on a
card that is ready.** A read never buys one, a blocked request never buys one, a
repeated request never buys a second, and a request that fails never turns into
two.

Every call is a stub that counts itself. Nothing here reaches the web.
"""

from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.listicle_pipeline.api as listicle_api
from app.features.listicle_pipeline import (
    candidate_prep,
    identity,
    profile_service,
    profile_store,
    research_store,
    service,
    store,
)
from tests.listicle_test_support import agreed_state

BASE = "/api/listicle-pipeline"


# --------------------------------------------------------------------------
# A run with two places on it, no network involved
# --------------------------------------------------------------------------


def _search(prompt: str):
    if "decades" in prompt:
        return (
            "Canta Rana | Barranco | open since the 1980s, known for its wings",
            ["https://press.test/a"],
            9,
        )
    return (
        "Al Toke Pez | Surquillo | six stools and a counter",
        ["https://press.test/b"],
        7,
    )


def _resolved(name: str, city: str, district: str = "") -> identity.Lookup:
    return identity.Lookup(
        "found",
        identity.ResolvedPlace(
            place_id=f"place-{name.lower().replace(' ', '-')}",
            name=name,
            address=f"Av. Test 1, {district or city}",
            types=("restaurant", "food"),
            business_status="OPERATIONAL",
            rating=4.5,
            rating_count=120,
        ),
    )


def _review(job_id, prompt, tool_name, schema):
    """The cut reviewer, answering nothing. This slice is not about the cut,
    and a test that reached a real model would be a test about the network."""
    return {}


@pytest.fixture
def client(isolated_db, monkeypatch):
    monkeypatch.setattr(listicle_api, "_search_call", _search)
    monkeypatch.setattr(listicle_api, "_review_call", _review)
    app = FastAPI()
    app.include_router(listicle_api.router)
    return TestClient(app)


@pytest.fixture
def run(client):
    """An agreed run, searched, with Google's answer stored for both places."""
    state = agreed_state(run_id="research1")
    store.save(state)
    client.post(f"{BASE}/search/{state.run_id}")
    service.check_on_google(state.run_id, lookup=_resolved)
    return state.run_id


def _cards(client, run_id) -> dict:
    body = client.get(f"{BASE}/board/{run_id}/research").json()
    return {card["name"]: card for card in body["cards"]}


def _prepare(client, run_id, candidate_id, **extra):
    """Tick everything a ready card needs, in the order a person would."""
    body = {"identity_confirmed": True, "open_confirmed": True, **extra}
    response = client.put(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/prep", json=body
    )
    assert response.status_code == 200, response.text
    return response.json()


class _Transport:
    """A research call that counts itself and answers with whatever it was
    handed. The only thing standing where the provider would be."""

    def __init__(self, reply: object = None):
        self.calls = 0
        self.prompts: list[str] = []
        self.reply = reply

    def __call__(self, prompt: str):
        self.calls += 1
        self.prompts.append(prompt)
        if isinstance(self.reply, Exception):
            raise self.reply
        if callable(self.reply):
            return self.reply(prompt)
        return profile_service.TransportResult(
            text=self.reply if isinstance(self.reply, str) else _REPLY,
            model="stub-model",
            usage={"total_tokens": 1234},
            actual_queries=["alitas jesus maria"],
        )


_REPLY = json.dumps(
    {
        "findings": [
            {
                "text": "The kitchen fries its wings twice and finishes them in "
                "a rocoto glaze made in house.",
                "kind": "signature",
                "categories": ["signature_offering", "preparation"],
                "source_ids": ["s1"],
                "supporting_excerpt": "doble fritura y glaseado de rocoto",
                "branch_or_brand_scope": "branch",
                "source_published_at": "2025-04-02",
                "temporal_type": "current_offering",
            },
            {
                "text": "Named best wings in Lima by Lima Gourmet in 2023.",
                "kind": "award",
                "categories": ["recognition"],
                "source_ids": ["s2"],
                "branch_or_brand_scope": "brand",
                "event_date": "2023",
                "source_published_at": "2023-11-01",
                "temporal_type": "historical",
            },
            {
                "text": "A regular says the portions have got smaller this year.",
                "kind": "review",
                "categories": ["customer_observations", "value_portions"],
                "source_ids": [],
                "branch_or_brand_scope": "branch",
                "temporal_type": "observation",
            },
        ],
        "sources": [
            {
                "id": "s1",
                "url": "https://press.test/wings-review",
                "publisher": "El Comercio",
                "type": "press",
                "title": "Las mejores alitas",
                "published_at": "2025-04-02",
            },
            {
                "id": "s2",
                "url": "https://guide.test/best-wings",
                "publisher": "Lima Gourmet",
                "type": "press",
                "published_at": "2023-11-01",
            },
        ],
        "coverage": [
            {"category": "signature_offering", "state": "covered", "note": "menu found"},
            {"category": "history", "state": "not_found", "note": "nothing published"},
        ],
        "open_questions": ["Who opened it?"],
    },
    ensure_ascii=False,
)


# --------------------------------------------------------------------------
# Readiness
# --------------------------------------------------------------------------


def test_a_fresh_card_is_not_ready_and_says_exactly_why(client, run):
    card = next(iter(_cards(client, run).values()))
    codes = {blocker["code"] for blocker in card["readiness"]["blockers"]}
    assert card["readiness"]["ready"] is False
    assert codes == {"identity_unconfirmed", "open_unconfirmed"}
    assert card["readiness"]["required_total"] == 2


def test_confirming_both_required_checks_makes_it_ready(client, run):
    card = next(iter(_cards(client, run).values()))
    saved = _prepare(client, run, card["candidate_id"])
    assert saved["readiness"]["ready"] is True
    assert saved["readiness"]["required_done"] == 2


def test_preparation_survives_a_reload(client, run):
    card = next(iter(_cards(client, run).values()))
    _prepare(client, run, card["candidate_id"], tripadvisor_url="")
    again = _cards(client, run)[card["name"]]
    assert again["prep"]["identity_confirmed"] is True
    assert again["prep"]["open_confirmed"] is True
    assert again["readiness"]["ready"] is True


def test_an_empty_tripadvisor_box_is_a_valid_answer(client, run):
    card = next(iter(_cards(client, run).values()))
    saved = _prepare(client, run, card["candidate_id"], tripadvisor_url="   ")
    assert saved["readiness"]["ready"] is True
    assert saved["readiness"]["required_total"] == 2


def test_a_link_that_is_not_a_tripadvisor_place_page_blocks_until_it_is_fixed(
    client, run
):
    card = next(iter(_cards(client, run).values()))
    saved = _prepare(
        client,
        run,
        card["candidate_id"],
        tripadvisor_url="https://tripadvisor.com/Search?q=wings",
    )
    assert saved["readiness"]["ready"] is False
    assert [b["code"] for b in saved["readiness"]["blockers"]] == [
        "tripadvisor_invalid"
    ]
    cleared = client.put(
        f"{BASE}/board/{run}/candidates/{card['candidate_id']}/prep",
        json={"tripadvisor_url": ""},
    ).json()
    assert cleared["readiness"]["ready"] is True


def test_a_real_tripadvisor_place_link_is_accepted_and_changes_no_requirement(
    client, run
):
    card = next(iter(_cards(client, run).values()))
    saved = _prepare(
        client,
        run,
        card["candidate_id"],
        tripadvisor_url="https://www.tripadvisor.com/Restaurant_Review-g294316-d1234567-Reviews.html",
    )
    assert saved["readiness"]["ready"] is True
    assert saved["readiness"]["required_total"] == 2


def test_a_changed_google_identity_unsticks_the_confirmation(client, run):
    card = next(iter(_cards(client, run).values()))
    _prepare(client, run, card["candidate_id"])
    stored = store.load_google_checks(run)[card["candidate_id"]]
    stored["address"] = "Somewhere else entirely 900"
    store.save_google_check(run, card["candidate_id"], stored)
    after = _cards(client, run)[card["name"]]
    codes = {b["code"] for b in after["readiness"]["blockers"]}
    assert "identity_stale" in codes and "open_stale" in codes


def test_editing_an_optional_link_does_not_unstick_the_open_confirmation(client, run):
    card = next(iter(_cards(client, run).values()))
    _prepare(client, run, card["candidate_id"])
    client.put(
        f"{BASE}/board/{run}/candidates/{card['candidate_id']}/prep",
        json={
            "tripadvisor_url": "https://www.tripadvisor.com/Restaurant_Review-g1-d999999-Reviews.html"
        },
    )
    after = _cards(client, run)[card["name"]]
    assert after["prep"]["open_confirmed"] is True
    assert after["readiness"]["ready"] is True


def test_a_place_google_calls_permanently_closed_cannot_be_researched(client, run):
    card = next(iter(_cards(client, run).values()))
    stored = store.load_google_checks(run)[card["candidate_id"]]
    stored["business_status"] = "CLOSED_PERMANENTLY"
    store.save_google_check(run, card["candidate_id"], stored)
    _prepare(client, run, card["candidate_id"])
    after = _cards(client, run)[card["name"]]
    assert "google_closed" in {b["code"] for b in after["readiness"]["blockers"]}


def test_an_unknown_opening_status_asks_for_a_written_reason(client, run):
    card = next(iter(_cards(client, run).values()))
    stored = store.load_google_checks(run)[card["candidate_id"]]
    stored["business_status"] = "CLOSED_TEMPORARILY"
    store.save_google_check(run, card["candidate_id"], stored)
    blocked = _prepare(client, run, card["candidate_id"])
    assert "status_note_missing" in {
        b["code"] for b in blocked["readiness"]["blockers"]
    }
    with_note = client.put(
        f"{BASE}/board/{run}/candidates/{card['candidate_id']}/prep",
        json={"status_note": "The owner confirmed by phone that it reopens Monday."},
    ).json()
    assert with_note["readiness"]["ready"] is True


def test_an_unresolved_identity_blocks_before_anything_is_confirmed(
    client, isolated_db
):
    state = agreed_state(run_id="unresolved1")
    store.save(state)
    client.post(f"{BASE}/search/{state.run_id}")
    card = next(iter(_cards(client, state.run_id).values()))
    assert "identity_unresolved" in {
        b["code"] for b in card["readiness"]["blockers"]
    }


def test_a_removed_place_cannot_be_researched_and_its_research_stays_readable(
    client, run
):
    cards = _cards(client, run)
    card = next(iter(cards.values()))
    service.remove_candidate(run, card["candidate_id"], "by_hand")
    after = _cards(client, run)[card["name"]]
    assert after["readiness"]["ready"] is False
    assert "removed" in {b["code"] for b in after["readiness"]["blockers"]}


def test_two_cards_resolving_to_one_google_place_is_an_identity_conflict(client, run):
    cards = list(_cards(client, run).values())
    first, second = cards[0], cards[1]
    stored = store.load_google_checks(run)
    twin = dict(stored[first["candidate_id"]])
    twin["place_id"] = stored[second["candidate_id"]]["place_id"]
    store.save_google_check(run, first["candidate_id"], twin)
    after = _cards(client, run)[first["name"]]
    assert "identity_conflict" in {b["code"] for b in after["readiness"]["blockers"]}


def test_an_unjudged_card_under_a_cut_can_be_confirmed_by_hand(client, run):
    """Absence of a flag is not a check. The card says so, and a person can
    answer it -- which is not the same as the card deciding for itself."""
    from app.core.database import get_db_connection

    # The pool review this run has is thrown away, leaving the state a run
    # whose cut check nobody ever bought is in.
    with get_db_connection() as conn:
        conn.execute("DELETE FROM listicle_cut_reviews_by_pool")
    card = next(iter(_cards(client, run).values()))
    blocked = _prepare(client, run, card["candidate_id"])
    assert "cut_unchecked" in {b["code"] for b in blocked["readiness"]["blockers"]}
    confirmed = client.put(
        f"{BASE}/board/{run}/candidates/{card['candidate_id']}/prep",
        json={"cut_confirmed": True},
    ).json()
    assert confirmed["readiness"]["ready"] is True


def test_a_save_written_against_an_old_version_is_refused(client, run):
    card = next(iter(_cards(client, run).values()))
    _prepare(client, run, card["candidate_id"])
    stale = client.put(
        f"{BASE}/board/{run}/candidates/{card['candidate_id']}/prep",
        json={"expected_version": 0, "open_confirmed": False},
    )
    assert stale.status_code == 409


# --------------------------------------------------------------------------
# What a call costs
# --------------------------------------------------------------------------


def _research(client, run_id, candidate_id, transport, **body):
    monkey = {"idempotency_key": body.pop("key", "key-" + candidate_id[:8])}
    monkey.update(body)
    listicle_api._research_call = transport  # noqa: SLF001 -- the injection point
    return client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research", json=monkey
    )


@pytest.fixture
def ready(client, run):
    card = next(iter(_cards(client, run).values()))
    _prepare(client, run, card["candidate_id"])
    return run, card["candidate_id"], card["name"]


def test_reading_the_board_never_calls_the_provider(client, run, monkeypatch):
    transport = _Transport()
    monkeypatch.setattr(listicle_api, "_research_call", transport)
    client.get(f"{BASE}/board/{run}/research")
    client.get(f"{BASE}/board/{run}/research")
    assert transport.calls == 0


def test_one_click_is_one_call_and_the_findings_are_saved(client, ready, monkeypatch):
    run_id, candidate_id, _ = ready
    transport = _Transport()
    monkeypatch.setattr(listicle_api, "_research_call", transport)
    response = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "click-one-0001"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert transport.calls == 1
    assert body["attempt"]["state"] == "completed"
    assert body["attempt"]["findings_added"] == 3
    assert body["profile"]["findings_this_topic"] == 3


def test_the_same_key_twice_does_not_buy_a_second_call(client, ready, monkeypatch):
    run_id, candidate_id, _ = ready
    transport = _Transport()
    monkeypatch.setattr(listicle_api, "_research_call", transport)
    first = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "same-key-0001"},
    ).json()
    second = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "same-key-0001"},
    ).json()
    assert transport.calls == 1
    assert second["repeated"] is True
    assert second["attempt"]["attempt_id"] == first["attempt"]["attempt_id"]


def test_a_new_key_over_unchanged_input_is_answered_from_storage(
    client, ready, monkeypatch
):
    """A second initial request asking exactly the same question about exactly
    the same material is not a second purchase."""
    run_id, candidate_id, _ = ready
    transport = _Transport()
    monkeypatch.setattr(listicle_api, "_research_call", transport)
    client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "first-key-0001"},
    )
    again = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "second-key-001"},
    ).json()
    assert transport.calls == 1
    assert again["reused"] is True


def test_a_blocked_request_never_reaches_the_provider(client, run, monkeypatch):
    card = next(iter(_cards(client, run).values()))
    transport = _Transport()
    monkeypatch.setattr(listicle_api, "_research_call", transport)
    response = client.post(
        f"{BASE}/board/{run}/candidates/{card['candidate_id']}/research",
        json={"idempotency_key": "blocked-key-01"},
    )
    assert response.status_code == 422
    assert transport.calls == 0
    codes = {b["code"] for b in response.json()["detail"]["blockers"]}
    assert "identity_unconfirmed" in codes


def test_a_click_against_a_card_that_has_moved_is_refused(client, ready, monkeypatch):
    run_id, candidate_id, _ = ready
    transport = _Transport()
    monkeypatch.setattr(listicle_api, "_research_call", transport)
    response = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "stale-key-0001", "expected_prep_version": 0},
    )
    assert response.status_code == 409
    assert transport.calls == 0


def test_a_gap_request_needs_a_question(client, ready, monkeypatch):
    run_id, candidate_id, _ = ready
    transport = _Transport()
    monkeypatch.setattr(listicle_api, "_research_call", transport)
    response = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "gap-key-000001", "mode": "gap"},
    )
    assert response.status_code == 422
    assert transport.calls == 0


def test_a_gap_request_is_one_more_call_and_says_what_it_asked(
    client, ready, monkeypatch
):
    run_id, candidate_id, _ = ready
    transport = _Transport()
    monkeypatch.setattr(listicle_api, "_research_call", transport)
    client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "initial-key-01"},
    )
    gap = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={
            "idempotency_key": "gap-key-000002",
            "mode": "gap",
            "gap_text": "Who owns it now?",
        },
    ).json()
    assert transport.calls == 2
    attempt = client.get(f"{BASE}/research-attempts/{gap['attempt']['attempt_id']}")
    assert "Who owns it now?" in attempt.json()["prompt"]
    assert attempt.json()["gap_text"] == "Who owns it now?"


# --------------------------------------------------------------------------
# How a request can end
# --------------------------------------------------------------------------


def test_a_provider_failure_is_recorded_and_keeps_earlier_findings(
    client, ready, monkeypatch
):
    run_id, candidate_id, _ = ready
    good = _Transport()
    monkeypatch.setattr(listicle_api, "_research_call", good)
    client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "good-key-00001"},
    )
    bad = _Transport(RuntimeError("the network went away"))
    monkeypatch.setattr(listicle_api, "_research_call", bad)
    failed = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "bad-key-000001", "mode": "refresh"},
    ).json()
    assert failed["attempt"]["state"] == "failed"
    assert failed["attempt"]["reason_code"] == "provider_failed"
    assert failed["profile"]["findings_this_topic"] == 3


def test_a_malformed_answer_is_its_own_state_and_keeps_the_raw_text(
    client, ready, monkeypatch
):
    run_id, candidate_id, _ = ready
    monkeypatch.setattr(
        listicle_api, "_research_call", _Transport("I am not JSON at all.")
    )
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "invalid-key-01"},
    ).json()
    assert body["attempt"]["state"] == "response_invalid"
    attempt = client.get(
        f"{BASE}/research-attempts/{body['attempt']['attempt_id']}"
    ).json()
    assert attempt["raw_response"] == "I am not JSON at all."


def test_an_answer_with_no_findings_is_not_a_failure(client, ready, monkeypatch):
    run_id, candidate_id, _ = ready
    empty = json.dumps(
        {
            "findings": [],
            "sources": [],
            "coverage": [{"category": "history", "state": "not_found", "note": ""}],
            "open_questions": [],
        }
    )
    monkeypatch.setattr(listicle_api, "_research_call", _Transport(empty))
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "empty-key-0001"},
    ).json()
    assert body["attempt"]["state"] == "completed_empty"
    assert body["attempt"]["findings_added"] == 0


def test_a_fenced_json_reply_is_read(client, ready, monkeypatch):
    run_id, candidate_id, _ = ready
    monkeypatch.setattr(
        listicle_api, "_research_call", _Transport(f"```json\n{_REPLY}\n```")
    )
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "fenced-key-001"},
    ).json()
    assert body["attempt"]["state"] == "completed"
    assert body["attempt"]["findings_added"] == 3


def test_an_interrupted_attempt_is_marked_and_a_late_write_is_refused(
    client, ready, monkeypatch
):
    """A process that dies mid-call must not leave the feature locked, and its
    answer must not land on top of whatever happened since."""
    run_id, candidate_id, _ = ready
    from app.features.listicle_pipeline.profiles import ResearchAttempt

    attempt = research_store.reserve(
        ResearchAttempt(
            attempt_id="abandoned01",
            idempotency_key="abandoned-key",
            profile_id="p1",
            run_id=run_id,
            candidate_id=candidate_id,
        )
    )
    with research_store.get_db_connection() as conn:
        conn.execute(
            "UPDATE listicle_research_attempts SET lease_until = '2000-01-01T00:00:00+00:00'"
        )
        conn.execute(
            "UPDATE listicle_research_slot SET lease_until = '2000-01-01T00:00:00+00:00'"
        )
    assert research_store.active() is None
    assert research_store.load("abandoned01").state == "interrupted"
    with pytest.raises(research_store.NotTheOwner):
        research_store.finish(attempt.model_copy(update={"state": "completed"}))


def test_only_one_research_request_runs_at_a_time(client, ready):
    run_id, candidate_id, _ = ready
    from app.features.listicle_pipeline.profiles import ResearchAttempt

    research_store.reserve(
        ResearchAttempt(
            attempt_id="holding0001",
            idempotency_key="holding-key-1",
            profile_id="p1",
            run_id=run_id,
            candidate_id="somebody-else",
        )
    )
    card = _cards(client, run_id)
    blocked = [
        entry
        for entry in card.values()
        if entry["candidate_id"] == candidate_id
    ][0]
    assert "another_running" in {
        b["code"] for b in blocked["readiness"]["blockers"]
    }


# --------------------------------------------------------------------------
# What is stored, and what it means
# --------------------------------------------------------------------------


@pytest.fixture
def researched(client, ready, monkeypatch):
    run_id, candidate_id, name = ready
    monkeypatch.setattr(listicle_api, "_research_call", _Transport())
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "researched-001"},
    ).json()
    return run_id, candidate_id, body["profile"]["profile_id"]


def test_findings_carry_their_source_and_three_separate_dates(client, researched):
    _, _, profile_id = researched
    view = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    glaze = next(f for f in view["findings"] if "rocoto" in f["text"])
    assert glaze["evidence"][0]["publisher"] == "El Comercio"
    assert glaze["evidence"][0]["published_at"] == "2025-04-02"
    assert glaze["evidence"][0]["retrieved_at"]
    assert glaze["source_published_at"] == "2025-04-02"
    award = next(f for f in view["findings"] if "Lima Gourmet" in f["text"])
    assert award["event_date"] == "2023"
    assert award["temporal_type"] == "historical"
    assert award["scope"] == "brand"


def test_retrieval_never_fills_in_a_publication_date(client, researched):
    _, _, profile_id = researched
    view = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    unsourced = next(f for f in view["findings"] if "portions" in f["text"])
    assert unsourced["source_published_at"] == ""
    assert unsourced["evidence"] == []


def test_an_unattributed_finding_is_never_given_someone_elses_link(client, researched):
    _, _, profile_id = researched
    view = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    unsourced = next(f for f in view["findings"] if "portions" in f["text"])
    assert unsourced["attribution"] == "incomplete"
    assert unsourced["evidence"] == []


def test_every_ai_finding_starts_unreviewed(client, researched):
    _, _, profile_id = researched
    view = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    assert {f["curation"] for f in view["findings"]} == {"unreviewed"}


def test_a_person_can_add_edit_keep_and_discard_and_it_survives_a_reload(
    client, researched
):
    _, _, profile_id = researched
    added = client.post(
        f"{BASE}/profiles/{profile_id}/findings",
        json={
            "text": "They only open at lunch on Sundays; I queued twenty minutes.",
            "kind": "practice",
            "categories": ["practical"],
            "topics": ["chicken-wings"],
            "observed_at": "2026-08-30",
            "scope": "branch",
        },
    )
    assert added.status_code == 200, added.text
    mine = next(
        f for f in added.json()["findings"] if "queued twenty minutes" in f["text"]
    )
    assert mine["origin"] == "operator"
    assert mine["observed_at"] == "2026-08-30"

    discarded = client.patch(
        f"{BASE}/profiles/{profile_id}/findings/{mine['finding_id']}",
        json={"curation": "discarded", "expected_version": mine["version"]},
    ).json()
    changed = next(
        f for f in discarded["findings"] if f["finding_id"] == mine["finding_id"]
    )
    assert changed["curation"] == "discarded"
    assert changed["version"] == mine["version"] + 1

    restored = client.patch(
        f"{BASE}/profiles/{profile_id}/findings/{mine['finding_id']}",
        json={"curation": "kept"},
    ).json()
    back = next(f for f in restored["findings"] if f["finding_id"] == mine["finding_id"])
    assert back["curation"] == "kept"
    # Discarding hid it; nothing was deleted, and the history says what happened.
    assert len(back["revisions"]) == 2


def test_an_edit_written_against_an_old_version_is_refused(client, researched):
    _, _, profile_id = researched
    view = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    first = view["findings"][0]
    client.patch(
        f"{BASE}/profiles/{profile_id}/findings/{first['finding_id']}",
        json={"curation": "kept"},
    )
    conflict = client.patch(
        f"{BASE}/profiles/{profile_id}/findings/{first['finding_id']}",
        json={"curation": "discarded", "expected_version": first["version"]},
    )
    assert conflict.status_code == 409


def test_a_refresh_does_not_overwrite_a_manual_correction(
    client, researched, monkeypatch
):
    run_id, candidate_id, profile_id = researched
    view = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    glaze = next(f for f in view["findings"] if "rocoto" in f["text"])
    client.patch(
        f"{BASE}/profiles/{profile_id}/findings/{glaze['finding_id']}",
        json={
            "text": "The kitchen fries its wings twice and finishes them in an "
            "aji amarillo glaze -- corrected after asking the kitchen.",
            "curation": "kept",
        },
    )
    monkeypatch.setattr(listicle_api, "_research_call", _Transport())
    client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "refresh-key-01", "mode": "refresh"},
    )
    after = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    mine = next(
        f for f in after["findings"] if f["finding_id"] == glaze["finding_id"]
    )
    assert "aji amarillo" in mine["text"]
    assert mine["curation"] == "kept"


def test_the_same_finding_found_twice_is_one_row_with_its_provenance_kept(
    client, researched, monkeypatch
):
    run_id, candidate_id, profile_id = researched
    before = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    second = json.loads(_REPLY)
    second["sources"][0]["url"] = "https://other.test/also-wings"
    second["sources"][0]["publisher"] = "Publimetro"
    monkeypatch.setattr(
        listicle_api, "_research_call", _Transport(json.dumps(second))
    )
    client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "twice-key-0001", "mode": "refresh"},
    )
    after = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    assert len(after["findings"]) == len(before["findings"])
    glaze = next(f for f in after["findings"] if "rocoto" in f["text"])
    assert {item["publisher"] for item in glaze["evidence"]} == {
        "El Comercio",
        "Publimetro",
    }


def test_a_second_topic_appends_and_never_replaces(client, researched, monkeypatch):
    """Researching one place for the cocktail list must not throw away what
    the ceviche list paid to find out about it."""
    from tests.listicle_test_support import default_turns, turn

    _, _, profile_id = researched
    cocktail_run = agreed_state(
        run_id="cocktails1",
        seed="The 20 best cocktail bars in Lima",
        turns=[
            turn("kind", "cocktail bars"),
            *[t for t in default_turns() if t.question.topic != "kind"],
        ],
    )
    store.save(cocktail_run)
    client.post(f"{BASE}/search/{cocktail_run.run_id}")
    service.check_on_google(cocktail_run.run_id, lookup=_resolved)
    ctx = candidate_prep.context(cocktail_run.run_id)
    assert ctx.topic == "cocktail-bars"
    candidate_id = next(
        cid
        for cid in ctx.candidates
        if profile_service._resolve_profile(ctx, cid) == profile_id
    )
    _prepare(client, cocktail_run.run_id, candidate_id)

    cocktails = json.dumps(
        {
            "findings": [
                {
                    "text": "The bar makes a chilcano with house-macerated rocoto.",
                    "kind": "signature",
                    "categories": ["drinks"],
                    "source_ids": [],
                    "branch_or_brand_scope": "branch",
                    "temporal_type": "current_offering",
                }
            ],
            "sources": [],
            "coverage": [],
            "open_questions": [],
        }
    )
    monkeypatch.setattr(listicle_api, "_research_call", _Transport(cocktails))
    done = client.post(
        f"{BASE}/board/{cocktail_run.run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "cocktails-00001"},
    ).json()
    assert done["attempt"]["state"] == "completed"

    everything = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    assert len(everything["findings"]) == 4
    wings_only = client.get(
        f"{BASE}/profiles/{profile_id}/research?topic=cevicherias"
    ).json()
    assert len(wings_only["findings"]) == 3
    drinks_only = client.get(
        f"{BASE}/profiles/{profile_id}/research?topic=cocktail-bars"
    ).json()
    assert len(drinks_only["findings"]) == 1


def test_a_possible_angle_is_kept_apart_from_the_facts(client, researched):
    _, _, profile_id = researched
    body = client.post(
        f"{BASE}/profiles/{profile_id}/possible-angles",
        json={"label": "The one for a long lunch with friends", "topic": "cevicherias"},
    ).json()
    assert len(body["possible_angles"]) == 1
    assert all(
        "long lunch" not in finding["text"] for finding in body["findings"]
    )
    angle_id = body["possible_angles"][0]["angle_id"]
    archived = client.patch(
        f"{BASE}/profiles/{profile_id}/possible-angles/{angle_id}",
        json={"archived": True},
    ).json()
    assert archived["possible_angles"][0]["archived"] is True


def test_the_attempt_records_what_it_asked_and_what_the_provider_reported(
    client, researched
):
    _, _, profile_id = researched
    view = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    attempt_id = view["history"][0]["attempt_id"]
    attempt = client.get(f"{BASE}/research-attempts/{attempt_id}").json()
    assert attempt["requested_queries"]
    assert attempt["actual_queries"] == ["alitas jesus maria"]
    assert attempt["requested_queries"] != attempt["actual_queries"]
    assert attempt["usage"]["total_tokens"] == 1234
    assert attempt["model"] == "stub-model"
    assert [note["state"] for note in attempt["coverage"]] == ["covered", "not_found"]
    assert attempt["open_questions"] == ["Who opened it?"]


def test_reading_a_profile_or_an_attempt_writes_nothing(client, researched):
    _, _, profile_id = researched
    before = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    for _ in range(3):
        client.get(f"{BASE}/profiles/{profile_id}/research")
        client.get(f"{BASE}/research-attempts/{before['history'][0]['attempt_id']}")
    after = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    assert after["findings"] == before["findings"]
    assert len(after["history"]) == len(before["history"])


def test_a_profile_is_readable_from_a_second_list(client, researched, isolated_db):
    """The whole reason a profile is not a run's property."""
    _, _, profile_id = researched
    other = agreed_state(run_id="secondlist")
    store.save(other)
    client.post(f"{BASE}/search/{other.run_id}")
    service.check_on_google(other.run_id, lookup=_resolved)
    ctx = candidate_prep.context(other.run_id)
    candidate_id = next(iter(ctx.candidates))
    resolved = profile_service._resolve_profile(ctx, candidate_id)
    assert resolved == profile_id
    board = client.get(f"{BASE}/board/{other.run_id}/research").json()
    card = next(c for c in board["cards"] if c["candidate_id"] == candidate_id)
    assert card["profile"]["findings_total"] == 3


def test_two_branches_are_never_merged_by_name(client, run):
    """A second branch with its own Place ID is its own profile, whatever it
    is called."""
    ctx = candidate_prep.context(run)
    ids = list(ctx.candidates)
    first = profile_service._resolve_profile(ctx, ids[0])
    second = profile_service._resolve_profile(ctx, ids[1])
    assert first != second


# --------------------------------------------------------------------------
# Migration
# --------------------------------------------------------------------------


def test_the_migration_creates_what_is_missing_and_keeps_what_is_there(isolated_db):
    """Run on a database that already holds claims from the earlier pass: the
    rows survive, keep their ids, and read as unclassified."""
    from app.core.database import get_db_connection
    from app.features.listicle_pipeline.profiles import Claim

    profile_store.ensure_tables()
    profile = profile_store.open_profile(name="Old Place", city="Lima")
    profile_store.add_claims(
        profile.profile_id, [Claim(kind="award", text="Won something in 2019.")]
    )
    with get_db_connection() as conn:
        before = conn.execute(
            "SELECT claim_id FROM listicle_profile_claims"
        ).fetchall()

    profile_store.ensure_research_tables()
    profile_store.ensure_research_tables()  # twice: it has to be idempotent

    with get_db_connection() as conn:
        after = conn.execute(
            "SELECT claim_id FROM listicle_profile_claims"
        ).fetchall()
        tables = {
            row["name"]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    assert [row["claim_id"] for row in after] == [row["claim_id"] for row in before]
    assert {
        "listicle_research_sources",
        "listicle_finding_sources",
        "listicle_finding_revisions",
        "listicle_possible_angles",
        "listicle_candidate_profiles",
    } <= tables
    held = profile_store.findings(profile.profile_id)
    assert len(held) == 1
    assert held[0].curation == "unreviewed"
    assert held[0].origin == "unknown"
    assert held[0].categories == []


def test_an_expired_promotion_is_marked_and_kept(isolated_db):
    from app.features.listicle_pipeline.profiles import ResearchFinding

    profile_store.ensure_research_tables()
    profile = profile_store.open_profile(name="Promo Place", city="Lima")
    profile_store.save_finding(
        ResearchFinding(
            finding_id="f1",
            profile_id=profile.profile_id,
            text="Two for one on wings until March 2025.",
            temporal_type="promotion",
            valid_until="2025-03-31",
        )
    )
    held = profile_store.findings(profile.profile_id)[0]
    assert held.expired() is True
    assert held.text.startswith("Two for one")


def test_a_date_that_cannot_be_read_is_dropped_and_said(isolated_db):
    from app.features.listicle_pipeline import profile_research

    parsed = profile_research.parse_place_research(
        json.dumps(
            {
                "findings": [
                    {
                        "text": "Opened by the family in the eighties sometime.",
                        "kind": "history",
                        "event_date": "the eighties",
                        "source_ids": [],
                    }
                ],
                "sources": [],
                "coverage": [],
                "open_questions": [],
            }
        ),
        profile_id="p1",
        attempt_id="a1",
        topic="wings",
    )
    assert parsed.findings[0].event_date == ""
    assert any("not a date" in issue for issue in parsed.issues)


def test_a_dropped_row_is_never_reported_as_a_clean_extraction(isolated_db):
    from app.features.listicle_pipeline import profile_research

    parsed = profile_research.parse_place_research(
        json.dumps(
            {
                "findings": [
                    {"text": "short", "kind": "other", "source_ids": []},
                    {
                        "text": "A real finding about the wings, with words in it.",
                        "kind": "review",
                        "source_ids": ["nope"],
                    },
                ],
                "sources": [],
                "coverage": [],
                "open_questions": [],
            }
        ),
        profile_id="p1",
        attempt_id="a1",
        topic="wings",
    )
    assert len(parsed.findings) == 1
    assert len(parsed.issues) == 2


def test_a_truncated_reply_reports_the_real_problem(isolated_db):
    """A reply cut off mid-object arrives still wearing its opening fence.

    Stripping only a CLOSED fence made the error read "this is not JSON at
    all", which sends whoever reads it looking for a formatting problem when
    the actual one is a response budget. The first time it happened for real
    -- La Casa de las Alitas, 3,843 output tokens against a 3,072 cap -- that
    was the whole diagnosis.
    """
    from app.features.listicle_pipeline import profile_research

    cut = '```json\n{"findings": [{"text": "La Casa de las Alitas serves eleven'
    with pytest.raises(profile_research.ResponseInvalid) as raised:
        profile_research.parse_place_research(
            cut, profile_id="p1", attempt_id="a1", topic="wings"
        )
    assert "not JSON" in str(raised.value)
    # The reported failure is about where the JSON stops, not about the fence.
    assert "column 1" not in str(raised.value)


def test_the_shorter_name_is_what_reviews_are_searched_under(isolated_db):
    """Google's name for a place often carries the branch. The press does not.

    The first real request searched "BarBarian Bonilla 108" eighteen times and
    came back with three aggregators and no food writing.
    """
    from app.features.listicle_pipeline import profile_research

    request = profile_research.ResearchRequest(
        name="BarBarian Bonilla 108",
        aliases=["Barbarian"],
        city="Lima",
        district="Miraflores",
        topic="chicken-wings",
        topic_label="chicken wings",
    )
    directions = profile_research.requested_directions(request)
    assert any(
        line.startswith('"Barbarian"') and "customers" in line for line in directions
    )
    assert any(line.startswith('"BarBarian Bonilla 108"') for line in directions)
    prompt = profile_research.build_place_research_prompt(request)
    assert "Also written as: Barbarian." in prompt


def test_an_unresolved_duplicate_pair_blocks_both_of_them(client, run):
    """Two rows that might be one place are two purchases of one building, and
    one of the two profiles would be wrong."""
    cards = list(_cards(client, run).values())
    first, second = cards[0], cards[1]
    # Make the board flag them against each other, the way pooling does.
    order = store.load_order(run)
    found = service.progress(run)
    with_duplicates = dict(found)
    for candidate in with_duplicates["candidates"]:
        other = second if candidate["candidate_id"] == first["candidate_id"] else first
        if candidate["candidate_id"] in {first["candidate_id"], second["candidate_id"]}:
            candidate["possible_duplicate_ids"] = [other["candidate_id"]]

    import app.features.listicle_pipeline.service as service_module

    original = service_module.progress
    try:
        service_module.progress = lambda run_id: (
            with_duplicates if run_id == run else original(run_id)
        )
        blocked = _prepare(client, run, first["candidate_id"])
        assert "duplicates_open" in {
            b["code"] for b in blocked["readiness"]["blockers"]
        }
        # Settled the existing way -- these are different places -- and the
        # warning stops standing in the way.
        service.resolve_duplicates(
            run,
            first["candidate_id"],
            same=[],
            different=[second["candidate_id"]],
        )
        after = client.get(f"{BASE}/board/{run}/research").json()
        card = next(
            c for c in after["cards"] if c["candidate_id"] == first["candidate_id"]
        )
        assert card["readiness"]["ready"] is True
    finally:
        service_module.progress = original
    assert order is not None


def test_a_dismissed_google_warning_stops_blocking(client, run):
    """Putting a place back IS the operator overruling Google. The readiness
    check has to read that, or research is blocked by a warning somebody
    already answered."""
    card = next(iter(_cards(client, run).values()))
    stored = store.load_google_checks(run)[card["candidate_id"]]
    stored["business_status"] = "CLOSED_PERMANENTLY"
    store.save_google_check(run, card["candidate_id"], stored)
    _prepare(client, run, card["candidate_id"])
    assert "google_closed" in {
        b["code"]
        for b in _cards(client, run)[card["name"]]["readiness"]["blockers"]
    }

    store.dismiss_closed(run, card["candidate_id"])
    after = _cards(client, run)[card["name"]]
    codes = {b["code"] for b in after["readiness"]["blockers"]}
    assert "google_closed" not in codes
    # The dismissal changed what Google says about this place, so the "still
    # open" tick made against the old status is stale rather than silently
    # carried across.
    assert "open_stale" in codes


def test_a_second_request_while_one_runs_is_refused_without_buying_anything(
    client, ready, monkeypatch
):
    run_id, candidate_id, _ = ready
    from app.features.listicle_pipeline.profiles import ResearchAttempt

    research_store.reserve(
        ResearchAttempt(
            attempt_id="inflight001",
            idempotency_key="inflight-key1",
            profile_id="p9",
            run_id=run_id,
            candidate_id="another-place",
        )
    )
    transport = _Transport()
    monkeypatch.setattr(listicle_api, "_research_call", transport)
    response = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "second-while-run"},
    )
    assert response.status_code == 422
    assert transport.calls == 0
    assert "another_running" in {
        b["code"] for b in response.json()["detail"]["blockers"]
    }


def test_manual_edits_never_reach_the_provider(client, researched, monkeypatch):
    run_id, _, profile_id = researched
    transport = _Transport()
    monkeypatch.setattr(listicle_api, "_research_call", transport)
    view = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    first = view["findings"][0]["finding_id"]
    client.patch(
        f"{BASE}/profiles/{profile_id}/findings/{first}", json={"curation": "kept"}
    )
    client.post(
        f"{BASE}/profiles/{profile_id}/findings",
        json={"text": "They take card, and the queue moves fast at eight."},
    )
    client.post(
        f"{BASE}/profiles/{profile_id}/possible-angles",
        json={"label": "The one for a long lunch"},
    )
    client.get(f"{BASE}/board/{run_id}/research")
    assert transport.calls == 0


def test_a_source_the_reply_could_not_read_is_recorded_as_that(client, ready, monkeypatch):
    """`inaccessible` is not `not_found`. One says the material exists and we
    could not read it; the other is a statement about the place."""
    reply = json.dumps(
        {
            "findings": [],
            "sources": [],
            "coverage": [
                {"category": "recognition", "state": "inaccessible", "note": "paywalled"},
                {"category": "history", "state": "not_found", "note": ""},
            ],
            "open_questions": [],
        }
    )
    run_id, candidate_id, _ = ready
    monkeypatch.setattr(listicle_api, "_research_call", _Transport(reply))
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "inaccessible-01"},
    ).json()
    attempt = client.get(
        f"{BASE}/research-attempts/{body['attempt']['attempt_id']}"
    ).json()
    states = {note["category"]: note["state"] for note in attempt["coverage"]}
    assert states == {"recognition": "inaccessible", "history": "not_found"}
    # A place nothing could be read about is not a place with nothing written
    # about it, and the attempt state says which of the two this is.
    assert body["attempt"]["state"] == "completed_empty"


def test_the_count_never_says_finished_while_something_is_blocking(client, run):
    """A card that reads "3 of 3 checked" and cannot be researched is lying to
    whoever is working down the board.

    It happened for real: a settled duplicate counted as a completed check
    without counting as a required one, so a card with an unresolved identity
    conflict still showed every pip filled.
    """
    cards = list(_cards(client, run).values())
    first, second = cards[0], cards[1]
    # Two cards, one Google place: an identity conflict nobody can tick away.
    stored = store.load_google_checks(run)
    twin = dict(stored[first["candidate_id"]])
    twin["place_id"] = stored[second["candidate_id"]]["place_id"]
    store.save_google_check(run, first["candidate_id"], twin)
    _prepare(client, run, first["candidate_id"])

    readiness = _cards(client, run)[first["name"]]["readiness"]
    assert readiness["ready"] is False
    assert readiness["required_done"] < readiness["required_total"]


def test_a_google_twin_can_be_settled_the_same_way_a_duplicate_is(client, run):
    """Name matching cannot pair "Wingman [Barranco]" with "Wigman Alitas
    Inc.", and on the real wings board those two are one bar on Bolognesi 494.

    The Place ID finds them. The card then has to be able to offer the keep-one
    action over them, or the only warning the operator can act on is one they
    have to act on by hand.
    """
    cards = list(_cards(client, run).values())
    first, second = cards[0], cards[1]
    stored = store.load_google_checks(run)
    twin = dict(stored[first["candidate_id"]])
    twin["place_id"] = stored[second["candidate_id"]]["place_id"]
    store.save_google_check(run, first["candidate_id"], twin)

    readiness = _cards(client, run)[first["name"]]["readiness"]
    assert readiness["identity_twins"] == [second["candidate_id"]]

    # Settled the existing way: one of them stays, the other comes off.
    service.resolve_duplicates(
        run,
        first["candidate_id"],
        same=[second["candidate_id"]],
        different=[],
        keep=first["candidate_id"],
    )
    after = _cards(client, run)[first["name"]]["readiness"]
    assert after["identity_twins"] == []
    assert "identity_conflict" not in {b["code"] for b in after["blockers"]}


def test_calling_two_google_twins_different_places_settles_it(client, run):
    """The operator looked at two cards and said they are different places.
    That is an answer, and an answered question leaves the card.

    It used to stay, on the grounds that if they are two venues then one of
    them is matched to the wrong building. True, and not worth saying twice:
    the warning landed on the card that was RIGHT as well as the one that was
    wrong, and nothing the operator could do would clear it. They are asked
    once, at the tick that says this is the correct place and branch.
    """
    cards = list(_cards(client, run).values())
    first, second = cards[0], cards[1]
    stored = store.load_google_checks(run)
    twin = dict(stored[first["candidate_id"]])
    twin["place_id"] = stored[second["candidate_id"]]["place_id"]
    store.save_google_check(run, first["candidate_id"], twin)
    assert "identity_conflict" in {
        b["code"] for b in _cards(client, run)[first["name"]]["readiness"]["blockers"]
    }

    service.resolve_duplicates(
        run, first["candidate_id"], same=[], different=[second["candidate_id"]]
    )

    after = _cards(client, run)[first["name"]]["readiness"]
    assert "identity_conflict" not in {b["code"] for b in after["blockers"]}
    # And it stops being counted, so the card does not wear a mark for it.
    assert after["required_total"] == 2
    # And the other card is settled by the same decision, not left carrying it.
    other = _cards(client, run)[second["name"]]["readiness"]
    assert "identity_conflict" not in {b["code"] for b in other["blockers"]}


def test_a_settled_duplicate_leaves_no_mark_on_the_card(client, run):
    """A finished card should read as finished, not as one that once had
    trouble. Where the decision went is Removed places; the card itself moves
    on."""
    cards = list(_cards(client, run).values())
    first, second = cards[0], cards[1]
    found = service.progress(run)
    paired = dict(found)
    for candidate in paired["candidates"]:
        other = second if candidate["candidate_id"] == first["candidate_id"] else first
        if candidate["candidate_id"] in {first["candidate_id"], second["candidate_id"]}:
            candidate["possible_duplicate_ids"] = [other["candidate_id"]]

    import app.features.listicle_pipeline.service as service_module

    original = service_module.progress
    try:
        service_module.progress = lambda run_id: (
            paired if run_id == run else original(run_id)
        )
        # While it stands, it is a required check and it blocks.
        open_state = _prepare(client, run, first["candidate_id"])["readiness"]
        assert open_state["required_total"] == 3
        assert "duplicates_open" in {b["code"] for b in open_state["blockers"]}

        service.resolve_duplicates(
            run, first["candidate_id"], same=[], different=[second["candidate_id"]]
        )
        settled = _cards(client, run)[first["name"]]["readiness"]
        assert settled["required_total"] == 2
        assert settled["required_done"] == 2
        assert settled["ready"] is True
    finally:
        service_module.progress = original


def test_one_place_can_be_looked_up_again_when_google_matched_it_wrong(client, run):
    """The ordinary check never re-asks about a place already answered for,
    which leaves no way out of a wrong match. This is that way out: one lookup,
    for one place."""
    cards = list(_cards(client, run).values())
    first = cards[0]
    asked: list[tuple] = []

    def elsewhere(name, city, district=""):
        asked.append((name, city, district))
        return identity.Lookup(
            "found",
            identity.ResolvedPlace(
                place_id="place-the-right-one",
                name=name,
                address="Somewhere else entirely 900",
                types=("restaurant",),
                business_status="OPERATIONAL",
            ),
        )

    _prepare(client, run, first["candidate_id"])
    assert _cards(client, run)[first["name"]]["readiness"]["ready"] is True

    service.recheck_on_google(run, first["candidate_id"], lookup=elsewhere)

    assert len(asked) == 1
    after = _cards(client, run)[first["name"]]["readiness"]
    assert after["place_id"] == "place-the-right-one"
    # The confirmations were made about a different building, so they are stale
    # rather than carried across.
    assert {"identity_stale", "open_stale"} <= {b["code"] for b in after["blockers"]}


def test_a_second_lookup_does_not_re_raise_a_warning_already_overruled(client, run):
    """Putting a place back overrules Google. Asking which building it is must
    not undo that."""
    cards = list(_cards(client, run).values())
    first = cards[0]
    store.dismiss_closed(run, first["candidate_id"])

    def same_place(name, city, district=""):
        return _resolved(name, city, district)

    service.recheck_on_google(run, first["candidate_id"], lookup=same_place)
    assert store.load_google_checks(run)[first["candidate_id"]]["closed_dismissed"]
