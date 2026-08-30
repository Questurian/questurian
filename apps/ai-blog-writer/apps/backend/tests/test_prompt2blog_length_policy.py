"""Length stops gating, and stops being counted twice.

On the Lima run one four-word overage capped the score below threshold *and*
raised a separate constraint failure, and that bought a full regeneration of
1,041 words to trim forty -- 11,119 output tokens at 47 cents, nearly half the
run. The keep-best net that caught the worse result afterwards is not the bug;
needing one was.
"""

from __future__ import annotations

from app.features.prompt2blog.quality import (
    HARD_CONSTRAINT_CHECK_KEYS,
    _build_constraint_checks,
    looks_truncated,
    word_count_revision_instruction,
)


def _brief(target: int = 900) -> dict:
    return {
        "formatting": {"target_word_count": target, "paragraph_length": "Medium"},
        "call_to_action": "",
        "seo": {"primary_keyword": "", "secondary_keywords": []},
        "must_include": [],
    }


def _content(words: int) -> str:
    return " ".join(["word"] * words) + "."


def test_length_is_no_longer_a_hard_constraint():
    # A 4% overage is not a failure any editor would recognise.
    assert "target_word_count_met" not in HARD_CONSTRAINT_CHECK_KEYS


def test_the_length_is_still_measured_exactly():
    # Code measures; the model judges. The audit used to estimate a count the
    # code already had, and they disagreed 1,004 against 1,041.
    checks = _build_constraint_checks("Title", _content(1_041), _brief())

    assert checks["word_count_estimate"] == 1_041


def test_a_four_word_overage_buys_nothing():
    """The exact Lima case.

    900 target, 100 tolerance, so 1,004 words is four over the ceiling.
    """
    checks = _build_constraint_checks("Title", _content(1_004), _brief())

    assert checks["target_word_count_met"] is False
    assert checks["word_count_severity"] == "slight"
    assert word_count_revision_instruction(checks) is None


def test_a_large_miss_still_asks_for_a_revision():
    # A third of the article missing is a symptom, not an edit.
    checks = _build_constraint_checks("Title", _content(500), _brief(1_400))

    assert checks["word_count_severity"] == "large"
    instruction = word_count_revision_instruction(checks)
    assert instruction is not None
    assert "Expand" in instruction or "words" in instruction


def test_a_draft_inside_its_band_says_nothing_about_length():
    checks = _build_constraint_checks("Title", _content(900), _brief())

    assert checks["target_word_count_met"] is True
    assert checks["word_count_severity"] == "within"
    assert word_count_revision_instruction(checks) is None


def test_severity_is_derived_where_it_is_used():
    """A caller that assembles checks by hand cannot lose the threshold.

    The two sites that need this judgement -- the builder and the revision
    instruction -- share one helper, so they cannot come to different answers
    about the same draft.
    """
    hand_built = {
        "target_word_count_met": False,
        "word_count_direction": "over",
        "word_count_delta": 4,
        "word_count_estimate": 1_004,
        "word_count_target_min": 800,
        "word_count_target_max": 1_000,
    }

    assert word_count_revision_instruction(hand_built) is None


def test_a_response_that_hit_the_output_cap_is_a_transport_failure():
    """Not a writing failure, and not repair's problem.

    The fix for a cap is a higher cap or a shorter plan, and repair can do
    neither -- so asking it to is asking the wrong model to fix the wrong
    thing.
    """
    capped = "word " * 5_700  # ~28,500 characters against a 6,144-token cap

    assert looks_truncated(capped, max_output_tokens=6_144) is True


def test_a_short_article_that_finished_properly_is_not_truncation():
    assert looks_truncated("A short but complete piece.", max_output_tokens=6_144) is False


def test_a_long_article_that_ends_cleanly_is_not_truncation():
    # Near the cap but finished. Both signals are needed, because either alone
    # is noisy.
    finished = "word " * 5_700 + "."

    assert looks_truncated(finished, max_output_tokens=6_144) is False
