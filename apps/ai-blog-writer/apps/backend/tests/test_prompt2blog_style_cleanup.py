"""Finding 05: a style pass must not be able to change a fact.

The old pass received the finished article and a list of style errors, and
nothing else -- no brief, no facts, no caveats. So a call sent to remove one em
dash held the whole document, could not tell a carefully dated sentence from a
stylistic tic, and "offered in March" could come back as "offers today" with
the dash duly gone.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from app.features.prompt2blog.content.sections import segment_article
from app.features.prompt2blog.content.style_cleanup import (
    clean_up_style,
    sections_with_errors,
)
from app.features.prompt2blog.dependencies import PipelineDependencies

# The em dash in "wait — about" is the style error. The as-of date two
# sections away is the thing that must survive it.
ARTICLE = """The airport taxi is the one to take before 6am.

## Getting there

The rail link runs every twenty minutes, so the wait — about ten minutes —
is short.

## What it costs

A single fare was COP 38,000 (about USD 9) as of March 2026."""


@dataclass
class FakeRecorder:
    def start_stage(self, *_args, **_kwargs) -> None: ...

    def record_stage(self, *_args, **_kwargs) -> None: ...


@dataclass
class FakeLLM:
    response: Any = field(default_factory=dict)
    prompts: list[str] = field(default_factory=list)
    raises: Exception | None = None

    def invoke_json(self, *, prompt: str, **_kwargs) -> tuple[Any, str]:
        self.prompts.append(prompt)
        if self.raises:
            raise self.raises
        return self.response, json.dumps(self.response)


def _dependencies(llm: FakeLLM) -> PipelineDependencies:
    return PipelineDependencies(llm=llm, recorder=FakeRecorder())


def _clean(llm: FakeLLM, content: str = ARTICLE, **kwargs):
    return clean_up_style(
        content,
        dependencies=_dependencies(llm),
        job_id="p2b.compose",
        model_name="test-writer",
        max_tokens=1024,
        context="test",
        **kwargs,
    )


def _hash_of(section_id: str, content: str = ARTICLE) -> str:
    return next(
        item for item in segment_article(content) if item.section_id == section_id
    ).text_hash


def test_a_clean_draft_never_reaches_a_model():
    llm = FakeLLM()
    clean = "## Getting there\n\nThe rail link runs every twenty minutes."

    content, report = _clean(llm, clean)

    assert llm.prompts == []
    assert report["status"] == "clean"
    assert content == clean


def test_only_the_failing_section_is_sent():
    llm = FakeLLM(response={"sections": []})

    _content, report = _clean(llm)

    assert report["sections_sent"] == ["s1"]
    prompt = llm.prompts[0]
    assert "SECTION s1" in prompt
    assert "SECTION s2" not in prompt
    # The section carrying the dated price was never shown to the pass, which
    # is the strongest form of "it cannot change that fact".
    assert "COP 38,000" not in prompt


def test_the_scope_guard_travels_with_the_pass():
    llm = FakeLLM(response={"sections": []})

    _content, _report = _clean(llm, guard="COMPACT SCOPE AND STYLE LOCK\nKeep it.")

    assert "COMPACT SCOPE AND STYLE LOCK" in llm.prompts[0]


def test_a_fix_replaces_its_section_and_nothing_else():
    llm = FakeLLM(
        response={
            "sections": [
                {
                    "section_id": "s1",
                    "text_hash": _hash_of("s1"),
                    "content": (
                        "The rail link runs every twenty minutes, so the wait "
                        "of about ten minutes is short."
                    ),
                }
            ]
        }
    )

    content, report = _clean(llm)

    assert report["status"] == "applied"
    assert report["errors_after"] == []
    assert "—" not in content
    # The dated price is byte-for-byte what it was.
    assert (
        "A single fare was COP 38,000 (about USD 9) as of March 2026." in content
    )
    assert "The airport taxi is the one to take before 6am." in content


def test_an_edit_to_a_section_that_was_not_sent_is_refused():
    llm = FakeLLM(
        response={
            "sections": [
                {
                    "section_id": "s2",
                    "text_hash": _hash_of("s2"),
                    "content": "A single fare is about USD 9 today.",
                }
            ]
        }
    )

    content, report = _clean(llm)

    assert report["off_target_sections"] == ["s2"]
    assert "as of March 2026" in content
    assert "today" not in content


def test_a_result_that_is_not_cleaner_is_discarded():
    llm = FakeLLM(
        response={
            "sections": [
                {
                    "section_id": "s1",
                    "text_hash": _hash_of("s1"),
                    # Two em dashes where there were two, plus a new one.
                    "content": "The link runs — often — and the wait — is short.",
                }
            ]
        }
    )

    content, report = _clean(llm)

    assert report["status"] == "rejected"
    assert content == ARTICLE.strip()


def test_a_failed_call_keeps_the_draft_and_says_so():
    llm = FakeLLM(raises=RuntimeError("provider down"))

    content, report = _clean(llm)

    assert report["status"] == "call_failed"
    assert content == ARTICLE.strip()


def test_a_stale_hash_leaves_the_draft_alone():
    llm = FakeLLM(
        response={
            "sections": [
                {
                    "section_id": "s1",
                    "text_hash": "000000000000",
                    "content": "Rewritten against a draft that no longer exists.",
                }
            ]
        }
    )

    content, report = _clean(llm)

    assert report["status"] == "no_change"
    assert content == ARTICLE.strip()


def test_errors_are_routed_to_the_section_whose_lines_they_name():
    placed, unplaced = sections_with_errors(
        ARTICLE,
        [
            "Line 1: em dash is not allowed.",
            "Line 5: em dash is not allowed.",
            "Line 10: em dash is not allowed.",
            "Hyphenated compounds are over budget.",
        ],
    )

    assert placed["s0"] == ["Line 1: em dash is not allowed."]
    assert placed["s1"] == ["Line 5: em dash is not allowed."]
    assert placed["s2"] == ["Line 10: em dash is not allowed."]
    # A document-wide count belongs to no single section.
    assert unplaced == ["Hyphenated compounds are over budget."]
