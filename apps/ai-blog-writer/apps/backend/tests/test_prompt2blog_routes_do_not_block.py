"""No prompt2blog handler runs its blocking work on the event loop.

FastAPI runs an `async def` handler on the event loop and a `def` handler in a
threadpool. Every handler here blocks -- ten sequential web searches, a model
call that runs for minutes, SQLite reads -- so declaring them async handed the
loop to one request and froze the whole server for as long as it took.

On 2026-08-31 that looked like three separate bugs: the Claude status pill hung
on "checking", links did nothing, and the page forgot which run it was on
because its resume read timed out and the code took silence to mean the run was
gone. All three were requests queued behind a research pass holding the loop.
"""

from __future__ import annotations

import inspect

import pytest

from app.features.prompt2blog import routes as prompt2blog_routes
from app.features.prompt2blog.api import articles, generation, intake, runs

# `options` reads small static catalogs and holds the loop for microseconds.
BLOCKING_MODULES = (intake, runs, articles, generation)


def _handlers(module):
    return [
        (name, value)
        for name, value in vars(module).items()
        if inspect.isfunction(value)
        and not name.startswith("_")
        and getattr(value, "__module__", "") == module.__name__
    ]


@pytest.mark.parametrize("module", BLOCKING_MODULES, ids=lambda m: m.__name__)
def test_no_handler_in_this_module_holds_the_event_loop(module):
    coroutines = [
        name for name, value in _handlers(module) if inspect.iscoroutinefunction(value)
    ]

    assert not coroutines, (
        f"{module.__name__} declares {', '.join(coroutines)} async. Everything "
        "here blocks, so async hands FastAPI the event loop and the whole "
        "server stops until the call returns. Use `def`."
    )


def test_the_re_export_layer_does_not_put_it_back():
    """`routes.py` wraps the handlers, and an async wrapper around a plain
    function puts the work straight back on the loop."""
    wrapped = [
        name
        for name in (
            "start_pipeline_v3",
            "resume_run",
            "get_status",
            "get_result",
            "get_articles",
            "synthesize_sources",
        )
        if inspect.iscoroutinefunction(getattr(prompt2blog_routes, name, None))
    ]

    assert not wrapped, f"async wrappers in routes.py: {', '.join(wrapped)}"


def test_the_research_route_is_the_one_that_mattered_most():
    """Ten sequential web searches and a structuring call, five to ten minutes
    of it, with the server answering nothing."""
    assert not inspect.iscoroutinefunction(intake.do_the_research)
    assert not inspect.iscoroutinefunction(intake.read_intake)
