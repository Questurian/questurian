"""Measuring how varied the sentences are, and never gating on it.

The first article the v4 pipeline wrote (run 90b3f9bc, 2026-08-31) averaged
11.3 words across seventy five sentences, with 57% of them inside a five word
band and exactly one past 25. It read as accurate and mechanical. Nothing in
the run said so, because nothing was counting.
"""

from __future__ import annotations

from app.features.prompt2blog.quality import (
    CONSTRAINT_MEASUREMENT_KEYS,
    measure_sentence_spread,
)

# The opening of the real article, unchanged.
METERED = (
    "## The Elevation Contrast\n"
    "Cusco sits at an average elevation of 3,399 meters. Lima averages 101 to "
    "161 meters. Tourists who fly directly to the Andes often experience a "
    "pounding headache. Nausea, dizziness and fatigue follow. These symptoms "
    "typically appear within 6 to 24 hours of arrival. They take up to 48 "
    "hours of rest and hydration to subside. You lose the start of your trip "
    "to your hotel bed. The ruins at Machu Picchu sit lower at 2,430 meters. "
    "Visitors often feel better once they reach them."
)

# The same facts, joined. No em dashes, no hyphenated compounds.
VARIED = (
    "## The Elevation Contrast\n"
    "Cusco sits at 3,399 meters. Lima averages between 101 and 161, which is "
    "the difference between arriving and arriving able to do anything, because "
    "tourists who fly straight to the Andes often meet a pounding headache "
    "within 6 to 24 hours, followed by nausea, dizziness and fatigue that take "
    "up to two days of rest and water to clear. You lose the start of your "
    "trip to a hotel bed."
)


def test_metered_prose_is_measured_as_metered():
    spread = measure_sentence_spread(METERED)

    assert spread["sentence_count"] == 9
    assert spread["sentences_over_25_words"] == 0
    assert spread["sentence_widest_band_share"] > 0.6
    assert spread["sentence_stdev_words"] < 4


def test_varied_prose_measures_as_varied():
    spread = measure_sentence_spread(VARIED)

    assert spread["sentences_over_25_words"] >= 1
    assert spread["sentence_stdev_words"] > spread["sentence_count"]


def test_the_note_says_what_to_do_and_that_nothing_blocks():
    note = measure_sentence_spread(METERED)["sentence_variety_note"]

    assert "read as metered" in note
    assert "nothing here blocks" in note


def test_varied_prose_gets_no_note():
    assert measure_sentence_spread(VARIED)["sentence_variety_note"] == ""


def test_headings_are_not_counted_as_sentences():
    with_headings = "## A heading here\n\nOne sentence of prose sits below it."

    assert measure_sentence_spread(with_headings)["sentence_count"] == 1


def test_an_empty_article_measures_zero_rather_than_dividing_by_it():
    assert measure_sentence_spread("")["sentence_count"] == 0


def test_every_spread_key_is_declared_a_measurement():
    """A count landing among booleans reads as a check that failed, and this
    measurement never gates: once prose exists nothing blocks (ADR 0030)."""
    keys = set(measure_sentence_spread(METERED))

    assert keys <= CONSTRAINT_MEASUREMENT_KEYS
    assert not any(
        isinstance(value, bool) for value in measure_sentence_spread(METERED).values()
    )
