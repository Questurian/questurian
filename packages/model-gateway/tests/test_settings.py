"""How the table is read, and what happens when the dashboard is not there."""

from __future__ import annotations

import os
import unittest
from unittest import mock

from model_gateway import jobs
from model_gateway.settings import (
    SOURCE_DASHBOARD,
    SOURCE_DEFAULTS,
    Settings,
    SettingsConfig,
    env_override_name,
    load_defaults,
)


def dashboard_payload(**models: object) -> dict:
    return {"version": 1, "jobs": {job_id: {"model": model} for job_id, model in models.items()}}


def connected(payload, ttl: float = 60.0, clock=None) -> Settings:
    """A client wired to a dashboard that answers with `payload`."""
    return Settings(
        config=SettingsConfig(url="http://dashboard.test", key=None, ttl_seconds=ttl, timeout_seconds=1.0),
        fetcher=payload if callable(payload) else (lambda: payload),
        clock=clock or (lambda: 0.0),
    )


class WithNoDashboard(unittest.TestCase):
    def test_every_job_resolves_from_the_checked_in_defaults(self):
        settings = Settings(
            config=SettingsConfig(url=None, key=None, ttl_seconds=60.0, timeout_seconds=1.0)
        )
        self.assertEqual(settings.table().source, SOURCE_DEFAULTS)
        self.assertEqual(settings.model_for("lm.alt_text"), "gemini-2.5-pro")

    def test_no_request_is_ever_made(self):
        # The apps must run with no dashboard configured at all, which is the
        # normal state on a machine that only wants the pipelines.
        settings = Settings(
            config=SettingsConfig(url=None, key=None, ttl_seconds=60.0, timeout_seconds=1.0)
        )
        with mock.patch("urllib.request.urlopen", side_effect=AssertionError("no request expected")):
            settings.table()
            settings.refresh()


class WithADashboard(unittest.TestCase):
    def test_the_dashboard_table_wins_over_the_defaults(self):
        settings = connected(dashboard_payload(**{"lm.alt_text": "gemini-2.5-flash"}))
        self.assertEqual(settings.model_for("lm.alt_text"), "gemini-2.5-flash")
        self.assertEqual(settings.table().source, SOURCE_DASHBOARD)

    def test_a_job_the_dashboard_has_not_heard_of_falls_back(self):
        # The dashboard is allowed to be older than the code. A job added this
        # morning must not break because the table has not caught up.
        #
        # The expected value is read from the registry rather than written out,
        # because what is under test is "the fallback is the checked-in
        # default" and not "the default is any particular model". Spelling the
        # model out here made this test fail the day compose moved to Opus,
        # which is a change of policy and not a regression.
        settings = connected(dashboard_payload(**{"lm.alt_text": "gemini-2.5-flash"}))
        self.assertEqual(
            settings.model_for("p2b.compose"),
            jobs.job("p2b.compose").default_model,
        )

    def test_a_job_the_code_has_not_heard_of_is_ignored(self):
        payload = {"version": 1, "jobs": {"lm.invented": {"model": "gemini-2.5-pro"}}}
        settings = connected(payload)
        self.assertNotIn("lm.invented", settings.table().models)

    def test_a_non_string_model_is_ignored_rather_than_served(self):
        payload = {"version": 1, "jobs": {"lm.alt_text": {"model": 7}}}
        settings = connected(payload)
        self.assertEqual(settings.model_for("lm.alt_text"), "gemini-2.5-pro")

    def test_a_model_with_no_rate_is_still_served(self):
        # Refusing to call a model because we cannot price it would be the
        # telemetry tail wagging the dog. It runs, and reports unpriced.
        settings = connected(dashboard_payload(**{"lm.alt_text": "gemini-4.0-unreleased"}))
        self.assertEqual(settings.model_for("lm.alt_text"), "gemini-4.0-unreleased")


class WhenTheDashboardIsDown(unittest.TestCase):
    def test_a_first_fetch_that_fails_leaves_the_defaults_in_place(self):
        def explode():
            raise OSError("connection refused")

        settings = connected(explode)
        self.assertEqual(settings.model_for("lm.alt_text"), "gemini-2.5-pro")
        self.assertEqual(settings.table().source, SOURCE_DEFAULTS)

    def test_a_later_failure_keeps_the_last_good_table(self):
        # Dashboard down means "keep running on what we last read", never
        # "stop", and never "silently revert to the checked-in defaults".
        now = {"t": 0.0}
        answers = [dashboard_payload(**{"lm.alt_text": "gemini-2.5-flash"})]

        def fetch():
            if answers:
                return answers.pop()
            raise OSError("connection refused")

        settings = connected(fetch, ttl=10.0, clock=lambda: now["t"])
        self.assertEqual(settings.model_for("lm.alt_text"), "gemini-2.5-flash")

        now["t"] = 100.0
        self.assertEqual(settings.model_for("lm.alt_text"), "gemini-2.5-flash")
        self.assertEqual(settings.table().source, SOURCE_DASHBOARD)
        self.assertGreater(settings.failed_fetches, 0)

    def test_malformed_json_is_survived_like_any_other_failure(self):
        settings = connected(lambda: {"nothing": "useful"})
        self.assertEqual(settings.model_for("lm.alt_text"), "gemini-2.5-pro")


class Freshness(unittest.TestCase):
    def test_a_change_is_picked_up_once_the_cache_ages_out(self):
        # This is the acceptance test in miniature: an operator changes a
        # model and the running service follows, with no restart.
        now = {"t": 0.0}
        model = {"value": "gemini-2.5-pro"}
        settings = connected(
            lambda: dashboard_payload(**{"lm.alt_text": model["value"]}),
            ttl=60.0,
            clock=lambda: now["t"],
        )
        self.assertEqual(settings.model_for("lm.alt_text"), "gemini-2.5-pro")

        model["value"] = "gemini-2.5-flash"
        self.assertEqual(settings.model_for("lm.alt_text"), "gemini-2.5-pro", "still cached")

        now["t"] = 61.0
        self.assertEqual(settings.model_for("lm.alt_text"), "gemini-2.5-flash")

    def test_the_table_is_not_refetched_on_every_read(self):
        now = {"t": 0.0}
        calls = {"n": 0}

        def fetch():
            calls["n"] += 1
            return dashboard_payload(**{"lm.alt_text": "gemini-2.5-flash"})

        settings = connected(fetch, ttl=60.0, clock=lambda: now["t"])
        for _ in range(5):
            settings.model_for("lm.alt_text")
        self.assertEqual(calls["n"], 1)


class Overrides(unittest.TestCase):
    def test_an_operators_own_choice_beats_the_table(self):
        settings = connected(dashboard_payload(**{"p2b.compose": "gemini-2.5-flash"}))
        self.assertEqual(
            settings.model_for("p2b.compose", override="gemini-2.5-pro"),
            "gemini-2.5-pro",
        )

    def test_an_environment_variable_pins_a_job_above_the_dashboard(self):
        settings = connected(dashboard_payload(**{"lm.alt_text": "gemini-2.5-flash"}))
        with mock.patch.dict(os.environ, {env_override_name("lm.alt_text"): "gemini-2.5-pro"}):
            self.assertEqual(settings.model_for("lm.alt_text"), "gemini-2.5-pro")

    def test_the_names_location_manager_already_used_still_work(self):
        # Installing the gateway must not change what a machine with one of
        # these already exported actually calls.
        settings = connected(dashboard_payload(**{"lm.alt_text": "gemini-2.5-flash"}))
        with mock.patch.dict(os.environ, {"ALT_TEXT_MODEL": "gemini-2.5-flash-lite"}):
            self.assertEqual(settings.model_for("lm.alt_text"), "gemini-2.5-flash-lite")

    def test_pinned_jobs_reports_what_the_environment_is_holding(self):
        settings = connected(dashboard_payload())
        with mock.patch.dict(os.environ, {"NEIGHBORHOOD_DESCRIPTION_MODEL": "gemini-2.5-pro"}):
            self.assertEqual(
                settings.pinned_jobs(),
                {"lm.neighborhood_description": "gemini-2.5-pro"},
            )

    def test_an_unknown_job_raises_rather_than_resolving(self):
        settings = connected(dashboard_payload())
        with self.assertRaises(jobs.UnknownJob):
            settings.model_for("p2b.invented")


class Defaults(unittest.TestCase):
    def test_the_defaults_file_refuses_to_load_if_it_drifts_from_the_registry(self):
        # Strict on the way in: the fallback is what runs when everything else
        # is unavailable, so it is the last place a silent gap should exist.
        table = load_defaults()
        self.assertEqual(set(table.models), set(jobs.JOBS_BY_ID))


if __name__ == "__main__":
    unittest.main()
