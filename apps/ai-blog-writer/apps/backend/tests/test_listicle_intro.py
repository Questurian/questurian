"""The list intro: locked until every place is done, then a prompt and the text pasted back. No model calls."""

import pytest

from app.features.listicle_pipeline import location_manager, store
from tests.test_listicle_place_research import BASE, _cards, _prepare, client, run  # noqa: F401
from tests.test_listicle_entry_blurb import _fill


@pytest.fixture
def lm(monkeypatch):
    """Location Manager, holding whichever Place IDs a test puts in it."""
    held = {"rows": {}, "down": False}

    def lookup(place_ids):
        if held["down"]:
            raise location_manager.LocationManagerUnavailable("down")
        return {pid: held["rows"].get(pid, []) for pid in place_ids}

    monkeypatch.setattr(location_manager, "lookup", lookup)
    return held


def _short_order(run_id, count):
    order = store.load_order(run_id)
    store.save_order(order.model_copy(update={"target_count": count}))


def _finish_place(client, run_id, card, why):
    candidate_id = card["candidate_id"]
    _prepare(client, run_id, candidate_id)
    path = f"{BASE}/board/{run_id}/candidates/{candidate_id}/workspace"
    assert client.post(path + "/open").status_code == 200
    _fill(client, path, why_it_belongs=why, what_to_order_or_notice=["The house wings"])
    saved = client.put(path + "/blurb", json={"version": 0, "text": f"Blurb for {card['name']}."})
    assert saved.status_code == 200, saved.text
    return path


def _intro(client, run_id):
    response = client.get(f"{BASE}/board/{run_id}/intro")
    assert response.status_code == 200, response.text
    return response.json()


def _done_run(client, run_id, lm):
    _short_order(run_id, 2)
    store.set_listicle_type(run_id, "dining")
    paths = []
    for index, card in enumerate(_cards(client, run_id).values()):
        paths.append(_finish_place(client, run_id, card, f"Reason number {index} (f1, f2)."))
        place_id = client.get(f"{BASE}/board/{run_id}/location-manager").json()["places"][card["candidate_id"]]["place_id"]
        lm["rows"][place_id] = [{"id": index + 1, "name": card["name"], "category": "dining"}]
    return paths


def test_locked_with_plain_reasons_until_every_place_is_done(client, run, lm):
    view = _intro(client, run)
    assert view["ready_to_write"] is False and view["complete"] is False
    assert view["prompt"] == ""
    codes = {b["code"] for b in view["blockers"]}
    assert {"no_type", "short", "blurbs"} <= codes

    store.set_listicle_type(run, "dining")
    _short_order(run, 2)
    messages = [b["message"] for b in _intro(client, run)["blockers"]]
    assert "2 places have no current blurb." in messages
    assert "2 places are not in Location Manager as dining." in messages

    refused = client.put(f"{BASE}/board/{run}/intro", json={"version": 0, "text": "Too early."})
    assert refused.status_code == 422


def test_a_short_list_blocks_even_when_every_place_is_done(client, run, lm):
    _done_run(client, run, lm)
    _short_order(run, 3)
    view = _intro(client, run)
    assert [b["code"] for b in view["blockers"]] == ["short"]
    assert view["blockers"][0]["message"] == "2 of 3 places are on the list."


def test_location_manager_down_means_not_ready(client, run, lm):
    _done_run(client, run, lm)
    assert _intro(client, run)["ready_to_write"] is True
    lm["down"] = True
    view = _intro(client, run)
    assert view["ready_to_write"] is False
    assert [b["code"] for b in view["blockers"]] == ["lm_unavailable"]


def test_the_prompt_carries_the_gist_not_the_blurbs(client, run, lm):
    _done_run(client, run, lm)
    prompt = _intro(client, run)["prompt"]
    seed = store.load(run).seed
    assert f'titled "{seed}"' in prompt
    assert "Kind of list: dining" in prompt
    assert "Number of places: 2" in prompt
    assert "Reason number 0" in prompt and "Reason number 1" in prompt
    assert "(f1" not in prompt
    assert "Blurb for" not in prompt  # blurbs stay out
    assert "The house wings" not in prompt  # only the why line per place
    assert "Meal decisions" in prompt


def test_save_completes_the_run_and_later_changes_mark_it_stale(client, run, lm):
    paths = _done_run(client, run, lm)
    saved = client.put(f"{BASE}/board/{run}/intro", json={"version": 0, "text": "  Lima does wings.  "})
    assert saved.status_code == 200, saved.text
    view = saved.json()
    assert view["text"] == "Lima does wings."
    assert view["version"] == 1 and view["stale"] is False and view["complete"] is True

    # A tab that still thinks there is no intro cannot overwrite it.
    assert client.put(f"{BASE}/board/{run}/intro", json={"version": 0, "text": "Other."}).status_code == 409

    # A changed blurb makes the intro stale, and the run is no longer complete.
    blurb = client.get(paths[0]).json()["blurb"]
    assert client.put(paths[0] + "/blurb", json={"version": blurb["version"], "text": "A new blurb."}).status_code == 200
    view = _intro(client, run)
    assert view["stale"] is True and view["complete"] is False and view["text"] == "Lima does wings."

    resaved = client.put(f"{BASE}/board/{run}/intro", json={"version": 1, "text": "Lima does wings, again."})
    assert resaved.json()["complete"] is True

    store.set_listicle_type(run, "nightlife")
    assert _intro(client, run)["stale"] is True
