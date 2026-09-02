"""The same sentence twice, in an article nothing measured for it.

Run 849ae5aa put the 600-collectors fact in its opening paragraph and again
two paragraphs later under its own heading, near word for word, in an 845 word
piece. The run was stamped ready_for_staging with no blockers. The post-hoc
punch list called it "an almost word-for-word duplicate", which is the right
verdict arriving after the article is finished.
"""

from __future__ import annotations

from app.features.prompt2blog.quality import (
    CONSTRAINT_MEASUREMENT_KEYS,
    REPEATED_SENTENCE_OVERLAP,
    measure_repetition,
)


OPENING = (
    "While over 600 collectors were built historically in the district of "
    "Villa María del Triunfo, currently, hundreds of these nets are actively "
    "maintained and functioning across Lima as a whole."
)
LATER = (
    "While over 600 collectors were historically built in Villa María del "
    "Triunfo by Movimiento Peruano Sin Agua, hundreds of actively maintained "
    "fog nets now operate across all of Lima."
)


def _article(*sections: str) -> str:
    return "\n\n".join(
        f"## Section {index}\n\n{body}" for index, body in enumerate(sections, start=1)
    )


# --- the run that produced this -------------------------------------------


def test_the_repeated_sentence_is_measured():
    result = measure_repetition(_article(OPENING, LATER))

    assert result["repeated_sentence_pairs"] == 1
    assert result["repeated_sentence_overlap"] >= REPEATED_SENTENCE_OVERLAP


def test_the_note_quotes_both_sentences_and_says_it_does_not_block():
    note = measure_repetition(_article(OPENING, LATER))["repeated_sentence_note"]

    assert "600 collectors" in note
    assert "does not block" in note


def test_a_clean_article_says_nothing():
    result = measure_repetition(
        _article(
            "The nets stand on the ridge above the district and fill drums "
            "through the winter months.",
            "Water arrives by tanker for most households, at a price several "
            "times what the piped network charges.",
        )
    )

    assert result["repeated_sentence_pairs"] == 0
    assert result["repeated_sentence_note"] == ""


# --- what it must not fire on ---------------------------------------------


def test_a_shared_proper_noun_is_not_a_duplicate():
    """"Villa María del Triunfo" in six sentences is an article staying on
    its subject."""
    result = measure_repetition(
        _article(
            "Villa María del Triunfo sits on the southern edge of the city, "
            "climbing sand hills that were settled in the 1950s.",
            "Villa María del Triunfo now runs one of the largest collector "
            "arrays anywhere on the Peruvian coast.",
        )
    )

    assert result["repeated_sentence_pairs"] == 0


def test_two_sentences_in_the_same_section_are_not_compared():
    """A paragraph that repeats itself is a writing problem this check is not
    trying to have an opinion about; the comparison is across sections."""
    result = measure_repetition(f"## One\n\n{OPENING} {LATER}")

    assert result["repeated_sentence_pairs"] == 0


def test_takeaway_bullets_are_allowed_to_restate_the_body():
    """Bullets, blockquotes and FAQ answers compress the body on purpose.
    Reading those as duplicates would fire on every article with a takeaways
    block, which is the wrong refusal this cannot afford."""
    result = measure_repetition(_article(OPENING, f"- {LATER}"))

    assert result["repeated_sentence_pairs"] == 0


def test_short_sentences_have_too_little_of_their_own_to_compare():
    result = measure_repetition(
        _article("The nets are maintained.", "The nets are maintained.")
    )

    assert result["repeated_sentence_pairs"] == 0


# --- advisory, not a gate --------------------------------------------------


def test_the_measurements_are_measurements_and_never_checks():
    """A count landing among booleans reads as a check that failed, and the
    same mistake has been made once per new measurement."""
    for key in measure_repetition(_article(OPENING, LATER)):
        assert key in CONSTRAINT_MEASUREMENT_KEYS


def test_the_measurement_reaches_the_constraint_checks():
    from app.features.prompt2blog.quality import _build_constraint_checks

    checks = _build_constraint_checks("T", _article(OPENING, LATER), {})

    assert checks["repeated_sentence_pairs"] == 1
