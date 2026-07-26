"""Pytest fixtures shared by Prompt2Blog route and storage tests."""

from __future__ import annotations

from collections.abc import Iterator
from uuid import uuid4

import pytest

from app.core import clear_all_runs
from tests.prompt2blog_test_support import seed_completed_prompt2blog_run


@pytest.fixture
def empty_prompt2blog_storage() -> Iterator[None]:
    clear_all_runs(feature="prompt2blog")
    try:
        yield
    finally:
        clear_all_runs(feature="prompt2blog")


@pytest.fixture
def completed_prompt2blog_run(
    empty_prompt2blog_storage,
) -> str:
    run_id = f"p2b-{uuid4()}"
    seed_completed_prompt2blog_run(run_id)
    return run_id
