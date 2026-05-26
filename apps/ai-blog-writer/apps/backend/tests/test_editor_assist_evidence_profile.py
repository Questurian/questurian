"""Tests for Evidence Profile (ADR 0005)."""

from __future__ import annotations

import json
from dataclasses import dataclass

import pytest

from app.features.editor_assist import evidence_profile as ep_mod
from app.features.editor_assist.evidence_profile import (
    EVIDENCE_TARGET_POOLS,
    EvidenceFinding,
    EvidenceProfile,
    EvidenceProfileRequest,
    build_evidence_profile_prompt,
    run_evidence_profile,
    run_evidence_profiles_concurrently,
)


@dataclass(frozen=True)
class _FakeGroundedResult:
    text: str
    source_urls: list[str]
    model_name: str = "gemini-2.5-flash"


def _ok_payload(angle: str = "signature-dish") -> str:
    return json.dumps({
        "bucket": "rich-public-evidence",
        "validated": [
            {
                "angle": angle,
                "summary": "Known for the tiradito with leche de tigre, on the menu since 2015.",
                "citations": ["https://example.com/eater-lima"],
            }
        ],
    })


# ---------- Prompt ----------


def test_prompt_includes_venue_location_category_and_pool():
    prompt = build_evidence_profile_prompt(
        venue_name="Maido",
        location_label="Miraflores, Lima",
        category="dining",
        target_pool=EVIDENCE_TARGET_POOLS["dining"],
    )
    assert "Maido" in prompt
    assert "Miraflores, Lima" in prompt
    assert "dining" in prompt
    for angle in EVIDENCE_TARGET_POOLS["dining"]:
        assert angle in prompt


# ---------- Parser ----------


def test_parser_keeps_validated_with_citations(monkeypatch):
    monkeypatch.setattr(
        ep_mod, "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(text=_ok_payload(), source_urls=[]),
    )
    profile, _trace = run_evidence_profile(
        venue_name="Maido", location_label="Lima", category="dining"
    )
    assert profile.bucket == "rich-public-evidence"
    assert profile.research_targets == ["signature-dish"]
    assert profile.findings["signature-dish"].citations == ["https://example.com/eater-lima"]


def test_parser_drops_uncited_validations(monkeypatch):
    payload = json.dumps({
        "bucket": "rich-public-evidence",
        "validated": [
            {"angle": "signature-dish", "summary": "x", "citations": []},
            {"angle": "atmosphere", "summary": "y", "citations": ["https://example.com"]},
        ],
    })
    monkeypatch.setattr(
        ep_mod, "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(text=payload, source_urls=[]),
    )
    profile, _trace = run_evidence_profile(
        venue_name="x", location_label="y", category="dining"
    )
    assert profile.research_targets == ["atmosphere"]


def test_parser_drops_unknown_angles(monkeypatch):
    payload = json.dumps({
        "bucket": "sparse-public-evidence",
        "validated": [
            {"angle": "not-a-real-angle", "summary": "x", "citations": ["http://x"]},
            {"angle": "atmosphere", "summary": "y", "citations": ["http://y"]},
        ],
    })
    monkeypatch.setattr(
        ep_mod, "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(text=payload, source_urls=[]),
    )
    profile, _trace = run_evidence_profile(
        venue_name="x", location_label="y", category="dining"
    )
    assert profile.research_targets == ["atmosphere"]


def test_empty_validated_forces_no_public_evidence_bucket(monkeypatch):
    payload = json.dumps({"bucket": "rich-public-evidence", "validated": []})
    monkeypatch.setattr(
        ep_mod, "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(text=payload, source_urls=[]),
    )
    profile, _trace = run_evidence_profile(
        venue_name="x", location_label="y", category="dining"
    )
    assert profile.bucket == "no-public-evidence"
    assert profile.research_targets == []


def test_invalid_bucket_value_normalized(monkeypatch):
    payload = json.dumps({
        "bucket": "completely-made-up",
        "validated": [
            {"angle": "signature-dish", "summary": "x", "citations": ["http://x"]},
        ],
    })
    monkeypatch.setattr(
        ep_mod, "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(text=payload, source_urls=[]),
    )
    profile, _trace = run_evidence_profile(
        venue_name="x", location_label="y", category="dining"
    )
    # Invalid bucket falls back to no-public-evidence but findings still kept.
    assert profile.bucket == "no-public-evidence"


def test_parser_handles_fenced_json(monkeypatch):
    fenced = f"```json\n{_ok_payload()}\n```"
    monkeypatch.setattr(
        ep_mod, "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(text=fenced, source_urls=[]),
    )
    profile, _trace = run_evidence_profile(
        venue_name="x", location_label="y", category="dining"
    )
    assert profile.research_targets == ["signature-dish"]


def test_invalid_json_returns_no_evidence(monkeypatch):
    monkeypatch.setattr(
        ep_mod, "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(text="not json at all", source_urls=[]),
    )
    profile, _trace = run_evidence_profile(
        venue_name="x", location_label="y", category="dining"
    )
    assert profile == EvidenceProfile(
        bucket="no-public-evidence", research_targets=[], findings={}
    )


def test_grounded_call_failure_returns_no_evidence(monkeypatch):
    def _boom(*a, **kw):
        raise RuntimeError("vertex unavailable")
    monkeypatch.setattr(ep_mod, "_invoke_grounded", _boom)
    profile, _trace = run_evidence_profile(
        venue_name="x", location_label="y", category="dining"
    )
    assert profile.bucket == "no-public-evidence"
    assert profile.research_targets == []


def test_empty_grounded_text_returns_no_evidence(monkeypatch):
    monkeypatch.setattr(
        ep_mod, "_invoke_grounded",
        lambda *a, **kw: _FakeGroundedResult(text="   ", source_urls=[]),
    )
    profile, _trace = run_evidence_profile(
        venue_name="x", location_label="y", category="dining"
    )
    assert profile.bucket == "no-public-evidence"


def test_unsupported_category_returns_no_evidence(monkeypatch):
    # Should short-circuit before touching the grounded helper.
    def _should_not_be_called(*a, **kw):
        raise AssertionError("grounded helper invoked for unsupported category")
    monkeypatch.setattr(ep_mod, "_invoke_grounded", _should_not_be_called)
    profile, _trace = run_evidence_profile(
        venue_name="x", location_label="y", category="key_location"
    )
    assert profile.research_targets == []


# ---------- Concurrent fan-out ----------


def test_concurrent_runs_return_keyed_by_target_id(monkeypatch):
    payload_for = {
        "t1": _ok_payload("signature-dish"),
        "t2": _ok_payload("atmosphere"),
    }
    def _route(prompt, **kw):
        # Pick payload by which venue name is in the prompt.
        for tid, txt in payload_for.items():
            if tid in prompt:
                return _FakeGroundedResult(text=txt, source_urls=[])
        return _FakeGroundedResult(text="", source_urls=[])

    monkeypatch.setattr(ep_mod, "_invoke_grounded", _route)
    requests = [
        EvidenceProfileRequest("t1", "t1", "Lima", "dining"),
        EvidenceProfileRequest("t2", "t2", "Lima", "dining"),
    ]
    results = run_evidence_profiles_concurrently(requests)
    assert set(results.keys()) == {"t1", "t2"}
    assert results["t1"][0].research_targets == ["signature-dish"]
    assert results["t2"][0].research_targets == ["atmosphere"]
    # Trace populated for each.
    assert results["t1"][1].prompt
    assert results["t2"][1].prompt


def test_concurrent_runs_empty_input_returns_empty():
    assert run_evidence_profiles_concurrently([]) == {}
