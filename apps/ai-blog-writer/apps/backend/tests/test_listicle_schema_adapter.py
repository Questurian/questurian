"""Two fields the model was being asked for that the pipeline already knew.

Part of the token work in the verified plan of 2026-09-09. The rule it follows:
**stop asking for what can be derived, and change nothing about what is
offered.** Every shape stays on the menu, every option keeps its wording, and
the operator sees exactly what they saw before.

The wrapping is deliberate. The article grill and the listicle grill share one
schema and one loop, which is why a bug in the loop is fixed once; editing that
shared schema so a listicle turn costs less would put a listicle concern inside
the thing both of them run on.
"""

from __future__ import annotations

import copy

from app.features.listicle_pipeline import service
from app.features.prompt2blog.grill_v4 import NEXT_TURN_SCHEMA


class _Recording:
    """A model that answers with whatever it was handed, and keeps the ask."""

    def __init__(self, payload):
        self.payload = payload
        self.schema = None
        self.model_name = None
        self.kwargs = None

    def invoke_json(self, *, prompt, model_name, schema, **kwargs):
        self.schema = schema
        self.model_name = model_name
        self.kwargs = kwargs
        return copy.deepcopy(self.payload), "raw provider text"


def _option_properties(schema):
    return schema["properties"]["options"]["items"]["properties"]


def test_the_model_is_not_asked_for_a_field_the_catalogue_holds():
    inner = _Recording({"done": False, "options": []})
    service._ListicleLLM(inner).invoke_json(
        prompt="x", model_name="m", schema=NEXT_TURN_SCHEMA
    )
    assert "group" not in _option_properties(inner.schema)
    assert "shape" in _option_properties(inner.schema), "the key it IS asked for"


def test_the_shared_schema_is_not_edited_in_place():
    """It is a module-level object the article grill uses too."""
    before = copy.deepcopy(NEXT_TURN_SCHEMA)
    inner = _Recording({"done": False, "options": []})
    service._ListicleLLM(inner).invoke_json(
        prompt="x", model_name="m", schema=NEXT_TURN_SCHEMA
    )
    assert NEXT_TURN_SCHEMA == before


def test_the_theme_is_filled_from_the_shape_the_option_names():
    inner = _Recording(
        {
            "done": False,
            "options": [
                {"text": "family-run cevicherias", "recommended": True, "shape": "family"},
                {"text": "something of my own", "recommended": False, "shape": ""},
            ],
        }
    )
    payload, _ = service._ListicleLLM(inner).invoke_json(
        prompt="x", model_name="m", schema=NEXT_TURN_SCHEMA
    )
    assert payload["options"][0]["group"] == "heritage"
    # An option the model wrote itself has no shape and therefore no theme.
    # Empty is the honest answer rather than a missing field.
    assert payload["options"][1]["group"] == ""


def test_the_recommendation_is_composed_from_the_options_in_order():
    inner = _Recording(
        {
            "done": False,
            "recommendation": "",
            "options": [
                {"text": "first line", "recommended": True, "shape": "family"},
                {"text": "not this one", "recommended": False, "shape": "cheap"},
                {"text": "second line", "recommended": True, "shape": "district"},
            ],
        }
    )
    payload, _ = service._ListicleLLM(inner).invoke_json(
        prompt="x", model_name="m", schema=NEXT_TURN_SCHEMA
    )
    assert payload["recommendation"] == "first line\nsecond line"


def test_a_recommendation_the_model_wrote_is_left_alone():
    """It is the model's answer to its own question, and this is not the place
    to overrule it."""
    inner = _Recording(
        {
            "done": False,
            "recommendation": "I would take these three.",
            "options": [{"text": "first line", "recommended": True, "shape": "family"}],
        }
    )
    payload, _ = service._ListicleLLM(inner).invoke_json(
        prompt="x", model_name="m", schema=NEXT_TURN_SCHEMA
    )
    assert payload["recommendation"] == "I would take these three."


def test_a_question_with_no_options_is_untouched():
    """Every other turn keeps the model's own recommendation, which is the
    whole content of those turns."""
    inner = _Recording(
        {"done": False, "recommendation": "20", "ask": "How many?", "options": []}
    )
    payload, _ = service._ListicleLLM(inner).invoke_json(
        prompt="x", model_name="m", schema=NEXT_TURN_SCHEMA
    )
    assert payload["recommendation"] == "20"


def test_a_menu_with_nothing_recommended_is_not_given_an_approval():
    """Inventing one is exactly the failure the menu exists to prevent. The
    engine's own guards refuse the turn."""
    inner = _Recording(
        {
            "done": False,
            "recommendation": "",
            "options": [{"text": "a line", "recommended": False, "shape": "family"}],
        }
    )
    payload, _ = service._ListicleLLM(inner).invoke_json(
        prompt="x", model_name="m", schema=NEXT_TURN_SCHEMA
    )
    assert payload["recommendation"] == ""


def test_everything_else_about_the_call_passes_straight_through():
    inner = _Recording({"done": True, "consensus": "agreed"})
    payload, raw = service._ListicleLLM(inner).invoke_json(
        prompt="the prompt", model_name="a-model", schema=NEXT_TURN_SCHEMA, seed=7
    )
    assert inner.model_name == "a-model"
    assert inner.kwargs == {"seed": 7}
    assert raw == "raw provider text"
    assert payload["consensus"] == "agreed"


def test_the_job_id_still_reaches_the_engine():
    """The listicle grill reported itself as `p2b.grill` once, and the usage
    dashboard billed a listicle interview to Prompt2Blog. Wrapping the model
    call must not put that back."""
    from app.features.prompt2blog.grill_v4 import GrillDependencies

    base = GrillDependencies(
        llm=_Recording({}), research=lambda _: ("", [], 0), job_id="listicle.grill"
    )
    assert service._dependencies(base).job_id == "listicle.grill"
