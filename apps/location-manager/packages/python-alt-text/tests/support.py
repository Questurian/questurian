"""Shared request builders for field-suggestion tests."""

import app


def make_url_field_suggestion_request(
    **overrides,
) -> app.FieldSuggestionRequest:
    defaults = {
        "category": "dining",
        "field_key": "menuUrl",
        "field_label": "Menu",
        "kind": "url",
        "allowed_options": [],
        "form_values": {"name": "Maido", "address": "Calle San Martin 399, Lima"},
        "api_context": {"website": "https://maido.pe"},
    }
    defaults.update(overrides)
    return app.FieldSuggestionRequest(**defaults)
