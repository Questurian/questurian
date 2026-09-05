"""The registry and the rate table: what they promise the rest of the repo."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

from model_gateway import jobs, rates
from model_gateway.settings import load_defaults

REPO_ROOT = Path(__file__).resolve().parents[3]


class JobRegistry(unittest.TestCase):
    def test_every_job_id_is_namespaced_by_its_area(self):
        for entry in jobs.JOBS:
            self.assertRegex(
                entry.job_id,
                r"^[a-z0-9]+\.[a-z0-9_]+$",
                f"{entry.job_id} is not `area.job`",
            )

    def test_job_ids_are_unique(self):
        ids = [entry.job_id for entry in jobs.JOBS]
        self.assertEqual(len(ids), len(set(ids)))

    def test_every_job_belongs_to_a_known_app_and_call_kind(self):
        for entry in jobs.JOBS:
            self.assertIn(entry.app, {jobs.APP_ABW, jobs.APP_LM}, entry.job_id)
            self.assertIn(entry.call, jobs.CALL_KINDS, entry.job_id)

    def test_both_apps_are_represented(self):
        # A registry that quietly covered only one app would pass every other
        # test here while leaving the app this work exists for untouched.
        self.assertTrue(jobs.jobs_for_app(jobs.APP_ABW))
        self.assertTrue(jobs.jobs_for_app(jobs.APP_LM))

    def test_location_manager_owns_the_four_jobs_its_service_makes(self):
        self.assertEqual(
            sorted(entry.job_id for entry in jobs.jobs_for_app(jobs.APP_LM)),
            [
                "lm.accommodations_field_suggestion",
                "lm.alt_text",
                "lm.dining_field_suggestion",
                "lm.neighborhood_description",
            ],
        )

    def test_an_unknown_job_raises_and_says_what_is_nearby(self):
        # Falling back to a default model on a typo would be exactly the class
        # of silent wrong-model bug this package exists to remove.
        with self.assertRaises(jobs.UnknownJob) as caught:
            jobs.job("lm.alt_txt")
        self.assertIn("lm.alt_text", str(caught.exception))

    def test_places_jobs_are_marked_as_having_no_model(self):
        self.assertFalse(jobs.job("listicle.identity").is_model_call)
        self.assertFalse(jobs.job("listicle.place_details").is_model_call)
        self.assertTrue(jobs.job("lm.alt_text").is_model_call)


class CheckedInDefaults(unittest.TestCase):
    def test_defaults_name_every_job_and_nothing_else(self):
        table = load_defaults()
        self.assertEqual(set(table.models), set(jobs.JOBS_BY_ID))

    def test_every_model_named_by_the_defaults_has_a_rate_or_is_substituted(self):
        # A default naming a model nothing can price would reach the dashboard
        # as an unexplained hole in the cost chart.
        from model_gateway.substitution import effective_model

        for job_id, model in load_defaults().models.items():
            if model is None:
                self.assertFalse(jobs.job(job_id).is_model_call, job_id)
                continue
            served = effective_model(model)
            self.assertIn(served, rates.MODEL_RATES, f"{job_id} runs unpriced on {served}")

    def test_the_alt_text_job_is_still_on_pro(self):
        # The acceptance test for this whole piece of work is moving this one
        # job off Pro from the dashboard. It has to start on Pro for that to
        # mean anything, so this fails if a refactor "helpfully" fixes it.
        self.assertEqual(load_defaults().get("lm.alt_text"), "gemini-2.5-pro")


class RateTable(unittest.TestCase):
    def test_every_rate_carries_the_evidence_for_it(self):
        for rate in rates.MODEL_RATES.values():
            self.assertRegex(rate.verified_on, r"^\d{4}-\d{2}-\d{2}$", rate.model)
            self.assertTrue(rate.source.startswith("https://"), rate.model)

    def test_cost_is_none_for_a_model_the_table_has_never_heard_of(self):
        # None, not zero. A zero claims the call was free; None says nobody
        # knows, and those must not look the same on a cost chart.
        self.assertIsNone(
            rates.estimated_cost(
                model_name="gemini-9.9-imaginary",
                input_tokens=1000,
                output_tokens=1000,
                cached_input_tokens=0,
            )
        )

    def test_a_short_call_is_priced_at_the_standard_rate(self):
        # 1M in, 1M out on Flash: 0.30 + 2.50.
        self.assertAlmostEqual(
            rates.estimated_cost(
                model_name="gemini-2.5-flash",
                input_tokens=1_000_000,
                output_tokens=1_000_000,
                cached_input_tokens=0,
            ),
            2.80,
        )

    def test_cached_input_is_billed_at_the_cached_rate(self):
        # Half the input cached on Flash: 0.15 + 0.015, no output.
        self.assertAlmostEqual(
            rates.estimated_cost(
                model_name="gemini-2.5-flash",
                input_tokens=1_000_000,
                output_tokens=0,
                cached_input_tokens=500_000,
            ),
            0.165,
        )

    def test_a_long_call_crosses_into_the_large_context_rate(self):
        rate = rates.MODEL_RATES["gemini-2.5-pro"]
        assert rate.large_context_threshold is not None
        over = rate.large_context_threshold + 1
        priced = rates.estimated_cost(
            model_name="gemini-2.5-pro",
            input_tokens=over,
            output_tokens=0,
            cached_input_tokens=0,
        )
        self.assertAlmostEqual(priced, over * rate.large_input_per_million / 1_000_000)

    def test_a_model_without_tiering_never_switches_rate(self):
        # Flash has no large-context rates. A huge call must still price at
        # the standard rate rather than fall through to None or a stale tier.
        priced = rates.estimated_cost(
            model_name="gemini-2.5-flash",
            input_tokens=10_000_000,
            output_tokens=0,
            cached_input_tokens=0,
        )
        self.assertAlmostEqual(priced, 10_000_000 * 0.3 / 1_000_000)


class RateTableAgreesWithTheCodeItReplaces(unittest.TestCase):
    """Temporary bridge, and deliberately so.

    ``token_usage.py`` in ai-blog-writer still holds its own copy of these
    numbers and still prices every call that has not moved to the gateway yet.
    Two tables of the same numbers drift, and the drift is invisible -- costs
    stay plausible while being wrong in one consistent direction. This fails
    the moment they part company.

    It goes away when that module becomes a re-export of this one, which is
    the step that also repoints the dashboard's own drift test.
    """

    TOKEN_USAGE_PY = (
        REPO_ROOT
        / "apps/ai-blog-writer/apps/backend/app/shared/token_usage.py"
    )

    def _rates_in_the_old_table(self) -> dict[str, list[float]]:
        source = self.TOKEN_USAGE_PY.read_text(encoding="utf-8")
        table = source[source.index("VERTEX_TOKEN_RATES = {"):]
        found: dict[str, list[float]] = {}
        for name, args in re.findall(
            r'"([a-z0-9.\-]+)":\s*VertexTokenRate\(([^)]*)\)', table
        ):
            found[name] = [float(part) for part in args.split(",") if part.strip()]
        return found

    def test_the_parse_found_something_to_compare(self):
        # A regex that silently matched nothing would make the comparison
        # below pass without comparing anything.
        self.assertGreater(len(self._rates_in_the_old_table()), 3)

    def test_the_two_tables_name_the_same_models(self):
        self.assertEqual(
            sorted(self._rates_in_the_old_table()),
            sorted(rates.MODEL_RATES),
        )

    def test_the_two_tables_agree_on_every_number(self):
        for model, numbers in self._rates_in_the_old_table().items():
            rate = rates.MODEL_RATES[model]
            expected = [
                rate.input_per_million,
                rate.output_per_million,
                rate.cached_input_per_million,
                rate.large_input_per_million,
                rate.large_output_per_million,
                rate.large_cached_input_per_million,
            ]
            self.assertEqual(
                numbers,
                [value for value in expected if value is not None],
                f"{model} disagrees with token_usage.py",
            )


if __name__ == "__main__":
    unittest.main()
