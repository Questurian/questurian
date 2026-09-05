"""The Claude substitution, and what reaches the usage collector."""

from __future__ import annotations

import os
import unittest
from unittest import mock

from model_gateway import jobs, substitution, usage
from model_gateway.settings import Settings, SettingsConfig

BOTH_OFF = {
    "ANTHROPIC_MODELS_ENABLED": "",
    "CLAUDE_SUBSCRIPTION_MODELS_ENABLED": "",
}


class ClaudeSubstitution(unittest.TestCase):
    def test_a_gemini_name_is_never_touched(self):
        with mock.patch.dict(os.environ, BOTH_OFF):
            self.assertEqual(
                substitution.effective_model("gemini-2.5-pro"), "gemini-2.5-pro"
            )

    def test_a_claude_name_is_substituted_while_no_claude_path_is_on(self):
        with mock.patch.dict(os.environ, BOTH_OFF):
            self.assertEqual(
                substitution.effective_model("claude-sonnet-5"), "gemini-2.5-flash"
            )

    def test_an_effort_tagged_name_nobody_listed_still_lands_somewhere_known(self):
        # `claude-sonnet-5-medium` is what three Prompt2Blog stages actually
        # ask for, and it is not in the map. It reaches Flash through the
        # default, which is the behaviour being preserved, not improved.
        with mock.patch.dict(os.environ, BOTH_OFF):
            self.assertEqual(
                substitution.effective_model("claude-sonnet-5-medium"),
                "gemini-2.5-flash",
            )

    def test_a_claude_name_passes_through_when_the_api_key_path_is_on(self):
        with mock.patch.dict(os.environ, {**BOTH_OFF, "ANTHROPIC_MODELS_ENABLED": "1"}):
            self.assertEqual(
                substitution.effective_model("claude-sonnet-5"), "claude-sonnet-5"
            )

    def test_a_claude_name_passes_through_on_the_subscription_path(self):
        with mock.patch.dict(
            os.environ, {**BOTH_OFF, "CLAUDE_SUBSCRIPTION_MODELS_ENABLED": "on"}
        ):
            self.assertEqual(
                substitution.effective_model("claude-sonnet-5"), "claude-sonnet-5"
            )

    def test_the_api_key_path_wins_when_both_are_on(self):
        # Switching the subscription path on must never silently re-point a
        # machine that already had a funded key configured.
        with mock.patch.dict(
            os.environ,
            {"ANTHROPIC_MODELS_ENABLED": "1", "CLAUDE_SUBSCRIPTION_MODELS_ENABLED": "1"},
        ):
            self.assertEqual(
                substitution.claude_provider(), substitution.PROVIDER_ANTHROPIC_API
            )

    def test_the_report_says_what_is_actually_serving_each_name(self):
        with mock.patch.dict(os.environ, BOTH_OFF):
            report = {row["requested"]: row for row in substitution.substitution_report()}
        self.assertTrue(report["claude-sonnet-5"]["substituted"])
        self.assertEqual(report["claude-sonnet-5"]["served_by"], "gemini-2.5-flash")


def collecting_emitter() -> tuple[usage.UsageEmitter, list[dict]]:
    """A synchronous emitter whose events land in a list instead of a socket."""
    sent: list[dict] = []
    emitter = usage.UsageEmitter(
        usage.UsageMonitorConfig(
            url=None, key=None, service=usage.DEFAULT_SERVICE, timeout_seconds=1.0
        ),
        transport=lambda batch: sent.extend(batch),
        synchronous=True,
    )
    return emitter, sent


class ReportingAJobsCall(unittest.TestCase):
    def test_the_job_id_is_the_feature(self):
        emitter, sent = collecting_emitter()
        with usage.observe_job_call(
            "lm.alt_text", provider="google-vertex", model="gemini-2.5-pro", emitter=emitter
        ):
            pass
        self.assertEqual(sent[0]["feature"], "lm.alt_text")

    def test_the_service_name_comes_from_the_job_s_app(self):
        # Neither process has to remember to configure this, and the two never
        # collapse into one row.
        emitter, sent = collecting_emitter()
        with usage.observe_job_call("lm.alt_text", provider="google-vertex", emitter=emitter):
            pass
        with usage.observe_job_call("p2b.compose", provider="google-vertex", emitter=emitter):
            pass
        self.assertEqual(sent[0]["service"], "lm-alt-text")
        self.assertEqual(sent[1]["service"], "abw-backend")

    def test_an_explicitly_configured_service_name_still_wins(self):
        emitter, sent = collecting_emitter()
        emitter._config = usage.UsageMonitorConfig(
            url=None, key=None, service="something-else", timeout_seconds=1.0
        )
        with usage.observe_job_call("lm.alt_text", provider="google-vertex", emitter=emitter):
            pass
        self.assertEqual(sent[0]["service"], "something-else")

    def test_tokens_are_recorded_and_the_call_is_priced(self):
        emitter, sent = collecting_emitter()
        with usage.observe_job_call(
            "lm.alt_text", provider="google-vertex", model="gemini-2.5-flash", emitter=emitter
        ) as observed:
            observed.record_usage({"input_tokens": 1_000_000, "output_tokens": 1_000_000})
        event = sent[0]
        # Wire names, not the provider's: the contract calls these input/output.
        self.assertEqual(event["tokens"]["input"], 1_000_000)
        self.assertEqual(event["tokens"]["output"], 1_000_000)
        self.assertAlmostEqual(event["costUsd"], 2.80)
        self.assertEqual(event["costBasis"], usage.COST_BASIS_RATE_TABLE)

    def test_reasoning_tokens_are_billed_as_output(self):
        # LangChain files thinking tokens outside `output_tokens`, and Google
        # bills them at the output rate. Reading the visible answer alone
        # undercounts every reasoning call, silently.
        emitter, sent = collecting_emitter()
        with usage.observe_job_call(
            "p2b.compose", provider="google-vertex", model="gemini-2.5-flash", emitter=emitter
        ) as observed:
            observed.record_usage(
                {
                    "input_tokens": 0,
                    "output_tokens": 1_000_000,
                    "output_token_details": {"reasoning": 1_000_000},
                }
            )
        self.assertAlmostEqual(sent[0]["costUsd"], 5.00)

    def test_a_model_with_no_rate_is_reported_unpriced_and_says_why(self):
        emitter, sent = collecting_emitter()
        with usage.observe_job_call(
            "lm.alt_text", provider="google-vertex", model="gemini-9.9-imaginary", emitter=emitter
        ) as observed:
            observed.record_usage({"input_tokens": 10, "output_tokens": 10})
        event = sent[0]
        self.assertNotIn("costUsd", event)
        self.assertEqual(event["metadata"][usage.UNPRICED_REASON_KEY], usage.UNPRICED_NO_RATE)

    def test_a_subscription_call_is_never_given_a_price(self):
        # The CLI reports what those tokens would have cost on the API. That
        # is not money owed, and putting it on the cost chart next to real
        # Vertex spend would make the total a confident lie.
        emitter, sent = collecting_emitter()
        with usage.observe_job_call(
            "p2b.compose", provider="claude-cli", model="claude-sonnet-5", emitter=emitter
        ) as observed:
            observed.record_usage({"input_tokens": 10, "output_tokens": 10})
        event = sent[0]
        self.assertNotIn("costUsd", event)
        self.assertEqual(
            event["metadata"][usage.UNPRICED_REASON_KEY], usage.UNPRICED_SUBSCRIPTION
        )

    def test_a_failed_call_is_reported_with_its_kind_before_it_is_raised(self):
        # The failure path is the point: a stage that catches its own
        # exceptions still leaves this block by raising, so the dashboard's
        # failure rate is real rather than a count of what someone logged.
        emitter, sent = collecting_emitter()

        class Exhausted(Exception):
            pass

        with self.assertRaises(Exhausted):
            with usage.observe_job_call(
                "lm.alt_text", provider="google-vertex", emitter=emitter
            ):
                raise Exhausted("Resource exhausted: quota exceeded")

        event = sent[0]
        self.assertEqual(event["status"], "error")
        self.assertEqual(event["errorKind"], "quota_exhausted")

    def test_nothing_is_sent_when_no_collector_is_configured(self):
        sent: list[dict] = []
        emitter = usage.UsageEmitter(
            usage.UsageMonitorConfig(
                url=None, key=None, service=usage.DEFAULT_SERVICE, timeout_seconds=1.0
            ),
            transport=lambda batch: sent.extend(batch),
        )
        with usage.observe_job_call("lm.alt_text", provider="google-vertex", emitter=emitter):
            pass
        self.assertEqual(sent, [])

    def test_a_collector_that_throws_never_reaches_the_caller(self):
        # An observability bug must not become a pipeline bug.
        def explode(_batch):
            raise OSError("collector is down")

        emitter = usage.UsageEmitter(
            usage.UsageMonitorConfig(
                url=None, key=None, service=usage.DEFAULT_SERVICE, timeout_seconds=1.0
            ),
            transport=explode,
            synchronous=True,
        )
        with usage.observe_job_call("lm.alt_text", provider="google-vertex", emitter=emitter):
            pass
        self.assertEqual(emitter.failed_batches, 1)


class ResolvingThroughThePackage(unittest.TestCase):
    def test_model_for_applies_the_substitution(self):
        import model_gateway

        settings = Settings(
            config=SettingsConfig(url=None, key=None, ttl_seconds=60.0, timeout_seconds=1.0)
        )
        model_gateway.set_settings(settings)
        try:
            with mock.patch.dict(os.environ, BOTH_OFF):
                self.assertEqual(
                    model_gateway.requested_model_for("p2b.outline"),
                    "claude-sonnet-5-medium",
                )
                self.assertEqual(
                    model_gateway.model_for("p2b.outline"), "gemini-2.5-flash"
                )
        finally:
            model_gateway.set_settings(None)

    def test_a_places_job_resolves_to_no_model_at_all(self):
        import model_gateway

        settings = Settings(
            config=SettingsConfig(url=None, key=None, ttl_seconds=60.0, timeout_seconds=1.0)
        )
        model_gateway.set_settings(settings)
        try:
            self.assertIsNone(model_gateway.model_for("listicle.resolve_place"))
        finally:
            model_gateway.set_settings(None)

    def test_every_registered_job_resolves_to_something(self):
        # The registry and the defaults are checked against each other
        # elsewhere; this checks the whole path a call site actually takes.
        import model_gateway

        settings = Settings(
            config=SettingsConfig(url=None, key=None, ttl_seconds=60.0, timeout_seconds=1.0)
        )
        model_gateway.set_settings(settings)
        try:
            with mock.patch.dict(os.environ, BOTH_OFF):
                for entry in jobs.JOBS:
                    served = model_gateway.model_for(entry.job_id)
                    if entry.is_model_call:
                        self.assertTrue(served, entry.job_id)
                    else:
                        self.assertIsNone(served, entry.job_id)
        finally:
            model_gateway.set_settings(None)


if __name__ == "__main__":
    unittest.main()
