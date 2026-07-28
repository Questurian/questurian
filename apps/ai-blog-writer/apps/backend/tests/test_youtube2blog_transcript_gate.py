"""Stage 1 transcript retention gate."""

from app.features.youtube2blog.content.script import (
    is_non_latin_script,
    non_latin_script_ratio,
)
from app.features.youtube2blog.quality.policies import (
    evaluate_transcript_gate,
    transcript_retention_policy,
)


def test_latin_source_keeps_the_standard_retention_band():
    profile, minimum, maximum = transcript_retention_policy(5_000)

    assert profile == "standard"
    assert maximum < 1.5


def test_translated_source_gets_its_own_retention_band():
    profile, minimum, maximum = transcript_retention_policy(
        5_000,
        translated_source=True,
    )

    assert profile == "translated"
    assert minimum < 0.2
    assert maximum > 2.0


def test_translated_transcript_that_grew_still_passes():
    """Japanese to English roughly triples the character count for identical
    content. Under the Latin band that trips `maximum_retention_ratio`, burns
    both repair attempts and then kills the run."""
    decision, gate_data = evaluate_transcript_gate(
        cleaned_chars=15_000,
        original_chars=5_000,
        retry_count=0,
        translated_source=True,
    )

    assert decision == "pass"
    assert gate_data["checks"]["maximum_retention_ratio"] is True
    assert gate_data["metrics"]["transcript_length_profile"] == "translated"
    assert gate_data["metrics"]["translated_source"] is True


def test_same_growth_from_a_latin_source_is_still_rejected():
    """A Latin-script transcript that tripled in size really did gain text."""
    decision, gate_data = evaluate_transcript_gate(
        cleaned_chars=15_000,
        original_chars=5_000,
        retry_count=0,
    )

    assert decision == "retry"
    assert gate_data["checks"]["maximum_retention_ratio"] is False


def test_translated_band_still_rejects_a_collapsed_transcript():
    """The wider band must not turn the gate off; over-compression still fails."""
    decision, gate_data = evaluate_transcript_gate(
        cleaned_chars=200,
        original_chars=40_000,
        retry_count=0,
        translated_source=True,
    )

    assert decision == "retry"
    assert gate_data["checks"]["minimum_cleaned_chars"] is False


def test_script_detection_separates_translated_sources_from_loanwords():
    assert is_non_latin_script("日本語の書き起こしです。" * 10)
    assert is_non_latin_script("Транскрипт видео на русском языке." * 10)
    assert not is_non_latin_script("A normal English transcript about travel.")
    assert not is_non_latin_script(
        "The restaurant is called 東京 and serves a tasting menu. " * 20
    )
    assert non_latin_script_ratio("") == 0.0
