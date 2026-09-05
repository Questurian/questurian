"""HTTP contract tests for Editor Assist Editorial Actions."""

import app.features.editor_assist.editorial_actions as editorial_actions
from tests.editor_assist_route_test_support import (
    FakeWriterResult,
    build_editor_assist_client,
)


def test_generate_title_uses_injected_writer():
    client = build_editor_assist_client(
        writer=lambda **_kwargs: FakeWriterResult(
            text="A Better Lima Headline",
            model_name="gemini-2.5-flash-lite",
        )
    )

    response = client.post(
        "/editor-assist/generate-title",
        json={
            "current_title": "A Lima Headline",
            "prompt": "Make it more specific.",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"title": "A Better Lima Headline"}


def test_rewrite_block_returns_envelope_content():
    client = build_editor_assist_client(
        writer=lambda **_kwargs: FakeWriterResult(
            text=(
                "<<<BLOCK>>>\n"
                "## Getting Around\n\nUpdated block text.\n"
                "<<<END_BLOCK>>>"
            ),
            model_name="gemini-2.5-flash-lite",
        )
    )

    response = client.post(
        "/editor-assist/rewrite-block",
        json={
            "prompt": "Tighten this section and make it clearer.",
            "block_content": "## Getting Around\n\nOriginal block text.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["rewritten_content"] == "## Getting Around\n\nUpdated block text."
    assert payload["model_used"] == "gemini-2.5-flash-lite"
