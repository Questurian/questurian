"""What the page can see while the writer works, and after it stops.

A write was queued, the button gave no feedback, the graph ran for five minutes
and the finished article then sat unseen for twenty more. Every fact needed to
show all of that was already on the run: the run row carries the live stage,
and finalize carries the title, the readiness stamp and the measured checks.
None of it was ever sent to the page.
"""

from __future__ import annotations

import pytest

from app.features.prompt2blog import intake_v4


@pytest.fixture
def run(isolated_db):
    from app.core import write_status
    from app.features.prompt2blog.config import FEATURE_NAME

    run_id = "run-visibility"
    write_status(
        run_id,
        {"run_id": run_id, "state": "running", "stage": "queued", "error": None},
        feature=FEATURE_NAME,
    )
    return run_id


def _advance(run_id: str, *, state: str, stage: str, error: str | None = None):
    from app.core import write_status
    from app.features.prompt2blog.config import FEATURE_NAME

    write_status(
        run_id,
        {"run_id": run_id, "state": state, "stage": stage, "error": error},
        feature=FEATURE_NAME,
    )


def test_an_intake_that_has_not_reached_the_writer_reports_no_writing(run):
    """Intake sets the run running at the seed, so state alone would report
    every unanswered grill as an article in progress."""
    assert intake_v4.writing_state(run) is None


def test_a_running_graph_reports_the_stage_it_is_on(run):
    _advance(run, state="running", stage="stage_v3_compose")

    writing = intake_v4.writing_state(run)

    assert writing["state"] == "running"
    assert writing["stage"] == "stage_v3_compose"
    assert writing["stage_label"] == "Writing the article"


def test_every_graph_stage_has_words_a_person_can_read(run):
    for stage, label in intake_v4.WRITING_STAGE_LABELS.items():
        assert label and label != stage, f"{stage} has no readable label"


def test_every_graph_node_has_a_label_so_none_can_be_forgotten(run):
    """`GRAPH_STAGES` is derived from the topology, so a node added to the
    graph is writing whether or not anyone labelled it. This is the check that
    it also gets words rather than a stage id on screen."""
    from app.features.prompt2blog.graph.topology_v3 import V3_NODE_STAGE_NAMES

    unlabelled = [
        stage
        for stage in V3_NODE_STAGE_NAMES.values()
        if stage not in intake_v4.WRITING_STAGE_LABELS
    ]

    assert not unlabelled, f"no words for: {', '.join(unlabelled)}"


def test_a_finished_run_carries_the_title_and_the_stamp(run, isolated_db):
    from app.core import write_stage_result

    _advance(run, state="completed", stage="complete")
    write_stage_result(
        run,
        "stage_v3_finalize",
        {
            "data": {
                "final_title": "Lima is no longer simply the stopover before Cusco",
                "pipeline_status": "ready_for_staging",
                "readiness_blockers": [],
                "word_count_estimate": 914,
                "constraint_checks": {"sentence_widest_band_share": 0.57},
            }
        },
    )

    writing = intake_v4.writing_state(run)

    assert writing["state"] == "completed"
    assert writing["stage_label"] == "Done"
    assert writing["final_title"].startswith("Lima is no longer")
    assert writing["pipeline_status"] == "ready_for_staging"
    assert writing["word_count"] == 914
    assert writing["constraint_checks"]["sentence_widest_band_share"] == 0.57


def test_a_failed_run_says_so_rather_than_looking_busy(run):
    _advance(run, state="failed", stage="stage_v3_compose", error="the writer refused")

    writing = intake_v4.writing_state(run)

    assert writing["state"] == "failed"
    assert writing["error"] == "the writer refused"


def test_the_article_is_its_own_call_not_part_of_the_polled_state(run, isolated_db):
    from app.core import write_stage_result

    write_stage_result(
        run,
        "pipeline_v3",
        {"data": {"final_markdown": "## A heading\n\nSome prose.", "improved_article": {"title": "T", "content": "c"}}},
    )
    write_stage_result(
        run,
        "stage_v3_finalize",
        {"data": {"final_title": "The real title", "pipeline_status": "ready_for_staging"}},
    )

    article = intake_v4.finished_article(run)

    assert article["title"] == "The real title"
    assert article["markdown"].startswith("## A heading")
    # The state stays small enough to poll every few seconds.
    assert "markdown" not in (intake_v4.intake_state(run).get("writing") or {})


def test_asking_for_an_article_that_was_never_written_says_so(run):
    with pytest.raises(LookupError, match="No article written"):
        intake_v4.finished_article(run)


# --- research, which is a fan of searches and used to say nothing -----------


def test_gathering_counts_the_searches_that_have_come_back():
    from app.features.prompt2blog.contracts_v4 import (
        ArticleBrief,
        BriefReader,
        Prompt2BlogWorkOrder,
        WorkOrderReference,
        WorkOrderRequirement,
        WorkOrderScope,
    )
    from app.features.prompt2blog.research_v4 import (
        ResearchDependencies,
        gather_research,
    )

    brief = ArticleBrief(
        brief_fingerprint="bf-1",
        seed="Lima is no longer simply the stopover",
        location="Lima",
        form_id="destination-guide",
        reader=BriefReader(primary_reader="First timers"),
        reader_question="Is Lima worth days?",
        outcome="Stay two days",
        spine="Lima earns its own trip",
        fails_if="It reads like a generic guide",
    )
    scope = WorkOrderScope(
        mode="single_subject",
        references=[WorkOrderReference(name="Lima", role="primary_subject")],
    )
    order = Prompt2BlogWorkOrder(
        work_order_fingerprint="wo-1",
        brief_fingerprint="bf-1",
        primary_subject="Lima",
        scope=scope,
        requirements=[
            WorkOrderRequirement(requirement_id="q1", question="What do stalls charge?", kind="load_bearing"),
            WorkOrderRequirement(requirement_id="q2", question="What is it like after dark?", kind="texture"),
        ],
    )
    seen: list[dict] = []
    deps = ResearchDependencies(
        gather=lambda _p, _m: ("notes", [], 10),
        structure_llm=object(),
    )

    gather_research(brief, order, deps, seen.append)

    # One event when the fan goes out, one per search coming back, one for
    # structuring. `done` counts completions, so it never reports progress the
    # run has not actually made.
    assert [item["phase"] for item in seen] == [
        "gathering",
        "gathering",
        "gathering",
        "structuring",
    ]
    assert seen[0] == {
        "phase": "gathering",
        "done": 0,
        "total": 2,
        "last_question_back": "",
    }
    assert [item["done"] for item in seen] == [0, 1, 2, 2]
    # Which question comes back first is the network's business, so this
    # asserts the set rather than the order.
    assert {item["last_question_back"] for item in seen[1:3]} == {
        "What do stalls charge?",
        "What is it like after dark?",
    }
    # Structuring is one call and the longest single wait; it gets its own
    # phase rather than looking like a stall after the last search.
    assert seen[3]["done"] == seen[3]["total"] == 2


def test_a_progress_write_that_fails_does_not_stop_the_research():
    """Telemetry, not the work."""
    from app.features.prompt2blog.contracts_v4 import (
        ArticleBrief,
        BriefReader,
        Prompt2BlogWorkOrder,
        WorkOrderReference,
        WorkOrderRequirement,
        WorkOrderScope,
    )
    from app.features.prompt2blog.research_v4 import (
        ResearchDependencies,
        gather_research,
    )

    brief = ArticleBrief(
        brief_fingerprint="bf-1",
        seed="s",
        location="Lima",
        form_id="destination-guide",
        reader=BriefReader(primary_reader="r"),
        reader_question="q",
        outcome="o",
        spine="s",
        fails_if="f",
    )
    order = Prompt2BlogWorkOrder(
        work_order_fingerprint="wo-1",
        brief_fingerprint="bf-1",
        primary_subject="Lima",
        scope=WorkOrderScope(
            mode="single_subject",
            references=[WorkOrderReference(name="Lima", role="primary_subject")],
        ),
        requirements=[
            WorkOrderRequirement(requirement_id="q1", question="Q?", kind="load_bearing")
        ],
    )

    def explode(_progress):
        raise RuntimeError("the recorder is down")

    notes = gather_research(
        brief,
        order,
        ResearchDependencies(gather=lambda _p, _m: ("notes", [], 1), structure_llm=object()),
        explode,
    )

    assert notes["q1"].text == "notes"


# --- run 76b36468 (2026-08-31 18:14Z) --------------------------------------


def test_no_intake_stage_is_ever_mistaken_for_writing(run):
    """The run row carries intake's stages too, because the run is created at
    the seed (ADR 0031).

    Excluding only "queued" let `stage_v4_grill` through, and a run answering
    its first grill question showed a screen saying the article was being
    written. The test has to be a whitelist.
    """
    for stage in (
        "stage_v4_grill",
        "stage_v4_brief",
        "stage_v4_work_order",
        "stage_v4_research",
        "stage_v4_research_notes",
        "stage_v4_research_progress",
        "queued",
    ):
        _advance(run, state="running", stage=stage)
        assert intake_v4.writing_state(run) is None, f"{stage} is not writing"


def test_a_failed_intake_stage_is_not_reported_as_a_failed_article(run):
    _advance(run, state="failed", stage="stage_v4_research", error="the dossier")

    assert intake_v4.writing_state(run) is None


def test_every_graph_stage_still_reports(run):
    for stage in intake_v4.GRAPH_STAGES:
        _advance(run, state="running", stage=stage)
        assert intake_v4.writing_state(run) is not None, f"{stage} is the writer"


@pytest.mark.parametrize('accepted', [True, False, None])
def test_outline_fallback_is_visible_without_changing_readiness(run, accepted):
    from app.core import write_stage_result

    _advance(run, state='completed', stage='complete')
    if accepted is not None:
        write_stage_result(run, 'stage_v3_outline', {'data': {'accepted': accepted}})
    result = intake_v4.writing_state(run)
    assert bool(result['outline_warning']) is (accepted is False)
    assert result['readiness_blockers'] == []
