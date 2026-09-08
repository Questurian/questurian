"""What `@exclusive_run` must not do to the endpoint it guards.

A decorator that takes the lock is invisible in the route table and very
visible to FastAPI, which reads the wrapper's signature to decide what each
parameter is. Getting that wrong does not break the lock; it breaks the
request, and it breaks it as a 422 on a body that was perfectly well formed.

Found live on 2026-09-07: the operator answered the first grill question in
the UI and got "That step could not be completed", with
`{"type":"missing","loc":["query","request"]}` behind it. The body was fine.
FastAPI had decided `request` was a query string, because the annotation
`"AnswerRequest"` -- a string, since the route module runs under
`from __future__ import annotations` -- was being resolved against this
module's globals rather than the route module's, and this module has never
heard of it.
"""

from __future__ import annotations

import inspect

import pytest
from fastapi.dependencies.utils import get_typed_signature

from app.features.prompt2blog.api import intake as routes


def _guarded_endpoints():
    """Every route function this decorator wraps, by name."""
    return [
        (name, fn)
        for name, fn in vars(routes).items()
        if callable(fn) and hasattr(fn, "__wrapped__") and hasattr(fn, "__signature__")
    ]


def test_the_decorator_is_actually_on_something():
    """A guard that guards nothing passes every other test in this file."""
    assert len(_guarded_endpoints()) >= 6


@pytest.mark.parametrize("name", [name for name, _ in _guarded_endpoints()])
def test_no_guarded_endpoint_hands_fastapi_an_unresolved_annotation(name):
    """The one property the whole bug reduces to.

    An annotation FastAPI cannot resolve is not an error it reports. It is a
    parameter quietly reclassified as a query string, and the first anyone
    hears of it is a 422 in front of an operator.
    """
    signature = get_typed_signature(getattr(routes, name))
    unresolved = [
        parameter.name
        for parameter in signature.parameters.values()
        if type(parameter.annotation).__name__ == "ForwardRef"
    ]
    assert unresolved == [], f"{name} would read {unresolved} off the query string"


def test_the_request_body_is_still_a_model_and_not_a_query_string():
    """The exact failure the operator hit, pinned to the endpoint that hit it."""
    signature = get_typed_signature(routes.answer_question)
    request = signature.parameters["request"]

    assert request.annotation is routes.AnswerRequest


def test_background_tasks_survive_the_wrapper_too():
    """A writing endpoint that cannot be handed its BackgroundTasks cannot write.

    Less obvious than the body case and worse: these are the three routes that
    spend money, and they were reachable only from the tests that call the
    function directly.
    """
    from fastapi import BackgroundTasks

    for name in ("generate_the_article", "review_the_draft", "start_writing"):
        signature = get_typed_signature(getattr(routes, name))
        assert signature.parameters["background_tasks"].annotation is BackgroundTasks, name


def test_the_lock_still_wraps_the_real_function():
    """The signature is corrected, not replaced by a different function's."""
    for name, fn in _guarded_endpoints():
        assert list(inspect.signature(fn).parameters)[0] == "run_id", name
        assert fn.__wrapped__.__name__ == name
