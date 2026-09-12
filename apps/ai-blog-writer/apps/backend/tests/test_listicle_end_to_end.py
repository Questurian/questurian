"""One run, all the way through, against the real application.

Every other listicle test checks one seam. This one walks the path an operator
walks -- type a title, answer six questions, look at the order, correct the
count, run the searches, lose one to a timeout, reopen the page, retry the one
that failed -- through the app FastAPI actually serves, with the model and the
web replaced and nothing else.

It exists because five of the six confirmed faults were invisible to seam
tests. Each seam was doing its own job correctly; the run was broken between
them.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.features.listicle_pipeline.api as listicle_api
from app.features.prompt2blog.grill_v4 import GrillDependencies


class ScriptedLLM:
    """A model that walks one interview and then agrees."""

    SCRIPT = [
        ("kind", "Cevicherias.", []),
        ("place", "Lima, Peru — the city, not one district.", []),
        ("count", "20", []),
        ("bar", "Written up by someone other than the place itself.", []),
        ("cut", "No chains, no delivery-only.", []),
        (
            "angles",
            "cevicherias open for decades\nvery cheap cevicherias people rate highly",
            [
                {
                    "text": "cevicherias open for decades",
                    "recommended": True,
                    "group": "heritage",
                    "shape": "institution",
                    "role": "broad",
                },
                {
                    "text": "very cheap cevicherias people rate highly",
                    "recommended": True,
                    "group": "price",
                    "shape": "cheap",
                    "role": "broad",
                },
                {
                    "text": "the cevicheria credited with starting Lima's ceviche boom",
                    "recommended": False,
                    "group": "heritage",
                    "shape": "origin",
                    "role": "specific",
                },
            ],
        ),
    ]

    def __init__(self) -> None:
        self.turn = 0
        self.jobs: list[str] = []

    def invoke_json(self, *, prompt, model_name, schema, **kwargs):
        self.jobs.append(kwargs.get("job_id", ""))
        if self.turn >= len(self.SCRIPT):
            return (
                {
                    "done": True,
                    "ask": "",
                    "recommendation": "",
                    "consensus": "Twenty cevicherias in Lima, two searches.",
                    "markers_covered": ["kind", "place", "count", "bar", "cut", "angles"],
                    "asks_about": "",
                    "options": [],
                },
                "fake-model",
            )
        marker, recommendation, options = self.SCRIPT[self.turn]
        covered = [m for m, _, _ in self.SCRIPT[: self.turn]]
        self.turn += 1
        return (
            {
                "done": False,
                "ask": f"About {marker}?",
                "recommendation": recommendation,
                "consensus": "",
                "markers_covered": covered,
                "asks_about": marker,
                "options": options,
            },
            "fake-model",
        )


@pytest.fixture
def client(isolated_db, monkeypatch):
    from app.main import app

    llm = ScriptedLLM()
    state = {"fail_cheap": True, "calls": []}

    def fake_search(prompt: str):
        state["calls"].append(prompt)
        if "cheap" in prompt:
            if state["fail_cheap"]:
                raise TimeoutError("read timed out")
            return "Al Toke Pez | Surquillo | six stools", ["https://y.test"], 7
        return (
            "1. Canta Rana | Barranco | open since the 1980s\n"
            "2. Bodega 1900 | Barranco | counter since 1900\n",
            ["https://x.test"],
            9,
        )

    monkeypatch.setattr(listicle_api, "_search_call", fake_search)
    monkeypatch.setattr(
        listicle_api,
        "_base_dependencies",
        lambda: GrillDependencies(
            llm=llm,
            research=lambda prompt: ("Lima has hundreds of cevicherias.", [], 100),
            job_id="listicle.grill",
        ),
    )
    with TestClient(app) as test_client:
        test_client.llm = llm  # type: ignore[attr-defined]
        test_client.search_state = state  # type: ignore[attr-defined]
        yield test_client


BASE = "/api/listicle-pipeline"


def test_one_run_from_a_typed_title_to_a_retried_search(client):
    # 1. The title. The run gets an id, and the id is what everything after
    #    this is addressed by.
    started = client.post(f"{BASE}/grill/start", json={"seed": "The 40 best cevicherias in Lima"})
    assert started.status_code == 200
    run_id = started.json()["run_id"]
    assert started.json()["pending"]["ask"]

    # 2. Six answers. The count one is answered by agreeing, which carries no
    #    number -- the fault that made a twenty-item list search for forty.
    answers = [
        "Cevicherias.",
        "Lima, Peru — the city, not one district.",
        "Yes, that's right.",
        "Written up by someone other than the place itself.",
        "No chains, no delivery-only.",
    ]
    for text in answers:
        reply = client.post(f"{BASE}/grill/answer", json={"run_id": run_id, "answer": text})
        assert reply.status_code == 200, reply.text

    # The angle question is answered by choosing, and the choice is sent as
    # records rather than as a paragraph.
    options = reply.json()["pending"]["options"]
    assert options and options[0]["shape"] == "institution"
    agreed = client.post(
        f"{BASE}/grill/answer",
        json={
            "run_id": run_id,
            "answer": "cevicherias open for decades\nvery cheap cevicherias people rate highly",
            "selections": [
                {
                    "text": option["text"],
                    "angle_id": f"a{index + 1}",
                    "shape_key": option["shape"],
                    "group": option["group"],
                    "role": option["role"],
                    "edited": False,
                }
                for index, option in enumerate(options[:2])
            ],
        },
    )
    assert agreed.status_code == 200
    assert agreed.json()["status"] == "agreed"

    # Every interview turn reported itself as the listicle grill, not as
    # Prompt2Blog.
    assert set(client.llm.jobs) == {"listicle.grill"}

    # 3. The order. Twenty, because that is what the acceptance agreed to --
    #    the forty in the title was the number the interview talked them out of.
    order = client.get(f"{BASE}/order/{run_id}").json()
    assert order["target_count"] == 20
    assert order["count_source"] == "accepted"
    assert [a["shape_key"] for a in order["angles"]] == ["institution", "cheap"]

    # 4. A correction. New revision; the number the searches use follows it.
    revised = client.post(f"{BASE}/order/{run_id}", json={"target_count": 24}).json()
    assert revised["revision"] == 2 and revised["target_count"] == 24

    # 5. The searches. One of them times out.
    found = client.post(f"{BASE}/search/{run_id}").json()
    assert found["found"] == 2
    # A numbered row keeps the year in the name.
    assert {c["name"] for c in found["candidates"]} == {"Canta Rana", "Bodega 1900"}
    states = {row["angle"]: row["state"] for row in found["angles"]}
    assert states["very cheap cevicherias people rate highly"] == "failed"

    # 6. Reopening the page. It reads; it does not search.
    before = len(client.search_state["calls"])
    reopened = client.get(f"{BASE}/search/{run_id}").json()
    assert reopened["found"] == 2
    assert len(client.search_state["calls"]) == before

    # 7. Retrying the one that failed costs one search, and the two places the
    #    working search found are still there.
    client.search_state["fail_cheap"] = False
    failed = [row["angle_id"] for row in found["angles"] if row["state"] == "failed"]
    after = client.post(
        f"{BASE}/search/{run_id}", json={"angle_ids": failed, "reuse": False}
    ).json()
    assert len(client.search_state["calls"]) == before + 1
    assert {c["name"] for c in after["candidates"]} == {
        "Canta Rana",
        "Bodega 1900",
        "Al Toke Pez",
    }
    assert after["complete"] is True
    assert after["shortfall"] == 21
