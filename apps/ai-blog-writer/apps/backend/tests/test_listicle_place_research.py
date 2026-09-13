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
import re
from datetime import datetime, timezone

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
    # The reader and the extraction call are replaced for every test in this
    # module. A test that left either real would reach the web from a suite
    # whose whole promise is that it does not.
    monkeypatch.setattr(listicle_api, "_read_pages", _Reader())
    monkeypatch.setattr(listicle_api, "_extract_call", _Extract())
    # Google's reviews are a paid call on the owner's account. Off by default
    # here; the tests that are about reviews put their own back.
    monkeypatch.setattr(profile_service, "fetch_reviews", _no_reviews)
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


def _no_reviews(place_id: str, **_kwargs):
    """The reviews API, asked nothing. The default for every test that is not
    about reviews, so no test reaches a billed endpoint by forgetting to."""
    from app.features.listicle_pipeline.reviews_api import ReviewFetch

    return ReviewFetch(place_id, failed=True, reason="not in this test")


def _reviews(*written: tuple[str, int, str]):
    """The reviews API, answering with the reviews a test names."""
    from app.features.listicle_pipeline.reviews_api import ReviewFetch

    def answer(place_id: str, **_kwargs):
        return ReviewFetch(
            business_id=place_id,
            place_name="Example Wings",
            reviews=[
                {
                    "author_name": who,
                    "rating": stars,
                    "review_text": text,
                    "review_datetime_utc": "2025-06-15T12:00:00.000Z",
                    "review_timestamp": 1750000000,
                    "review_link": "https://www.google.com/maps/reviews/data=!x",
                    "author_review_count": 12,
                }
                for who, stars, text in written
            ],
            objects=len(written),
        )

    return answer


class _Transport:
    """The grounded search, counting itself and answering with whatever it was
    handed. One of the three things standing where the outside world would be."""

    def __init__(self, reply: object = None, results: list[dict] | None = None):
        self.calls = 0
        self.prompts: list[str] = []
        self.reply = reply
        self.results = results

    def __call__(self, prompt: str):
        self.calls += 1
        self.prompts.append(prompt)
        if isinstance(self.reply, Exception):
            raise self.reply
        if callable(self.reply):
            return self.reply(prompt)
        text = self.reply if isinstance(self.reply, str) else _DISCOVERY
        # Unless a test says otherwise, the search returned exactly the pages
        # its answer names. Only a result's address is ever opened, so a stub
        # with no results would read nothing at all.
        results = (
            self.results
            if self.results is not None
            else [
                {"uri": url, "title": url.split("/")[2]}
                for url in dict.fromkeys(re.findall(r'https?://[^"\s]+', text))
            ]
        )
        return profile_service.TransportResult(
            text=text,
            model="stub-search",
            usage={"total_tokens": 1234},
            actual_queries=["alitas jesus maria"],
            finish_reason="STOP",
            grounding_chunks=results,
        )


class _Extract:
    """The extraction call. Separate from the search because it is a separate
    charge, and every test that counts money counts them apart."""

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
            text=self.reply if isinstance(self.reply, str) else _EXTRACTION,
            model="stub-extract",
            usage={"total_tokens": 2048},
        )


# What each stub page contains. The extraction fixture quotes from these, so a
# passage check that works is one the pages really support -- a fixture whose
# excerpts are absent from its own pages would make every test agree with a
# broken checker.
_PAGES = {
    "https://press.test/wings-review": (
        "El Comercio. Av. Test 1, Barranco. La cocina frie sus alitas dos veces "
        "y las termina en un glaseado de rocoto hecho en casa. Seis piezas "
        "cuestan S/ 25.00 en el local. Carlos Ruiz, abril de 2025: son las "
        "mejores alitas del barrio."
    ),
    "https://guide.test/best-wings": (
        "Lima Gourmet 2023. Premio a las mejores alitas de Lima para esta marca."
    ),
    "https://otra.test/huancayo": (
        "Sede Huancayo. Alitas 8 piezas S/ 19.00 por delivery."
    ),
}


class _Reader:
    """The page reader, answering from a fixed shelf of pages.

    Anything not on the shelf comes back `blocked` rather than raising: an
    unreachable page is an ordinary outcome of a research action, and a reader
    that throws would turn one into a failed request.
    """

    def __init__(self, shelf: dict | None = None, blocked: set | None = None):
        self.shelf = dict(_PAGES if shelf is None else shelf)
        self.blocked = set(blocked or ())
        self.asked: list[str] = []

    def __call__(self, urls, *, budget, already_read=None):
        from app.features.listicle_pipeline.source_reader import PageRead, normalise

        held = dict(already_read or {})
        out: list[PageRead] = []
        spent = 0
        for url, origin in urls:
            self.asked.append(url)
            key = normalise(url)
            if key in held:
                reused = held[key]
                out.append(
                    PageRead(
                        requested_url=url,
                        final_url=reused.final_url,
                        state=reused.state,
                        text=reused.text,
                        title=reused.title,
                        published_at=reused.published_at,
                        retrieved_at=reused.retrieved_at,
                        origin=origin,
                        reused=True,
                    )
                )
                continue
            if spent >= budget:
                out.append(
                    PageRead(
                        requested_url=url,
                        final_url=url,
                        state="budget_exhausted",
                        origin=origin,
                        note=(
                            f"This attempt's {budget}-page reading budget was "
                            "already spent. The page is an unread lead."
                        ),
                    )
                )
                continue
            spent += 1
            if url in self.blocked or url not in self.shelf:
                out.append(
                    PageRead(
                        requested_url=url,
                        final_url=url,
                        state="blocked",
                        http_status=403,
                        origin=origin,
                        note="The page answered 403.",
                    )
                )
                continue
            out.append(
                PageRead(
                    requested_url=url,
                    final_url=url,
                    state="ok",
                    http_status=200,
                    title=url.rsplit("/", 1)[-1],
                    text=self.shelf[url],
                    published_at="2025-04-02",
                    retrieved_at=datetime(2026, 9, 12, tzinfo=timezone.utc),
                    origin=origin,
                )
            )
        return out


_DISCOVERY = json.dumps(
    {
        "pages": [
            {
                "url": "https://press.test/wings-review",
                "publisher": "El Comercio",
                "type": "press",
                "title": "Las mejores alitas",
                "published_at": "2025-04-02",
                "answers": [1, 2, 3],
                "passage": "doble fritura y glaseado de rocoto",
                "scope": "branch",
                "why": "a review of the wings",
            },
            {
                "url": "https://guide.test/best-wings",
                "publisher": "Lima Gourmet",
                "type": "press",
                "published_at": "2023-11-01",
                "answers": [3],
                "passage": "premio a las mejores alitas",
                "scope": "brand",
                "why": "an award",
            },
        ],
        "searched": ["alitas jesus maria"],
        "not_found": [],
        "notes": [],
    },
    ensure_ascii=False,
)


_EXTRACTION = json.dumps(
    {
        "claims": [
            {
                "text": "The kitchen fries its wings twice and finishes them in "
                "a rocoto glaze made in house.",
                "kind": "signature",
                "categories": ["signature_offering", "preparation"],
                "about_subject": True,
                "scope": "branch",
                "scope_basis": "the page carries Av. Test 1, Barranco",
                "who_said_it": "publication",
                "who_name": "El Comercio",
                "channel": "unknown",
                "temporal_type": "current_offering",
                "support": [
                    {
                        "page_id": "p1",
                        "excerpt": "frie sus alitas dos veces y las termina en un "
                        "glaseado de rocoto hecho en casa",
                    }
                ],
            },
            {
                "text": "Named best wings in Lima by Lima Gourmet in 2023.",
                "kind": "award",
                "categories": ["recognition"],
                "about_subject": True,
                "scope": "brand",
                "who_said_it": "publication",
                "who_name": "Lima Gourmet",
                "event_date": "2023",
                "temporal_type": "historical",
                "support": [
                    {
                        "page_id": "p2",
                        "excerpt": "Premio a las mejores alitas de Lima para esta marca",
                    }
                ],
            },
            {
                "text": "A regular says the portions have got smaller this year.",
                "kind": "review",
                "categories": ["customer_observations", "value_portions"],
                "about_subject": True,
                "scope": "branch",
                "who_said_it": "anonymous_customer",
                "temporal_type": "observation",
                "support": [
                    {"page_id": "p1", "excerpt": "las porciones se han reducido"}
                ],
            },
        ],
        "coverage": [
            {"category": "signature_offering", "state": "covered", "note": "menu found"},
            {"category": "history", "state": "not_found", "note": "nothing published"},
        ],
        "unresolved": ["Who opened it?"],
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
        listicle_api, "_research_call", _Transport(f"```json\n{_DISCOVERY}\n```")
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
    """One sentence found on two pages is one finding with two sources.

    The second page is a different publication saying the same thing, which is
    what a refresh actually turns up. Storing it twice would make a profile
    look twice as well evidenced as it is.
    """
    run_id, candidate_id, profile_id = researched
    before = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    elsewhere = "https://otro.test/tambien-alitas"
    discovery = json.loads(_DISCOVERY)
    discovery["pages"] = [
        {
            "url": elsewhere,
            "publisher": "Publimetro",
            "type": "press",
            "published_at": "2025-06-01",
            "answers": [2],
            "passage": "glaseado de rocoto",
            "scope": "branch",
            "why": "the same preparation, elsewhere",
        }
    ]
    extraction = json.loads(_EXTRACTION)
    extraction["claims"] = [
        {
            **extraction["claims"][0],
            "support": [
                {
                    "page_id": "p1",
                    "excerpt": "frie sus alitas dos veces y las termina en un "
                    "glaseado de rocoto hecho en casa",
                }
            ],
        }
    ]
    monkeypatch.setattr(
        listicle_api,
        "_read_pages",
        _Reader({elsewhere: _PAGES["https://press.test/wings-review"]}),
    )
    monkeypatch.setattr(
        listicle_api, "_research_call", _Transport(json.dumps(discovery))
    )
    monkeypatch.setattr(
        listicle_api, "_extract_call", _Extract(json.dumps(extraction))
    )
    client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "twice-key-0001", "mode": "refresh"},
    )
    after = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    assert len(after["findings"]) == len(before["findings"])
    glaze = next(f for f in after["findings"] if "rocoto" in f["text"])
    assert {item["url"] for item in glaze["evidence"]} == {
        "https://press.test/wings-review",
        elsewhere,
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

    bar_page = "https://press.test/chilcano"
    discovery = json.dumps(
        {
            "pages": [
                {
                    "url": bar_page,
                    "publisher": "El Comercio",
                    "type": "press",
                    "published_at": "2026-01-05",
                    "answers": [1],
                    "passage": "chilcano de rocoto macerado en casa",
                    "scope": "branch",
                    "why": "the drinks list",
                }
            ],
            "searched": ["chilcano"],
            "not_found": [],
            "notes": [],
        }
    )
    cocktails = json.dumps(
        {
            "claims": [
                {
                    "text": "The bar makes a chilcano with house-macerated rocoto.",
                    "kind": "signature",
                    "categories": ["drinks"],
                    "about_subject": True,
                    "scope": "branch",
                    "who_said_it": "publication",
                    "temporal_type": "current_offering",
                    "support": [
                        {
                            "page_id": "p1",
                            "excerpt": "chilcano con rocoto macerado en la casa",
                        }
                    ],
                }
            ],
            "coverage": [],
            "unresolved": [],
        }
    )
    monkeypatch.setattr(
        listicle_api,
        "_read_pages",
        _Reader(
            {
                bar_page: "Av. Test 1, Barranco. La barra prepara un chilcano "
                "con rocoto macerado en la casa."
            }
        ),
    )
    monkeypatch.setattr(listicle_api, "_research_call", _Transport(discovery))
    monkeypatch.setattr(listicle_api, "_extract_call", _Extract(cocktails))
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
    assert attempt["model"] == "stub-search"
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
    """A date this pipeline cannot read is one it must not repeat."""
    from app.features.listicle_pipeline import profile_research

    parsed = profile_research.parse_discovery(
        json.dumps(
            {
                "pages": [
                    {
                        "url": "https://press.test/history",
                        "publisher": "El Comercio",
                        "published_at": "the eighties",
                    }
                ]
            }
        )
    )
    assert parsed.pages[0].published_at == ""
    assert any("not a date" in issue for issue in parsed.issues)


def test_a_dropped_row_is_never_reported_as_a_clean_extraction(isolated_db):
    """An extraction that reports itself clean while losing rows is worse than
    one that fails: the loss is invisible and the number looks fine."""
    from app.features.listicle_pipeline import profile_research

    parsed = profile_research.parse_discovery(
        json.dumps(
            {
                "pages": [
                    {"url": "not-a-url", "publisher": "Somebody"},
                    {"url": "https://press.test/real", "publisher": "El Comercio"},
                ]
            }
        )
    )
    assert len(parsed.pages) == 1
    assert len(parsed.issues) == 1


def test_a_claim_citing_a_page_nobody_collected_loses_that_citation(isolated_db):
    """The check that makes an invented source impossible rather than caught.

    Extraction has no search tool and is handed page ids p1..pN. A citation to
    anything else is a citation to a page this request never held.
    """
    from app.features.listicle_pipeline import evidence, research_brief
    from app.features.listicle_pipeline.source_reader import PageRead

    brief = research_brief.build_brief(
        name="Somewhere",
        aliases=[],
        city="Lima",
        district="Barranco",
        address="Av. Test 1, Barranco",
        place_id="pid",
        article_title="",
        topic="wings",
        topic_label="chicken wings",
        standard="",
        exclusions="",
        mode="initial",
        gap_text="",
        discovery_leads=[],
        held=[],
        operator_links=[],
    )
    page = PageRead(
        requested_url="https://press.test/a",
        final_url="https://press.test/a",
        state="ok",
        text="Av. Test 1, Barranco. Las alitas se ahuman por cuatro horas.",
    )
    packet = evidence.check(
        {
            "claims": [
                {
                    "text": "The wings are smoked for four hours.",
                    "support": [
                        {"page_id": "p1", "excerpt": "alitas se ahuman por cuatro horas"}
                    ],
                },
                {
                    "text": "It won a prize nobody collected a page about.",
                    "support": [{"page_id": "p9", "excerpt": "premio"}],
                },
            ]
        },
        brief=brief,
        pages=[page],
    )
    smoked, invented = packet.claims
    assert smoked.validation == "evidence_ready"
    assert invented.validation == "unsupported"
    assert any("not a page this request collected" in note for note in invented.notes)


def test_a_truncated_reply_reports_the_real_problem(isolated_db):
    """A reply cut off mid-object arrives still wearing its opening fence.

    Stripping only a CLOSED fence made the error read "this is not JSON at
    all", which sends whoever reads it looking for a formatting problem when
    the actual one is a response budget. The first time it happened for real
    -- La Casa de las Alitas, 3,843 output tokens against a 3,072 cap -- that
    was the whole diagnosis.
    """
    from app.features.listicle_pipeline import profile_research

    cut = '```json\n{"pages": [{"url": "https://press.test/las-once-alitas-de-la'
    with pytest.raises(profile_research.ResponseInvalid) as raised:
        profile_research.parse_discovery(cut)
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
    brief = profile_research.brief_of(request)
    assert brief.published_name == "Barbarian"
    queries = brief.illustrative_queries
    assert any(line.startswith("Barbarian") for line in queries)
    assert any("BarBarian Bonilla 108" in line for line in queries)
    prompt = profile_research.build_discovery_prompt(brief)
    assert "Also written as: Barbarian." in prompt


def test_a_narrow_follow_up_asks_only_what_it_was_given(isolated_db):
    """A gap request that also asks for the room spends its length on the room.

    The version before this sent four fixed directions whatever was asked, so
    "find a dated customer review" arrived alongside the menu, the preparation
    and the street.
    """
    from app.features.listicle_pipeline import profile_research

    request = profile_research.ResearchRequest(
        name="Somewhere",
        city="Lima",
        topic="chicken-wings",
        topic_label="chicken wings",
        mode="gap",
        gap_text="Find one dated customer review that names the wings.",
    )
    brief = profile_research.brief_of(request)
    assert brief.priority_questions == [
        "Find one dated customer review that names the wings."
    ]
    prompt = profile_research.build_discovery_prompt(brief)
    assert "Look for this and nothing else" in prompt
    # The room is named once, and only to say it does not count as coverage.
    # Nothing asks for it: the four standing directions the old template sent
    # whatever was asked are gone.
    assert "local food writing" not in prompt
    assert prompt.count("the room") == 1
    assert "may be collected and does not count" in prompt


def test_a_discovery_lead_carries_the_search_that_produced_it(isolated_db):
    """The angle is why this place is a candidate and it says where to dig.

    Dropping it made a place found by "still serving wings after midnight" and
    one found by "ají amarillo instead of Buffalo sauce" into the same request.
    """
    from app.features.listicle_pipeline import profile_research

    request = profile_research.ResearchRequest(
        name="Somewhere",
        city="Lima",
        topic="chicken-wings",
        topic_label="chicken wings",
        sightings=[
            {
                "snippet": "bar, wings, open until 3am",
                "angle": "Lima bars still serving wings after midnight",
                "attempt_id": "627fb0e7d4a3",
            }
        ],
    )
    prompt = profile_research.build_discovery_prompt(
        profile_research.brief_of(request)
    )
    assert "bar, wings, open until 3am" in prompt
    assert "[from: Lima bars still serving wings after midnight]" in prompt
    assert "UNVERIFIED" in prompt


def test_a_shared_discovery_pool_never_becomes_a_citation(isolated_db):
    """Nine searches returned nine pools of URLs, each belonging to a
    multi-place search. Nothing in a pool says which URL is about which place,
    and zipping urls against titles produced attributions nobody checked."""
    from app.features.listicle_pipeline import profile_research

    request = profile_research.ResearchRequest(
        name="Somewhere",
        city="Lima",
        topic="chicken-wings",
        sightings=[
            {
                "snippet": "craft beer and alitas to share",
                "angle": "Craft beer taprooms that pair their own beers with wings",
                "attempt_id": "dd36f5fca2d7",
            }
        ],
    )
    brief = profile_research.brief_of(request)
    # The pool's attempt id travels with the lead as provenance, and the lead
    # is a lead: it contributes no source and no page to open.
    assert brief.discovery_leads[0].attempt_id == "dd36f5fca2d7"
    assert brief.discovery_leads[0].status == "unverified_lead"
    assert brief.known_source_leads == []


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


def test_a_page_that_could_not_be_read_is_recorded_as_that(client, ready, monkeypatch):
    """`blocked` is not `not_found`. One says the material exists and we could
    not read it; the other would be a statement about the place.

    The version before this could not tell them apart at all: a source the
    model said it could not reach and a subject nothing is published about both
    arrived as an empty list.
    """
    run_id, candidate_id, _ = ready
    discovery = json.dumps(
        {
            "pages": [
                {
                    "url": "https://paywalled.test/summum",
                    "publisher": "Summum",
                    "type": "press",
                    "answers": [3],
                    "why": "an award listing",
                }
            ],
            "searched": ["summum alitas"],
            "not_found": ["Nothing published names the preparation."],
            "notes": [],
        }
    )
    reader = _Reader({})  # an empty shelf: every page answers 403
    monkeypatch.setattr(listicle_api, "_read_pages", reader)
    monkeypatch.setattr(listicle_api, "_research_call", _Transport(discovery))
    extract = _Extract()
    monkeypatch.setattr(listicle_api, "_extract_call", extract)
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "inaccessible-01"},
    ).json()
    attempt = client.get(
        f"{BASE}/research-attempts/{body['attempt']['attempt_id']}"
    ).json()
    assert [page["state"] for page in attempt["pages"]] == ["blocked"]
    assert attempt["pages"][0]["http_status"] == 403
    # Nothing readable came back, so there was nothing to extract from and no
    # second generation was bought to restate the search's own answer.
    assert extract.calls == 0
    assert body["attempt"]["state"] == "completed_empty"
    assert body["attempt"]["reason_code"] == "no_readable_source"
    assert "about access" in body["attempt"]["reason"]
    assert body["attempt"]["generations"] == 1


def test_what_the_search_reported_is_kept_apart_from_what_pages_say(
    client, ready, monkeypatch
):
    """A provider snippet is the provider's transcription of a page.

    Stored as discovery, never promoted to a citation: a page that could not be
    opened contributes nothing to a finding however confidently it was
    described.
    """
    run_id, candidate_id, _ = ready
    discovery = json.dumps(
        {
            "pages": [
                {
                    "url": "https://paywalled.test/summum",
                    "publisher": "Summum",
                    "answers": [3],
                    "passage": "las mejores alitas de Lima, dice Summum",
                    "why": "an award listing",
                }
            ],
            "searched": ["summum alitas"],
            "not_found": [],
            "notes": [],
        }
    )
    monkeypatch.setattr(listicle_api, "_read_pages", _Reader({}))
    monkeypatch.setattr(listicle_api, "_research_call", _Transport(discovery))
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "snippet-only-01"},
    ).json()
    attempt = client.get(
        f"{BASE}/research-attempts/{body['attempt']['attempt_id']}"
    ).json()
    assert (
        attempt["discovery"]["pages"][0]["provider_snippet"]
        == "las mejores alitas de Lima, dice Summum"
    )
    profile = client.get(
        f"{BASE}/profiles/{body['attempt']['profile_id']}/research"
    ).json()
    assert profile["findings"] == []
    assert profile["sources"] == []


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


# --------------------------------------------------------------------------
# The budget, and what survives a failure inside it
# --------------------------------------------------------------------------


def test_one_press_is_at_most_two_generations_and_says_which(client, ready, monkeypatch):
    """The ceiling ADR 0040 sets, checked as a count rather than as a promise.

    One grounded search, one extraction over the text it named, and no path
    through the action that makes a third.
    """
    run_id, candidate_id, _ = ready
    search, extract = _Transport(), _Extract()
    monkeypatch.setattr(listicle_api, "_research_call", search)
    monkeypatch.setattr(listicle_api, "_extract_call", extract)
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "budget-key-0001"},
    ).json()
    assert search.calls == 1
    assert extract.calls == 1
    assert body["attempt"]["generations"] == 2
    assert body["attempt"]["grounded_calls"] == 1
    stages = [receipt["stage"] for receipt in body["attempt"]["receipts"]]
    assert stages == ["discovery", "extraction"]
    assert all(
        receipt["outcome"] == "ok" for receipt in body["attempt"]["receipts"]
    )


def test_the_reading_budget_is_a_ceiling_and_an_unread_lead_says_so(
    client, ready, monkeypatch
):
    run_id, candidate_id, _ = ready
    from app.features.listicle_pipeline import source_reader

    many = [
        {
            "url": f"https://press.test/page-{index}",
            "publisher": "El Comercio",
            "why": "one of many",
        }
        for index in range(12)
    ]
    shelf = {
        page["url"]: "C. Test 1, Barranco. Alitas picantes en carta."
        for page in many
    }
    monkeypatch.setattr(listicle_api, "_read_pages", _Reader(shelf))
    monkeypatch.setattr(
        listicle_api,
        "_research_call",
        _Transport(json.dumps({"pages": many, "searched": [], "not_found": []})),
    )
    monkeypatch.setattr(
        listicle_api,
        "_extract_call",
        _Extract(json.dumps({"claims": [], "coverage": [], "unresolved": []})),
    )
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "page-budget-001"},
    ).json()
    attempt = client.get(
        f"{BASE}/research-attempts/{body['attempt']['attempt_id']}"
    ).json()
    fetched = [page for page in attempt["pages"] if page["state"] != "budget_exhausted"]
    unread = [page for page in attempt["pages"] if page["state"] == "budget_exhausted"]
    assert len(fetched) == source_reader.PAGE_BUDGET
    # Past the ceiling a page is an unread lead, said as one. Silently
    # truncating the list would report full coverage of a partial read.
    assert unread
    assert "budget was" in unread[0]["note"]


def test_a_failed_extraction_keeps_the_pages_and_buys_no_second_search(
    client, ready, monkeypatch
):
    """The reason `extract_only` exists. The expensive half already ran."""
    run_id, candidate_id, _ = ready
    search = _Transport()
    extract = _Extract(RuntimeError("the extraction call went away"))
    monkeypatch.setattr(listicle_api, "_research_call", search)
    monkeypatch.setattr(listicle_api, "_extract_call", extract)
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "extract-fail-01"},
    ).json()
    assert body["attempt"]["state"] == "failed"
    assert body["attempt"]["reason_code"] == "extraction_failed"
    assert search.calls == 1
    assert extract.calls == 1
    attempt = client.get(
        f"{BASE}/research-attempts/{body['attempt']['attempt_id']}"
    ).json()
    # The pages survive the failure, and the receipt says which call died.
    assert [page["state"] for page in attempt["pages"]] == ["ok", "ok"]
    outcomes = {r["stage"]: r["outcome"] for r in attempt["receipts"]}
    assert outcomes == {"discovery": "ok", "extraction": "failed"}


def test_extract_only_re_reads_what_was_collected_and_buys_no_search(
    client, ready, monkeypatch
):
    run_id, candidate_id, _ = ready
    search, extract = _Transport(), _Extract()
    monkeypatch.setattr(listicle_api, "_research_call", search)
    monkeypatch.setattr(listicle_api, "_extract_call", extract)
    # Something to re-read: the operator's own link, which is read before any
    # search and is therefore available with none.
    client.put(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/prep",
        json={
            "source_links": [
                {"label": "the menu", "url": "https://press.test/wings-review"}
            ]
        },
    )
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "extract-only-01", "mode": "extract_only"},
    ).json()
    assert search.calls == 0
    assert extract.calls == 1
    assert body["attempt"]["grounded_calls"] == 0
    assert body["attempt"]["generations"] == 1
    skipped = next(
        r for r in body["attempt"]["receipts"] if r["stage"] == "discovery"
    )
    assert skipped["outcome"] == "skipped"
    assert "buy no search" in skipped["reason"]


def _counting(answer):
    """A reviews stub that also counts how often the paid call was made."""
    calls: list[str] = []

    def fetch(place_id: str, **kwargs):
        calls.append(place_id)
        return answer(place_id, **kwargs)

    fetch.calls = calls
    return fetch


def test_the_reviews_are_written_down_before_the_search_is_bought(
    client, ready, monkeypatch
):
    """BarBarian, 2026-09-12: twenty reviews bought, then a search that looped
    until its token ceiling. The attempt kept only a note saying the reviews
    had existed, and the one way to read them again was to buy them again."""
    from app.features.listicle_pipeline import research_store

    run_id, candidate_id, _ = ready
    monkeypatch.setattr(
        profile_service,
        "fetch_reviews",
        _reviews(
            ("Carlos Ruiz", 5, "Las alitas picantes son las mejores del barrio.")
        ),
    )
    held_while_searching: list[str] = []

    def search_that_dies(prompt):
        running = research_store.load(research_store.active().attempt_id)
        held_while_searching.extend(running.page_texts.values())
        raise RuntimeError("the search took the process with it")

    monkeypatch.setattr(listicle_api, "_research_call", _Transport(search_that_dies))
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "reviews-kept-01"},
    ).json()
    assert body["attempt"]["state"] == "failed"
    assert any("alitas picantes" in text for text in held_while_searching)
    kept = research_store.load(body["attempt"]["attempt_id"]).page_texts
    assert any("alitas picantes" in text for text in kept.values())
    # The text is stored, not served: a screen reading the attempt never
    # carries it.
    attempt = client.get(
        f"{BASE}/research-attempts/{body['attempt']['attempt_id']}"
    ).json()
    assert "page_texts" not in attempt


def test_extract_only_re_reads_the_reviews_and_buys_none(client, ready, monkeypatch):
    run_id, candidate_id, _ = ready
    reviews = _counting(
        _reviews(("Carlos Ruiz", 5, "Las alitas picantes son las mejores del barrio."))
    )
    monkeypatch.setattr(profile_service, "fetch_reviews", reviews)
    # What Flash sent back on BarBarian: a URL of zeros, cut at the ceiling.
    looped = '```json\n{\n  "pages": [ {"url": "https://x.test/1000000000000'
    search, extract = _Transport(looped), _Extract()
    monkeypatch.setattr(listicle_api, "_research_call", search)
    monkeypatch.setattr(listicle_api, "_extract_call", extract)
    first = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "reviews-recover-01"},
    ).json()
    assert first["attempt"]["state"] == "response_invalid"
    assert len(reviews.calls) == 1 and extract.calls == 0

    again = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "reviews-recover-02", "mode": "extract_only"},
    ).json()
    assert len(reviews.calls) == 1
    assert search.calls == 1
    assert extract.calls == 1
    assert "REVIEW by Carlos Ruiz" in extract.prompts[0]
    attempt = client.get(
        f"{BASE}/research-attempts/{again['attempt']['attempt_id']}"
    ).json()
    kept = next(p for p in attempt["pages"] if p["origin"] == "google_reviews")
    assert kept["reused"] is True
    assert first["attempt"]["attempt_id"] in kept["note"]
    skipped = next(r for r in attempt["receipts"] if r["stage"] == "discovery")
    assert "without buying them again" in skipped["reason"]


def test_the_page_opened_is_the_search_result_not_the_address_typed(
    client, ready, monkeypatch
):
    run_id, candidate_id, _ = ready
    answer = json.dumps(
        {
            "pages": [
                {
                    "site": "press.test",
                    "url": "https://press.test/restaurantes/1000000000",
                    "title": "Las mejores alitas",
                    "passage": "doble fritura y glaseado de rocoto",
                }
            ]
        }
    )
    search = _Transport(
        answer, results=[{"uri": "https://press.test/wings-review", "title": "press.test"}]
    )
    reader = _Reader()
    monkeypatch.setattr(listicle_api, "_research_call", search)
    monkeypatch.setattr(listicle_api, "_read_pages", reader)
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "anchored-01"},
    ).json()
    assert "https://press.test/wings-review" in reader.asked
    assert not any("1000000000" in url for url in reader.asked)
    # The prompt no longer asks for an address to be typed at all.
    assert "Do not write web addresses" in search.prompts[0]
    assert "publisher's own URL" not in search.prompts[0]
    attempt = client.get(
        f"{BASE}/research-attempts/{body['attempt']['attempt_id']}"
    ).json()
    # What the search really returned is kept, so matching can be checked
    # later without buying the search again.
    assert attempt["discovery"]["results"] == [
        {"uri": "https://press.test/wings-review", "title": "press.test"}
    ]
    assert attempt["discovery"]["pages"][0]["address_from"] == "search"


def test_a_second_press_within_a_month_rereads_the_reviews_it_bought(
    client, ready, monkeypatch
):
    """Every retest of a pilot place spent another twenty reviews it already
    held, against an allowance that never resets."""
    run_id, candidate_id, _ = ready
    reviews = _counting(
        _reviews(("Carlos Ruiz", 5, "Las alitas picantes son las mejores del barrio."))
    )
    monkeypatch.setattr(profile_service, "fetch_reviews", reviews)
    monkeypatch.setattr(listicle_api, "_research_call", _Transport())
    for key in ("reuse-reviews-01", "reuse-reviews-02"):
        body = client.post(
            f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
            json={"idempotency_key": key, "mode": "refresh"},
        ).json()
    assert len(reviews.calls) == 1
    attempt = client.get(
        f"{BASE}/research-attempts/{body['attempt']['attempt_id']}"
    ).json()
    kept = next(p for p in attempt["pages"] if p["origin"] == "google_reviews")
    assert kept["reused"] is True
    assert "not bought again" in kept["note"]


def test_reviews_older_than_the_reuse_window_are_bought_again(
    client, ready, monkeypatch
):
    run_id, candidate_id, _ = ready
    reviews = _counting(
        _reviews(("Carlos Ruiz", 5, "Las alitas picantes son las mejores del barrio."))
    )
    monkeypatch.setattr(profile_service, "fetch_reviews", reviews)
    monkeypatch.setattr(listicle_api, "_research_call", _Transport())
    monkeypatch.setattr(profile_service, "REVIEWS_REUSE_DAYS", 0)
    for key in ("stale-reviews-01", "stale-reviews-02"):
        client.post(
            f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
            json={"idempotency_key": key, "mode": "refresh"},
        )
    assert len(reviews.calls) == 2


def test_a_failed_search_never_reaches_the_extraction_call(
    client, ready, monkeypatch
):
    run_id, candidate_id, _ = ready
    extract = _Extract()
    monkeypatch.setattr(
        listicle_api, "_research_call", _Transport(RuntimeError("the network went"))
    )
    monkeypatch.setattr(listicle_api, "_extract_call", extract)
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "search-fail-01"},
    ).json()
    assert body["attempt"]["state"] == "failed"
    assert extract.calls == 0
    # The search is still counted as a generation: a call that did not come
    # back may well have been charged for, and a receipt that hides it is a
    # receipt that cannot be reconciled against a bill.
    assert body["attempt"]["generations"] == 1
    failed = body["attempt"]["receipts"][0]
    assert failed["stage"] == "discovery" and failed["outcome"] == "failed"
    assert len(body["attempt"]["receipts"]) == 1


def test_the_strategy_version_records_prompt_brief_and_checks_together(
    client, ready, monkeypatch
):
    """A packet is reproducible only when all three are known, and a
    comparison between two packets is only honest when it can say which
    of the three moved."""
    run_id, candidate_id, _ = ready
    monkeypatch.setattr(listicle_api, "_research_call", _Transport())
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "strategy-key-01"},
    ).json()
    version = body["attempt"]["strategy_version"]
    assert "place-research/" in version
    assert "research-brief/" in version
    assert "evidence-extract/" in version


def test_held_findings_are_offered_to_check_never_suppressed(client, ready, monkeypatch):
    """A retest has to return a complete packet, including what is already held.

    The prompt this replaces said "Findings already held -- do not repeat
    these", which makes a second pass look thin for the wrong reason: the
    material is there, it was simply forbidden. Held findings are now leads to
    verify, and the comparison reports the whole packet beside the net new rows.
    """
    from app.features.listicle_pipeline import profile_research

    request = profile_research.ResearchRequest(
        name="Somewhere",
        city="Lima",
        topic="chicken-wings",
        topic_label="chicken wings",
        existing_findings=[
            {
                "text": "The wings are smoked for four hours.",
                "version": 2,
                "curation": "kept",
                "attributed": True,
            }
        ],
    )
    prompt = profile_research.build_discovery_prompt(
        profile_research.brief_of(request)
    )
    held = prompt.split("Already held about this place")[1].split("Pages already")[0]
    assert "do not repeat" not in held.lower()
    assert "material to CHECK and not to restate" in prompt
    # The unverified discovery leads keep their own "do not repeat": a search
    # snippet restated as a finding is the thing this pipeline must not do.
    assert "Check them; do not repeat them" in prompt
    assert "The wings are smoked for four hours. [v2, kept, attributed]" in prompt


def test_a_discarded_finding_is_never_offered_back_as_context(client, researched):
    """Somebody threw it out. Handing it back is how a rejected claim returns
    wearing the profile's own authority."""
    run_id, candidate_id, profile_id = researched
    view = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    doomed = view["findings"][0]
    client.patch(
        f"{BASE}/profiles/{profile_id}/findings/{doomed['finding_id']}",
        json={"curation": "discarded", "expected_version": doomed["version"]},
    )
    ctx = candidate_prep.context(run_id)
    request = profile_service._build_request(
        ctx, candidate_id, profile_id, mode="refresh", gap_text=""
    )
    held = {item["text"] for item in request.existing_findings}
    assert doomed["text"] not in held
    # And it is still there. Curation is not deletion.
    after = client.get(f"{BASE}/profiles/{profile_id}/research").json()
    assert any(
        finding["finding_id"] == doomed["finding_id"] for finding in after["findings"]
    )


def test_a_retest_reports_the_whole_packet_and_the_net_new_rows(
    client, ready, monkeypatch
):
    """Comparing a baseline total against only the additions is how a good
    retest reads as a regression."""
    run_id, candidate_id, _ = ready
    monkeypatch.setattr(listicle_api, "_research_call", _Transport())
    first = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "packet-key-0001"},
    ).json()
    assert first["attempt"]["findings_seen"] == first["attempt"]["findings_added"]
    again = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "packet-key-0002", "mode": "refresh"},
    ).json()
    # The same three claims came back. The packet is still three; nothing new
    # was added, and the two numbers say exactly that.
    assert again["attempt"]["findings_seen"] == 3
    assert again["attempt"]["findings_added"] == 0


# --------------------------------------------------------------------------
# Google's reviewers
# --------------------------------------------------------------------------


def test_google_reviews_reach_the_extraction_without_being_fetched(
    client, ready, monkeypatch
):
    """The customer voice the pilot could not find.

    Every review platform the reader touched answered 403 or 404, and this was
    one call away the whole time -- already written, wired only into the old
    whole-run pass. It is not fetched over HTTP, so it does not spend the page
    budget, and it cannot be refused by a platform.
    """
    run_id, candidate_id, _ = ready
    monkeypatch.setattr(
        profile_service,
        "fetch_reviews",
        _reviews(
            ("Carlos Ruiz", 5, "Las alitas picantes son las mejores del barrio."),
            ("Ana P", 3, "Buen ambiente pero el servicio va lento."),
        ),
    )
    extract = _Extract(
        json.dumps(
            {
                "claims": [
                    {
                        "text": "Carlos Ruiz called the spicy wings the best in "
                        "the neighbourhood.",
                        "kind": "review",
                        "categories": ["customer_observations"],
                        "about_subject": True,
                        "scope": "branch",
                        "who_said_it": "named_reviewer",
                        "who_name": "Carlos Ruiz",
                        "event_date": "2025-06-15",
                        "support": [
                            {
                                "page_id": "p1",
                                "excerpt": "alitas picantes son las mejores del barrio",
                            }
                        ],
                    }
                ],
                "coverage": [],
                "unresolved": [],
            }
        )
    )
    monkeypatch.setattr(listicle_api, "_extract_call", extract)
    monkeypatch.setattr(listicle_api, "_research_call", _Transport())
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "reviews-key-0001"},
    ).json()
    assert body["attempt"]["state"] == "completed"

    attempt = client.get(
        f"{BASE}/research-attempts/{body['attempt']['attempt_id']}"
    ).json()
    reviews = next(
        page for page in attempt["pages"] if page["origin"] == "google_reviews"
    )
    assert reviews["state"] == "ok"
    assert reviews["branch_anchored"] is True
    assert "REVIEW by Carlos Ruiz" in extract.prompts[0]
    # It cost no HTTP fetch, so the eight-page reading budget is untouched.
    assert reviews["byte_count"] == 0

    profile = client.get(
        f"{BASE}/profiles/{body['attempt']['profile_id']}/research"
    ).json()
    said = next(f for f in profile["findings"] if "Carlos Ruiz" in f["text"])
    assert said["validation"] == "evidence_ready"
    assert said["who_said_it"] == "named_reviewer"
    assert said["who_name"] == "Carlos Ruiz"
    # A Google review hangs off the Place ID, and the Place ID is the branch.
    # No street name appears in the review text and none has to.
    assert said["scope"] == "branch"
    assert said["evidence"][0]["publisher"] == "Google reviews"
    assert said["evidence"][0]["url"].startswith(
        "https://search.google.com/local/reviews?placeid="
    )


def test_a_claim_a_reviewer_did_not_write_still_fails(client, ready, monkeypatch):
    """The reviews are real text, so a passage check over them is a real check.

    This is the property that makes reviews worth more than a provider snippet:
    the words came from Google, not from a model reading a page it may not have
    opened, so an invented quotation has nowhere to hide.
    """
    run_id, candidate_id, _ = ready
    monkeypatch.setattr(
        profile_service,
        "fetch_reviews",
        _reviews(("Ana P", 3, "Buen ambiente pero el servicio va lento.")),
    )
    monkeypatch.setattr(listicle_api, "_research_call", _Transport())
    monkeypatch.setattr(
        listicle_api,
        "_extract_call",
        _Extract(
            json.dumps(
                {
                    "claims": [
                        {
                            "text": "Reviewers agree the wings are the best in Lima.",
                            "kind": "review",
                            "about_subject": True,
                            "scope": "branch",
                            "who_said_it": "named_reviewer",
                            "who_name": "Ana P",
                            "support": [
                                {
                                    "page_id": "p1",
                                    "excerpt": "las mejores alitas de Lima",
                                }
                            ],
                        }
                    ],
                    "coverage": [],
                    "unresolved": [],
                }
            )
        ),
    )
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "reviews-key-0002"},
    ).json()
    profile = client.get(
        f"{BASE}/profiles/{body['attempt']['profile_id']}/research"
    ).json()
    invented = next(f for f in profile["findings"] if "best in Lima" in f["text"])
    assert invented["validation"] == "unsupported"


def test_a_place_with_no_reviews_is_not_a_failure(client, ready, monkeypatch):
    """A place nobody has reviewed is a fact about the place. A Places call
    that failed is a fact about the network, and they are not the same."""
    run_id, candidate_id, _ = ready
    monkeypatch.setattr(profile_service, "fetch_reviews", _reviews())
    monkeypatch.setattr(listicle_api, "_research_call", _Transport())
    body = client.post(
        f"{BASE}/board/{run_id}/candidates/{candidate_id}/research",
        json={"idempotency_key": "reviews-key-0003"},
    ).json()
    assert body["attempt"]["state"] == "completed"
    attempt = client.get(
        f"{BASE}/research-attempts/{body['attempt']['attempt_id']}"
    ).json()
    assert not [p for p in attempt["pages"] if p["origin"] == "google_reviews"]


def test_reading_the_board_never_calls_google(client, run, monkeypatch):
    """Places is billed per call. Opening a screen is not a decision to spend,
    and that has to hold for the paid lookup as well as for the model."""
    calls = []
    monkeypatch.setattr(
        profile_service, "fetch_reviews", lambda pid: calls.append(pid)
    )
    client.get(f"{BASE}/board/{run}/research")
    client.get(f"{BASE}/board/{run}/research")
    assert calls == []
