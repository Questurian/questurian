"""Which job the listicle interview reports itself as.

`api._base_dependencies` has always set `job_id="listicle.grill"`. `service`
then built a fresh `GrillDependencies` from three of its fields and took the
default for the rest, so the identity was dropped one line after it was set.
Two things followed: the usage dashboard billed listicle interviews to
Prompt2Blog, and the model gateway answered for `p2b.grill` when someone
changed the listicle grill's model on the dashboard.

Both callers are tested here because the engine is shared, and a listicle fix
that moves Prompt2Blog's job identity is a worse bug than the one being fixed.
"""

from __future__ import annotations

from app.features.listicle_pipeline import service
from app.features.prompt2blog.grill_v4 import GrillDependencies, start_grill
from app.features.prompt2blog.contracts_v4 import MARKER_KEYS


class RecordingLLM:
    """A model that walks forward one marker at a time.

    It has to move: the engine now refuses a question about a marker that is
    already settled, so a stub that asks the same thing forever is retried once
    and then accepted, and the job ids it records stop being one per turn.
    """

    ORDER = ("kind", "place", "count", "bar", "cut", "angles")

    def __init__(self) -> None:
        self.jobs: list[str] = []
        self.turn = 0

    def invoke_json(self, *, prompt, model_name, schema, **kwargs):
        self.jobs.append(kwargs.get("job_id", ""))
        marker = self.ORDER[min(self.turn, len(self.ORDER) - 1)]
        covered = list(self.ORDER[: self.turn])
        self.turn += 1
        return (
            {
                "done": False,
                "ask": f"What about {marker}?",
                "recommendation": "20",
                "consensus": "",
                "markers_covered": covered,
                "asks_about": marker,
                "options": [],
            },
            "fake-model",
        )


def _dependencies(llm, job_id):
    return GrillDependencies(
        llm=llm,
        research=lambda prompt: ("", [], None),
        job_id=job_id,
    )


def test_the_listicle_grill_reports_itself_as_the_listicle_grill(isolated_db):
    llm = RecordingLLM()
    state = service.start(
        "The 20 best cevicherias in Lima", _dependencies(llm, "listicle.grill")
    )
    assert llm.jobs == ["listicle.grill"]

    service.answer(state.run_id, "20", _dependencies(llm, "listicle.grill"))
    assert llm.jobs == ["listicle.grill", "listicle.grill"]


def test_prompt2blog_keeps_its_own_job_identity(isolated_db):
    """The engine is shared. A listicle fix that moved this would be a worse
    bug than the one it fixed."""
    llm = RecordingLLM()
    start_grill(
        run_id="p2b-1",
        seed="A guide to Lima's markets",
        dependencies=_dependencies(llm, "p2b.grill"),
        marker_keys=MARKER_KEYS,
    )
    assert llm.jobs == ["p2b.grill"]


def test_the_default_is_still_prompt2blogs(isolated_db):
    llm = RecordingLLM()
    start_grill(
        run_id="p2b-2",
        seed="A guide to Lima's markets",
        dependencies=GrillDependencies(
            llm=llm, research=lambda prompt: ("", [], None)
        ),
        marker_keys=MARKER_KEYS,
    )
    assert llm.jobs == ["p2b.grill"]


def test_no_usage_is_reported_by_these_tests(monkeypatch):
    """Named rather than assumed. Three invented rows reached the real usage
    dashboard once, and the fix was a fixture nobody can see from here."""
    import os

    assert not os.getenv("USAGE_MONITOR_URL")


class RepeatingLLM:
    """A model that asks about a marker it has already settled.

    Exactly what a live run did twice in six turns on 2026-09-08: it settled
    the exclusions, then asked "what else should be excluded?"; it settled the
    angles, then asked for them again with every marker covered.
    """

    def __init__(self, *, repeats: int) -> None:
        self.repeats = repeats
        self.calls = 0

    def invoke_json(self, *, prompt, model_name, schema, **kwargs):
        self.calls += 1
        if self.calls <= self.repeats:
            # `cut` is settled and `angles` is not, so this question buys
            # nothing.
            return (
                {
                    "done": False,
                    "ask": "Anything else you would like to exclude?",
                    "recommendation": "No hotel restaurants.",
                    "consensus": "",
                    "markers_covered": ["kind", "place", "count", "bar", "cut"],
                    "asks_about": "cut",
                    "options": [],
                },
                "fake-model",
            )
        return (
            {
                "done": False,
                "ask": "Which angles should the list be built from?",
                "recommendation": "cevicherias open for decades",
                "consensus": "",
                "markers_covered": ["kind", "place", "count", "bar", "cut"],
                "asks_about": "angles",
                "options": [],
            },
            "fake-model",
        )


def test_a_question_about_a_settled_marker_is_retried_not_shown(isolated_db):
    """A repeat costs an operator a turn to learn nothing -- and because a
    marker is read from the LAST turn that settled it, answering the repeat
    plainly replaces the earlier answer. The live run's second `cut` question
    would have reduced four exclusions to one."""
    llm = RepeatingLLM(repeats=1)
    state = service.start("The 40 best cevicherias in Lima", _dependencies(llm, "listicle.grill"))
    assert llm.calls == 2
    assert state.pending is not None
    assert state.pending.asks_about == "angles"


def test_a_grill_that_repeats_itself_twice_is_shown_rather_than_killed(isolated_db):
    """One wasted turn is much better than an interview the operator cannot
    get past."""
    llm = RepeatingLLM(repeats=99)
    state = service.start("The 40 best cevicherias in Lima", _dependencies(llm, "listicle.grill"))
    assert llm.calls == 2
    assert state.status == "asking"
    assert state.pending is not None
    assert state.pending.asks_about == "cut"


class DoneWithoutConsensusLLM:
    """Claims done, says nothing, then writes the playback when asked again.

    A different fault from a repeat, and the remedy is the opposite: asking
    again is what recovers it, so the repeat guard must not eat the recovery.
    """

    MARKERS = ["kind", "place", "count", "bar", "cut", "angles"]

    def __init__(self) -> None:
        self.calls = 0

    def invoke_json(self, *, prompt, model_name, schema, **kwargs):
        self.calls += 1
        if self.calls == 1:
            return (
                {
                    "done": True,
                    "ask": "",
                    "recommendation": "",
                    "consensus": "",
                    "markers_covered": self.MARKERS,
                    "asks_about": "",
                    "options": [],
                },
                "fake-model",
            )
        return (
            {
                "done": True,
                "ask": "",
                "recommendation": "",
                "consensus": "Forty cevicherias in Lima.",
                "markers_covered": self.MARKERS,
                "asks_about": "",
                "options": [],
            },
            "fake-model",
        )


def test_claiming_done_with_no_playback_is_still_allowed_to_ask_again(isolated_db):
    llm = DoneWithoutConsensusLLM()
    state = service.start("The 40 best cevicherias in Lima", _dependencies(llm, "listicle.grill"))
    assert state.status == "agreed"
    assert state.consensus == "Forty cevicherias in Lima."
