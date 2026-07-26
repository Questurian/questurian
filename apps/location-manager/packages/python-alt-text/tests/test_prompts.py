import unittest

import app
from tests.support import make_url_field_suggestion_request


class FieldSuggestionPromptTests(unittest.TestCase):
    def test_accommodations_prompt_includes_allowed_options_and_context(self) -> None:
        request = app.AccommodationsFieldSuggestionRequest(
            field_key="wifi",
            field_label="WiFi",
            kind="single",
            allowed_options=[
                app.AccommodationsOption(value="yes", label="Yes"),
                app.AccommodationsOption(value="no", label="No"),
            ],
            form_values={"name": "Example Hotel", "address": "123 Main St"},
            api_context={"website": "https://example.com"},
        )

        prompt = app.build_accommodations_field_suggestion_prompt(request)

        self.assertIn("allowed_options", prompt)
        self.assertIn('"value": "yes"', prompt)
        self.assertIn("Example Hotel", prompt)
        self.assertIn("Return only JSON", prompt)

    def test_url_prompt_drops_option_constraint_language(self) -> None:
        prompt = app.build_field_suggestion_prompt(make_url_field_suggestion_request())

        self.assertIn("absolute http:// or https:// URL", prompt)
        self.assertNotIn("allowed_options", prompt)
        self.assertIn("Maido", prompt)
