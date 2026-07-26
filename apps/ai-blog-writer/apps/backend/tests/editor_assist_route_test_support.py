"""Shared HTTP harness and deterministic fakes for Editor Assist route tests."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.features.editor_assist.routes as editor_assist_routes
from app.features.editor_assist.dependencies import get_editor_assist_dependencies


@dataclass(frozen=True)
class FakeWriterResult:
    text: str
    model_name: str


@dataclass(frozen=True)
class FakeGroundedResult:
    text: str
    source_urls: list[str] = field(default_factory=list)
    model_name: str = "gemini-2.5-flash"


def build_editor_assist_client(
    *,
    writer: Callable[..., Any] | None = None,
    structured_writer: Callable[..., Any] | None = None,
    graph_runner: Callable[..., Any] | None = None,
) -> TestClient:
    app = FastAPI()
    app.include_router(editor_assist_routes.router)
    dependencies = get_editor_assist_dependencies()
    replacements: dict[str, Callable[..., Any]] = {}
    if writer is not None:
        replacements["invoke_writer"] = writer
    if structured_writer is not None:
        replacements["invoke_structured_writer"] = structured_writer
    if graph_runner is not None:
        replacements["run_graph"] = graph_runner
    if replacements:
        dependencies = replace(dependencies, **replacements)
    app.dependency_overrides[get_editor_assist_dependencies] = lambda: dependencies
    return TestClient(app)


def paragraph(word_count: int, *, token: str = "editorial") -> str:
    return " ".join([token] * word_count)


def research_profile_payload(
    *,
    angle: str | None = None,
    selected_status: str = "supported",
    bucket_findings: int = 2,
) -> str:
    selected_angle = {
        "angle": angle,
        "status": selected_status if angle else "not-requested",
        "summary": (
            f"Verified fact about {angle}."
            if angle and selected_status == "supported"
            else ""
        ),
        "citations": (
            [f"https://example.com/{angle}"]
            if angle and selected_status == "supported"
            else []
        ),
        "reason": f"{angle} support status is {selected_status}." if angle else "",
    }
    findings = [
        {
            "summary": f"Useful standard finding {index}.",
            "citations": [f"https://example.com/bucket-{index}"],
        }
        for index in range(bucket_findings)
    ]
    return json.dumps(
        {
            "selected_angle": selected_angle,
            "standard_buckets": {
                "reputation-summary": findings,
                "specific-offerings": [],
                "experience-texture": [],
                "history-or-ownership": [],
                "practical-usefulness": [],
                "best-for": [],
                "standout-hook": [],
                "social-proof": [],
                "visual-assets": [],
                "caveats-or-fit-warnings": [],
                "timing-tips": [],
                "neighborhood-context": [],
                "crowd-and-vibe": [],
            },
            "warnings": [],
        }
    )


def build_fake_curator(
    *,
    angle_directive: str,
    source_facts: list[tuple[str, str]],
) -> Callable[..., tuple[str, str]]:
    def _fake_curator(
        *, prompt: str, model_name: str, max_tokens: int, temperature: float
    ) -> tuple[str, str]:
        del prompt, max_tokens, temperature
        return (
            json.dumps(
                {
                    "angle_directive": angle_directive,
                    "source_facts": [
                        {"fact": fact, "citations": [citation]}
                        for fact, citation in source_facts
                    ],
                }
            ),
            model_name,
        )

    return _fake_curator
