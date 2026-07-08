import pytest

from app.features.editor_assist import writer_models
from app.features.images import (
    alt_text_generator,
    edit_prompt_builder,
    insert_prompt_builder,
    scene_describer,
    subject_describer,
)


class _FakeLLM:
    model_name = "claude-test"

    def invoke(self, prompt: str) -> str:
        assert prompt == "write"
        return " result "


def test_writer_model_uses_shared_llm_factory(monkeypatch):
    captured = {}

    def fake_get_vertex_llm(**kwargs):
        captured.update(kwargs)
        return _FakeLLM()

    monkeypatch.setattr(
        writer_models, "get_vertex_llm", fake_get_vertex_llm, raising=False
    )

    # invoke_writer_model imports from utils at call time.
    monkeypatch.setattr("utils.get_vertex_llm", fake_get_vertex_llm)

    result = writer_models.invoke_writer_model(
        prompt="write",
        model_name="claude-test",
        max_tokens=123,
        temperature=0.2,
    )

    assert result.text == "result"
    assert result.model_name == "claude-test"
    assert captured == {
        "temperature": 0.2,
        "max_tokens": 123,
        "model_name": "claude-test",
    }


@pytest.mark.parametrize(
    ("module", "call", "expected_model"),
    [
        (
            alt_text_generator,
            lambda: alt_text_generator._generate_sync(b"image", "image/png", "focus"),
            "gemini-2.5-flash-lite",
        ),
        (
            scene_describer,
            lambda: scene_describer._describe_sync(b"image", "image/png"),
            "gemini-2.5-flash",
        ),
        (
            subject_describer,
            lambda: subject_describer._describe_sync(b"image", "image/png"),
            "gemini-2.5-flash",
        ),
        (
            edit_prompt_builder,
            lambda: edit_prompt_builder._build_sync(
                b"image",
                "image/png",
                "scene",
                "make it brighter",
            ),
            "gemini-2.5-flash",
        ),
    ],
)
def test_image_text_helpers_use_shared_multimodal_invoker(
    monkeypatch,
    module,
    call,
    expected_model,
):
    captured = {}

    def fake_part_from_data(*, data: bytes, mime_type: str):
        return {"data": data, "mime_type": mime_type}

    def fake_invoke(parts, *, model_name: str):
        captured["parts"] = parts
        captured["model_name"] = model_name
        return '"generated text"'

    monkeypatch.setattr(module, "vertex_part_from_data", fake_part_from_data)
    monkeypatch.setattr(module, "invoke_vertex_multimodal_text", fake_invoke)

    assert call() == "generated text"
    assert captured["model_name"] == expected_model
    assert captured["parts"][0] == {"data": b"image", "mime_type": "image/png"}
    assert isinstance(captured["parts"][-1], str)


def test_insert_prompt_uses_shared_multimodal_invoker(monkeypatch):
    captured = {}

    def fake_part_from_data(*, data: bytes, mime_type: str):
        return {"data": data, "mime_type": mime_type}

    def fake_invoke(parts, *, model_name: str):
        captured["parts"] = parts
        captured["model_name"] = model_name
        return "'insert prompt'"

    monkeypatch.setattr(
        insert_prompt_builder, "vertex_part_from_data", fake_part_from_data
    )
    monkeypatch.setattr(
        insert_prompt_builder, "invoke_vertex_multimodal_text", fake_invoke
    )

    result = insert_prompt_builder._build_sync(
        b"main",
        "image/jpeg",
        "main scene",
        [
            {
                "image_bytes": b"insert",
                "content_type": "image/png",
                "description": "subject",
            }
        ],
        "place left",
    )

    assert result == "insert prompt"
    assert captured["model_name"] == "gemini-2.5-flash"
    assert captured["parts"][0] == {"data": b"main", "mime_type": "image/jpeg"}
    assert captured["parts"][1] == {"data": b"insert", "mime_type": "image/png"}
    assert isinstance(captured["parts"][-1], str)
