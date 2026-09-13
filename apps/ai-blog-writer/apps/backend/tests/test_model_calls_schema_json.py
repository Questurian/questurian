"""`schema_json`: one JSON reply held to a schema, with no tool and no retry.

The listicle extraction moved here after gemini-2.5-pro answered a forced tool
call by writing `print(default_api.record_evidence(...))` as text. Nothing in
these tests reaches a provider: the model object is a stand-in.
"""

from __future__ import annotations

import json
from contextlib import contextmanager

import pytest

import app.shared.model_calls as model_calls


class _Observed:
    def __init__(self):
        self.usage = None
        self.metadata: dict = {}

    def record_usage(self, usage):
        self.usage = usage

    def add_metadata(self, **values):
        self.metadata.update(values)


class _Model:
    """A schema-capable model that answers, or raises, and counts itself."""

    def __init__(self, reply=None, *, error: Exception | None = None):
        self.model_name = "gemini-2.5-pro"
        self.reply = reply if reply is not None else {"claims": []}
        self.error = error
        self.calls: list[dict] = []
        self.last_usage_metadata = None

    def invoke_json(self, prompt, *, input_schema, max_tokens=None):
        self.calls.append({"prompt": prompt, "schema": input_schema})
        self.last_usage_metadata = {
            "prompt_token_count": 10,
            "candidates_token_count": 20,
            "thoughts_token_count": 5,
            "total_token_count": 35,
        }
        if self.error is not None:
            raise self.error
        return self.reply


@pytest.fixture
def seams(monkeypatch):
    import utils

    built: list[dict] = []
    observed: list[_Observed] = []
    model = _Model()

    def get_vertex_llm(**kwargs):
        built.append(kwargs)
        return model

    @contextmanager
    def observe(job_id, **kwargs):
        record = _Observed()
        observed.append(record)
        yield record

    monkeypatch.setattr(utils, "get_vertex_llm", get_vertex_llm, raising=False)
    monkeypatch.setattr(model_calls, "observe_job_call", observe)
    return {"built": built, "observed": observed, "model": model}


def test_one_call_held_to_the_schema_and_its_tokens_reported(seams):
    schema = {"type": "object", "properties": {"claims": {"type": "array"}}}
    result = model_calls.schema_json(
        "listicle.evidence_extract", prompt="read these", schema=schema, max_tokens=8192
    )
    assert result.payload == {"claims": []}
    assert result.model_name == "gemini-2.5-pro"
    assert seams["model"].calls == [{"prompt": "read these", "schema": schema}]
    # The ceiling goes through the builder, which is where the output floor
    # lives; the forced-tool path sent it straight to the provider.
    assert seams["built"][0]["max_tokens"] == 8192
    assert seams["observed"][0].usage["total_token_count"] == 35
    # Returned in the shape every receipt reads, thinking counted as output.
    assert result.usage["total_tokens"] == 35
    assert result.usage["output_tokens"] == 25
    assert result.usage["reasoning_tokens"] == 5


def test_a_reply_that_fails_is_asked_once_and_still_reported(seams):
    seams["model"].error = ValueError("Gemini returned JSON that stops mid-value")
    with pytest.raises(ValueError, match="stops mid-value"):
        model_calls.schema_json(
            "listicle.evidence_extract", prompt="read these", schema={"type": "object"}
        )
    assert len(seams["model"].calls) == 1
    # A failed call can still have been charged; its tokens are not dropped.
    assert seams["observed"][0].usage["total_token_count"] == 35


def test_the_extraction_no_longer_goes_through_a_forced_tool(seams, monkeypatch):
    import app.features.listicle_pipeline.api as listicle_api

    def forced_tool(*args, **kwargs):
        raise AssertionError("the extraction must not use a forced tool call")

    monkeypatch.setattr(model_calls, "structured", forced_tool)
    seams["model"].reply = {"claims": [{"text": "x"}], "coverage": [], "unresolved": []}
    result = listicle_api._extract_call("the pages")
    assert json.loads(result.text)["claims"] == [{"text": "x"}]
    assert result.model == "gemini-2.5-pro"
