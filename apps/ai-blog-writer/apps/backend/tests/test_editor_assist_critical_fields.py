"""Tests for the four-boolean Critical Fields gate."""

from app.features.editor_assist.critical_fields import (
    CriticalFieldsResult,
    evaluate_critical_fields,
)


def _ok_kwargs(**overrides):
    base = {
        "name": "Maido",
        "category": "dining",
        "location_label": "Miraflores, Lima",
        "payload_doc_id": "abc123",
    }
    base.update(overrides)
    return base


def test_passes_when_all_four_present():
    result = evaluate_critical_fields(**_ok_kwargs())
    assert result == CriticalFieldsResult(passed=True, missing=[])


def test_missing_name_fails():
    result = evaluate_critical_fields(**_ok_kwargs(name=""))
    assert result.passed is False
    assert "name" in result.missing


def test_whitespace_name_fails():
    result = evaluate_critical_fields(**_ok_kwargs(name="   "))
    assert "name" in result.missing


def test_missing_category_fails():
    result = evaluate_critical_fields(**_ok_kwargs(category=None))
    assert "category" in result.missing


def test_unsupported_category_fails():
    result = evaluate_critical_fields(**_ok_kwargs(category="recipes"))
    assert "category" in result.missing


def test_supported_categories_pass():
    for category in (
        "dining", "accommodations", "attractions", "nightlife", "key_location"
    ):
        result = evaluate_critical_fields(**_ok_kwargs(category=category))
        assert result.passed, f"{category} should pass identity gate"


def test_missing_location_label_fails():
    result = evaluate_critical_fields(**_ok_kwargs(location_label=None))
    assert "location_label" in result.missing


def test_missing_payload_doc_id_fails():
    result = evaluate_critical_fields(**_ok_kwargs(payload_doc_id=None))
    assert "payload_doc_id" in result.missing


def test_all_missing_lists_every_field():
    result = evaluate_critical_fields(
        name=None, category=None, location_label=None, payload_doc_id=None
    )
    assert result.passed is False
    assert set(result.missing) == {"name", "category", "location_label", "payload_doc_id"}
