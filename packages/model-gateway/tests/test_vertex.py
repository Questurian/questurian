"""Making a Vertex call: what is preserved, and what is now reported."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from model_gateway import vertex


def empty_response(response_id: str) -> SimpleNamespace:
    """What Vertex answers a RECITATION-stopped generation with: nothing."""
    return SimpleNamespace(
        text="",
        candidates=[
            SimpleNamespace(finish_reason="RECITATION", finish_message="Response stopped")
        ],
        prompt_feedback=None,
        response_id=response_id,
    )


class EmptyResponseRetry(unittest.TestCase):
    """Moved here with the call it guards.

    Vertex answers a RECITATION stop with an empty body rather than an error,
    and the second attempt usually succeeds. Exactly one retry: a second empty
    answer is a prompt problem, and a third call will not fix it.
    """

    def test_retries_one_empty_response(self):
        success = SimpleNamespace(text='{"suggestion": "restaurant"}')
        generate = Mock(side_effect=[empty_response("first"), success])

        self.assertIs(vertex._with_empty_response_retry(generate), success)
        self.assertEqual(generate.call_count, 2)

    def test_reports_the_finish_reason_when_the_retry_is_also_empty(self):
        # The finish reason is the only clue why, so it has to survive into
        # the error a caller sees.
        generate = Mock(return_value=empty_response("empty"))

        with self.assertRaisesRegex(RuntimeError, "RECITATION"):
            vertex._with_empty_response_retry(generate)

        self.assertEqual(generate.call_count, 2)

    def test_does_not_retry_an_answer_that_arrived(self):
        success = SimpleNamespace(text="ok")
        generate = Mock(return_value=success)

        self.assertIs(vertex._with_empty_response_retry(generate), success)
        self.assertEqual(generate.call_count, 1)


class ReadingProviderUsage(unittest.TestCase):
    """Both SDKs report usage as an object, and the normaliser reads dicts.

    Handing the object straight through is exactly how a call records a
    duration and no tokens: nothing raises, nothing warns, the row is quietly
    empty. This is the seam that stops that.
    """

    def test_a_protobuf_style_object_is_read_field_by_field(self):
        usage = SimpleNamespace(
            prompt_token_count=120,
            candidates_token_count=340,
            total_token_count=460,
        )
        self.assertEqual(
            vertex.usage_dict(usage),
            {
                "prompt_token_count": 120,
                "candidates_token_count": 340,
                "total_token_count": 460,
            },
        )

    def test_thinking_tokens_survive_into_the_normaliser(self):
        from model_gateway.tokens import normalize_token_usage

        usage = SimpleNamespace(
            prompt_token_count=100,
            candidates_token_count=200,
            total_token_count=355,
            thoughts_token_count=55,
        )
        normalized = normalize_token_usage(vertex.usage_dict(usage))
        # Google bills reasoning at the output rate, so it belongs in output
        # as well as being reported on its own.
        self.assertEqual(normalized["output_tokens"], 255)
        self.assertEqual(normalized["reasoning_tokens"], 55)

    def test_a_dict_is_passed_through_untouched(self):
        usage = {"input_tokens": 5, "output_tokens": 6}
        self.assertIs(vertex.usage_dict(usage), usage)

    def test_nothing_reported_stays_nothing(self):
        self.assertIsNone(vertex.usage_dict(None))

    def test_an_unreadable_object_is_none_rather_than_zero(self):
        # A confident zero would be indistinguishable from a free call.
        self.assertIsNone(vertex.usage_dict(object()))

    def test_a_boolean_is_not_a_token_count(self):
        self.assertIsNone(vertex.usage_dict(SimpleNamespace(prompt_token_count=True)))


class ResolvingBeforeCalling(unittest.TestCase):
    def test_a_job_with_no_model_behind_it_is_refused(self):
        # The Places lookups resolve to no model at all. Calling Vertex for
        # one would be a bug that only shows up as a confusing provider error.
        with self.assertRaises(ValueError):
            vertex._resolve("listicle.identity", None)

    def test_surrounding_quotes_are_stripped_from_an_answer(self):
        self.assertEqual(vertex._clean('  "a plated dish"  '), "a plated dish")


if __name__ == "__main__":
    unittest.main()


class ThinkingTokensTheSdkDoesNotName(unittest.TestCase):
    """The `vertexai` usage proto has three fields and no thinking field.

    On a thinking model the reasoning is in the total and nowhere else, so
    reading `candidates_token_count` alone charges for the visible answer and
    nothing for the reasoning that produced it. Measured on a real 2.5 Pro
    alt-text call, that understated the cost 5.6x.
    """

    def test_the_remainder_of_the_total_is_attributed_to_reasoning(self):
        usage = SimpleNamespace(
            prompt_token_count=1381,
            candidates_token_count=21,
            total_token_count=2285,
        )
        self.assertEqual(vertex.usage_dict(usage)["thoughts_token_count"], 883)

    def test_the_corrected_counts_price_the_call_properly(self):
        from model_gateway.rates import estimated_cost
        from model_gateway.tokens import normalize_token_usage

        usage = SimpleNamespace(
            prompt_token_count=1381,
            candidates_token_count=21,
            total_token_count=2285,
        )
        counts = normalize_token_usage(vertex.usage_dict(usage))
        priced = estimated_cost(
            model_name="gemini-2.5-pro",
            input_tokens=counts["input_tokens"],
            output_tokens=counts["output_tokens"],
            cached_input_tokens=counts["cached_input_tokens"],
        )
        # $0.0019 was what the naive read produced for this exact call.
        self.assertAlmostEqual(priced, 0.010766, places=5)

    def test_a_provider_that_names_its_thinking_tokens_is_left_alone(self):
        usage = SimpleNamespace(
            prompt_token_count=100,
            candidates_token_count=200,
            total_token_count=355,
            thoughts_token_count=55,
        )
        self.assertEqual(vertex.usage_dict(usage)["thoughts_token_count"], 55)

    def test_a_total_that_matches_adds_nothing(self):
        usage = SimpleNamespace(
            prompt_token_count=100,
            candidates_token_count=200,
            total_token_count=300,
        )
        self.assertNotIn("thoughts_token_count", vertex.usage_dict(usage))

    def test_a_total_smaller_than_its_parts_is_not_negative_reasoning(self):
        usage = SimpleNamespace(
            prompt_token_count=100,
            candidates_token_count=200,
            total_token_count=250,
        )
        self.assertNotIn("thoughts_token_count", vertex.usage_dict(usage))

    def test_no_total_means_no_inference(self):
        usage = SimpleNamespace(prompt_token_count=100, candidates_token_count=200)
        self.assertNotIn("thoughts_token_count", vertex.usage_dict(usage))
