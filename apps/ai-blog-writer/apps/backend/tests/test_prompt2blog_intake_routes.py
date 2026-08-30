"""The intake routes, driven through the real app.

These are the moves an operator can make, so what matters is that a page can
act on every answer: where the run stands, what went wrong, and what a decision
cost.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.features.prompt2blog.api import intake as intake_api
from app.features.prompt2blog.grill_v4 import GrillDependencies
from app.features.prompt2blog.intake_v4 import IntakeServices
from app.features.prompt2blog.run_recorder import RunRecorder

SEED = "Lima is no longer simply the stopover before Machu Picchu"


class ScriptedLLM:
    def __init__(self, responses: list[dict[str, Any]]):
        self.responses = list(responses)

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[dict[str, Any], str]:
        return self.responses.pop(0), "{}"


QUESTION = {
    "done": False,
    "question": {
        "question_id": "q1",
        "topic": "what this should do",
        "ask": "Guide, or make the case?",
        "recommendation": "My recommendation: a guide with a point of view.",
    },
}
AGREED = {"done": True, "consensus": "A guide for a Lima layover.", "location": "Lima, Peru"}
BRIEF = {
    "form_id": "destination-guide",
    "primary_reader": "layover traveller",
    "reader_question": "Is Lima worth two extra nights?",
    "outcome": "book two extra nights",
    "spine": "food, cheap beats famous",
    "must_name": ["Surquillo market"],
    "fails_if": "reads like a tourist board",
    "material": [],
}
WORK_ORDER = {
    "primary_subject": "Lima",
    "scope_mode": "single_subject",
    "references": [{"name": "Lima", "role": "primary_subject"}],
    "requirements": [
        {"requirement_id": "r1", "question": "What do stalls charge?", "kind": "load_bearing"},
        {"requirement_id": "r2", "question": "What is it like at night?", "kind": "texture"},
    ],
}


@pytest.fixture
def scripted(monkeypatch):
    """Give every route in one test the same scripted model."""

    def _install(responses: list[dict[str, Any]]) -> None:
        llm = ScriptedLLM(responses)
        monkeypatch.setattr(
            intake_api,
            "_services",
            lambda: IntakeServices(
                dependencies=GrillDependencies(
                    llm=llm, research=lambda _s: ("Lima has a food reputation.", [], 900)
                ),
                recorder=RunRecorder(),
            ),
        )

    return _install


@pytest.mark.asyncio
async def test_a_seed_opens_a_run_and_returns_where_it_stands(isolated_db, scripted):
    scripted([QUESTION])

    response = await intake_api.open_intake(
        intake_api.SeedRequest(seed=SEED), staff_user={"id": 1}
    )

    assert response.status_code == 201
    body = _json(response)
    assert body["step"] == "grill"
    assert body["grill"]["pending"]["recommendation"].startswith("My recommendation:")


@pytest.mark.asyncio
async def test_a_reloaded_page_can_ask_where_it_stands(isolated_db, scripted):
    scripted([QUESTION])
    run_id = _json(
        await intake_api.open_intake(intake_api.SeedRequest(seed=SEED), staff_user={"id": 1})
    )["run_id"]

    body = _json(await intake_api.read_intake(run_id, _staff={"id": 1}))

    assert body["run_id"] == run_id
    assert body["grill"]["seed"] == SEED


@pytest.mark.asyncio
async def test_answering_moves_the_grill_on(isolated_db, scripted):
    scripted([QUESTION, AGREED])
    run_id = _json(
        await intake_api.open_intake(intake_api.SeedRequest(seed=SEED), staff_user={"id": 1})
    )["run_id"]

    body = _json(
        await intake_api.answer_question(
            run_id, intake_api.AnswerRequest(answer="guide, with a pitch"), _staff={"id": 1}
        )
    )

    assert body["grill"]["status"] == "agreed"
    assert body["grill"]["consensus"] == "A guide for a Lima layover."


@pytest.mark.asyncio
async def test_an_unknown_run_is_a_404_not_a_500(isolated_db, scripted):
    scripted([])

    with pytest.raises(Exception) as error:
        await intake_api.answer_question(
            "no-such-run", intake_api.AnswerRequest(answer="hello"), _staff={"id": 1}
        )

    assert getattr(error.value, "status_code", None) == 404


@pytest.mark.asyncio
async def test_answering_an_agreed_grill_is_a_400_not_a_500(isolated_db, scripted):
    scripted([QUESTION, AGREED])
    run_id = _json(
        await intake_api.open_intake(intake_api.SeedRequest(seed=SEED), staff_user={"id": 1})
    )["run_id"]
    await intake_api.answer_question(
        run_id, intake_api.AnswerRequest(answer="guide"), _staff={"id": 1}
    )

    with pytest.raises(Exception) as error:
        await intake_api.answer_question(
            run_id, intake_api.AnswerRequest(answer="wait"), _staff={"id": 1}
        )

    assert getattr(error.value, "status_code", None) == 400


@pytest.mark.asyncio
async def test_the_whole_intake_runs_end_to_end(isolated_db, scripted):
    """Seed to a cut research plan, which is what stage 3 owes."""
    scripted([QUESTION, AGREED, BRIEF, WORK_ORDER])
    run_id = _json(
        await intake_api.open_intake(intake_api.SeedRequest(seed=SEED), staff_user={"id": 1})
    )["run_id"]
    await intake_api.answer_question(
        run_id, intake_api.AnswerRequest(answer="guide, with a pitch"), _staff={"id": 1}
    )
    await intake_api.build_the_brief(run_id, _staff={"id": 1})
    await intake_api.plan_the_research(run_id, _staff={"id": 1})

    body = _json(
        await intake_api.cut_the_work_order(
            run_id, intake_api.CutRequest(struck_ids=["r2"]), _staff={"id": 1}
        )
    )

    assert body["step"] == "work_order"
    assert [item["requirement_id"] for item in body["work_order"]["requirements"]] == ["r1"]
    # The warning is for the person who just made the decision, so it rides on
    # the response as well as the run.
    assert "a detail, not an argument" in body["cut_warnings"][0]


@pytest.mark.asyncio
async def test_reopening_returns_the_run_to_the_grill(isolated_db, scripted):
    scripted([QUESTION, AGREED, BRIEF, {**QUESTION, "question": {**QUESTION["question"], "question_id": "q9"}}])
    run_id = _json(
        await intake_api.open_intake(intake_api.SeedRequest(seed=SEED), staff_user={"id": 1})
    )["run_id"]
    await intake_api.answer_question(
        run_id, intake_api.AnswerRequest(answer="guide"), _staff={"id": 1}
    )
    await intake_api.build_the_brief(run_id, _staff={"id": 1})

    body = _json(await intake_api.reopen(run_id, _staff={"id": 1}))

    assert body["step"] == "grill"
    assert body["brief"] is None


def _json(response) -> dict[str, Any]:
    import json

    return json.loads(response.body)


def test_the_intake_routes_are_actually_mounted():
    """A router nobody included is a feature nobody can reach.

    Every test above calls the handlers directly, which would keep passing if
    the router were never mounted on the app.
    """
    from app.features.prompt2blog.api.router import router

    paths = {route.path for route in router.routes if hasattr(route, "methods")}

    assert {
        "/prompt2blog/intake/seed",
        "/prompt2blog/intake/{run_id}",
        "/prompt2blog/intake/{run_id}/answer",
        "/prompt2blog/intake/{run_id}/reopen",
        "/prompt2blog/intake/{run_id}/brief",
        "/prompt2blog/intake/{run_id}/work-order",
        "/prompt2blog/intake/{run_id}/work-order/cut",
    } <= paths
