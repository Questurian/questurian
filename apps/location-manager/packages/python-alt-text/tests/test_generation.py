import unittest
from types import SimpleNamespace
from unittest.mock import Mock

import generation


class EmptyGroundedResponseRetryTests(unittest.TestCase):
    def test_retries_one_empty_response(self) -> None:
        empty = SimpleNamespace(
            text="",
            candidates=[
                SimpleNamespace(
                    finish_reason="RECITATION",
                    finish_message="Response stopped",
                )
            ],
            prompt_feedback=None,
            response_id="first",
        )
        success = SimpleNamespace(text='{"suggestion": "restaurant"}')
        generate = Mock(side_effect=[empty, success])

        response = generation._generate_content_with_empty_response_retry(generate)

        self.assertIs(response, success)
        self.assertEqual(generate.call_count, 2)

    def test_reports_finish_reason_when_retry_is_also_empty(self) -> None:
        empty = SimpleNamespace(
            text="",
            candidates=[
                SimpleNamespace(
                    finish_reason="RECITATION",
                    finish_message="Response stopped",
                )
            ],
            prompt_feedback=None,
            response_id="empty",
        )
        generate = Mock(return_value=empty)

        with self.assertRaisesRegex(RuntimeError, "RECITATION"):
            generation._generate_content_with_empty_response_retry(generate)

        self.assertEqual(generate.call_count, 2)


if __name__ == "__main__":
    unittest.main()
