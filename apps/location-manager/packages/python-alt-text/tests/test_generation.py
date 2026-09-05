"""What this service still decides for itself.

The empty-response retry that used to live here moved into the model gateway
with the call it guards, and is tested there
(`packages/model-gateway/tests/test_vertex.py`). What is left is this
service's own logic: which job a request is, and the validation it does before
spending anything.
"""

import unittest
from unittest.mock import Mock

import generation
from models import AccommodationsOption, FieldSuggestionRequest


def request(category: str = "accommodations", kind: str = "single", **overrides):
    options = overrides.pop(
        "allowed_options",
        [
            AccommodationsOption(value="hotel", label="Hotel"),
            AccommodationsOption(value="hostel", label="Hostel"),
        ],
    )
    return FieldSuggestionRequest(
        category=category,
        field_key="property_type",
        field_label="Property type",
        kind=kind,
        allowed_options=options,
        form_values={"name": "Hotel B"},
        **overrides,
    )


class WhichJobARequestIs(unittest.TestCase):
    def test_dining_and_accommodations_are_separate_jobs(self):
        # Separately worth costing: dining runs far more often, and a model
        # change that is right for one may not be right for the other.
        self.assertEqual(
            generation.FIELD_SUGGESTION_JOBS["dining"], "lm.dining_field_suggestion"
        )
        self.assertEqual(
            generation.FIELD_SUGGESTION_JOBS["accommodations"],
            "lm.accommodations_field_suggestion",
        )

    def test_the_job_id_reaches_the_generator(self):
        generator = Mock(return_value={"suggestion": "hotel", "confidence": 90})
        generation.generate_field_suggestion(request(category="dining"), generator)
        self.assertEqual(generator.call_args.kwargs["job_id"], "lm.dining_field_suggestion")

    def test_the_model_is_left_to_the_gateway(self):
        # A call site that names a model is the bug this work exists to remove.
        generator = Mock(return_value={"suggestion": "hotel", "confidence": 90})
        generation.generate_field_suggestion(request(), generator)
        self.assertIsNone(generator.call_args.args[1])


class RefusedBeforeAnythingIsSpent(unittest.TestCase):
    def test_an_unsupported_category_never_reaches_a_model(self):
        generator = Mock()
        with self.assertRaises(ValueError):
            generation.generate_field_suggestion(request(category="nightlife"), generator)
        generator.assert_not_called()

    def test_an_unknown_kind_never_reaches_a_model(self):
        generator = Mock()
        with self.assertRaises(ValueError):
            generation.generate_field_suggestion(request(kind="freeform"), generator)
        generator.assert_not_called()

    def test_a_choice_with_no_options_never_reaches_a_model(self):
        generator = Mock()
        with self.assertRaises(ValueError):
            generation.generate_field_suggestion(request(allowed_options=[]), generator)
        generator.assert_not_called()


class UrlSuggestions(unittest.TestCase):
    def test_a_suggestion_that_is_not_a_url_is_dropped(self):
        generator = Mock(return_value={"suggestion": "call them", "confidence": 80})
        result = generation.generate_field_suggestion(
            request(kind="url", allowed_options=[]), generator
        )
        self.assertIsNone(result["suggestion"])
        self.assertEqual(result["confidence"], 0)

    def test_a_real_url_is_kept(self):
        generator = Mock(
            return_value={"suggestion": "https://example.test/menu", "confidence": 80}
        )
        result = generation.generate_field_suggestion(
            request(kind="url", allowed_options=[]), generator
        )
        self.assertEqual(result["suggestion"], "https://example.test/menu")


if __name__ == "__main__":
    unittest.main()
