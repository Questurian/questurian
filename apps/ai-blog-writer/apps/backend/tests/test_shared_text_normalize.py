from app.shared.text import (
    build_anti_ai_repair_prompt,
    enforce_anti_ai_tells_markdown,
    normalize_dashes,
    normalize_dashes_markdown,
    strip_prompt_delimiters,
    validate_anti_ai_tells_markdown,
)


def test_normalize_dashes_replaces_em_dash():
    assert normalize_dashes("warm — inviting") == "warm, inviting"


def test_normalize_dashes_preserves_numeric_range():
    assert normalize_dashes("open 5–10 pm") == "open 5–10 pm"


def test_markdown_prose_lines_are_normalized():
    text = "## Heading\n\nThe room is small — barely six tables."
    expected = "## Heading\n\nThe room is small, barely six tables."
    assert normalize_dashes_markdown(text) == expected


def test_markdown_horizontal_rule_is_preserved():
    text = "First paragraph.\n\n---\n\nSecond paragraph — with a dash."
    result = normalize_dashes_markdown(text)
    assert "\n---\n" in result
    assert "Second paragraph, with a dash." in result


def test_markdown_table_delimiter_row_is_preserved():
    text = "| City | Season |\n| --- | --- |\n| Lima — Peru | Summer |"
    result = normalize_dashes_markdown(text)
    assert "| --- | --- |" in result
    assert "| Lima, Peru | Summer |" in result


def test_markdown_fenced_code_is_preserved():
    text = "Before — dash.\n```\na -- b\nx — y\n```\nAfter — dash."
    result = normalize_dashes_markdown(text)
    assert "a -- b" in result
    assert "x — y" in result
    assert "Before, dash." in result
    assert "After, dash." in result


def test_anti_ai_validation_flags_em_dash_without_normalizing():
    text = "The room is small — barely six tables."
    result = validate_anti_ai_tells_markdown(text)
    assert not result.valid
    assert "em dash" in result.errors[0]
    assert "—" in text


def test_anti_ai_validation_preserves_numeric_en_dash_range():
    result = validate_anti_ai_tells_markdown("Open 5–10 pm most nights.")
    assert result.valid


def test_anti_ai_validation_ignores_markdown_structure():
    text = "Before clean.\n\n---\n\n| City | Season |\n| --- | --- |\n```\na -- b\nx — y\n```"
    result = validate_anti_ai_tells_markdown(text)
    assert result.valid


def test_anti_ai_validation_flags_comma_as_dash_aside():
    result = validate_anti_ai_tells_markdown(
        "The room is warm, and quietly so, throughout dinner."
    )
    assert not result.valid
    assert "comma-bracketed aside" in result.errors[0]


def test_build_anti_ai_repair_prompt_includes_errors_and_content():
    prompt = build_anti_ai_repair_prompt("A — B", ["Line 1: em dash is not allowed."])
    assert "Line 1: em dash is not allowed." in prompt
    assert "A — B" in prompt


def test_enforce_anti_ai_tells_retries_once_and_returns_clean_output():
    prompts: list[str] = []

    def repair(prompt: str) -> str:
        prompts.append(prompt)
        return "The room has six tables."

    result = enforce_anti_ai_tells_markdown(
        "The room is small — barely six tables.",
        repair=repair,
        context="test",
    )
    assert result == "The room has six tables."
    assert len(prompts) == 1
    assert "em dash" in prompts[0]


def test_enforce_anti_ai_tells_returns_dirty_retry_without_substitution():
    result = enforce_anti_ai_tells_markdown(
        "The room is small — barely six tables.",
        repair=lambda _prompt: "Still dirty — no comma rewrite.",
        context="test",
    )
    assert result == "Still dirty — no comma rewrite."


def test_a_spaced_hyphen_used_as_a_dash_is_rejected():
    """Banning the em dash without banning its replacements moves the tell
    rather than removing it. The comma-bracketed aside was the first
    substitution; a spaced hyphen is the next one."""
    result = validate_anti_ai_tells_markdown(
        "The room is warm - and quietly so - throughout."
    )

    assert result.valid is False
    assert any("spaced hyphen" in error for error in result.errors)


def test_hyphens_that_are_not_dashes_are_left_alone():
    for line in (
        "Open 9 - 5 on weekdays.",
        "The bus runs 9-5 daily.",
        "- Trains are frequent",
        "Rent runs US$800 - US$1,200 per month.",
        "| Route | Cost |\n| --- | --- |",
    ):
        assert validate_anti_ai_tells_markdown(line).valid is True, line


def test_hyphenated_compounds_are_rejected():
    """Each is correct English on its own, but a run of them through an
    article is one of the clearest signals the text was generated."""
    result = validate_anti_ai_tells_markdown(
        "Two-bedroom apartments suit a long-stay visa holder."
    )

    assert result.valid is False
    assert any("hyphenated compounds" in error for error in result.errors)
    assert "Two-bedroom" in result.errors[0]
    assert "long-stay" in result.errors[0]


def test_proper_names_keep_their_hyphens():
    """Rewriting a name corrupts a fact. A capitalised segment after the first
    hyphen is what separates a name from a compound modifier -- "Two-bedroom"
    at the start of a sentence has only its first letter capitalised."""
    for line in (
        "Aix-en-Provence is worth a detour.",
        "The Colombia-Peru border crossing takes a day.",
        "COVID-19 rules were lifted in 2023.",
    ):
        assert validate_anti_ai_tells_markdown(line).valid is True, line


def test_hyphens_that_are_syntax_are_not_compounds():
    """Link targets, inline code and editorial directives carry hyphens that
    no writer chose."""
    for line in (
        "See the guide at https://example.com/long-stay-visa for details.",
        "Set `max-width` on the container.",
        "> [!EDITORIAL-BOX|highlight_callout]",
        "| Route | Cost |",
    ):
        assert validate_anti_ai_tells_markdown(line).valid is True, line


def test_the_repair_prompt_says_how_to_fix_a_compound():
    # Deleting the hyphen in place would produce "Twobedroom".
    prompt = build_anti_ai_repair_prompt(
        "Two-bedroom apartments.",
        ["Line 1: hyphenated compounds are not allowed: Two-bedroom"],
    )

    assert "rephrasing the sentence" in prompt
    assert "never by deleting the hyphen" in prompt


class TestSourceAttributionIsNotProse:
    """Attribution lives in the evidence record; the article states the fact.

    Every sentence in `FLAGGED` is quoted from the Lima food article, which
    passed a clean anti-AI validation run with four publications named in it.
    Rhythm and diction were prompt-only requests the writer ignored; this is the
    first sourcing rule the validator can actually enforce.
    """

    FLAGGED = (
        "Travel sources report this event will drastically intensify demand.",
        "Outlets anticipate a severe demand spike overlapping the window.",
        "One outlet framed this revenue as a result of international interest.",
        "The publication noted that past host cities saw sustained increases.",
        "The report cited new concepts in the Barranco area as factors.",
        "According to travel writers, the city is busy in November.",
    )

    # A named actor is the story. Only the anonymous publication standing
    # between the writer and the claim is banned, so these must stay clean or
    # the rule costs a repair call on correct prose.
    ALLOWED = (
        "PromPeru acts as the local partner for the ceremony.",
        "PromPeru confirmed the ceremony date in March 2026.",
        "The mayor said the street would close for the weekend.",
        "Time Out named Lima the number one city for food worldwide.",
        "Central took the position in 2023 and Maido followed in 2025.",
        "The OSITRAN report lists no customs metric for either terminal.",
        "Lunch costs PEN 45 and dinner runs closer to PEN 120.",
        # A guide is a person or a guidebook far more often than a source.
        "See the guide at https://example.com/long-stay-visa for details.",
        "The study of the room takes ten minutes.",
    )

    @staticmethod
    def _attribution_errors(text: str) -> list[str]:
        return [
            error
            for error in validate_anti_ai_tells_markdown(text).errors
            if "attribution belongs" in error
        ]

    def test_sourcing_language_fails_validation(self):
        for sentence in self.FLAGGED:
            assert self._attribution_errors(sentence), sentence

    def test_a_named_actor_is_not_an_attribution(self):
        for sentence in self.ALLOWED:
            assert not self._attribution_errors(sentence), sentence

    def test_the_error_names_the_offending_phrase(self):
        errors = self._attribution_errors(self.FLAGGED[0])
        assert "Travel sources report" in errors[0]

    def test_a_link_target_is_not_prose(self):
        # Markdown link syntax carries source URLs by design; blanking the
        # non-prose spans first keeps the check on what the reader sees.
        clean = "Book at [Central](https://example.com/the-report-cited) early."
        assert not self._attribution_errors(clean)

    def test_the_repair_prompt_says_to_delete_not_reword(self):
        prompt = build_anti_ai_repair_prompt(
            self.FLAGGED[0],
            ["Line 1: attribution belongs in the evidence record"],
        )
        assert "deleting the publication" in prompt
        assert "another attribution verb" in prompt


class TestResearchMetaIsNotReaderFacing:
    """The reader came for the subject, not for a report on the research.

    Every FLAGGED sentence below is verbatim, or near verbatim, from the Lima
    restaurant run's shipped article. Seven of these reached the reader. The
    quality audit flagged one, vaguely, and the house rule forbidding them
    was already in the writer's prompt and had been ignored.
    """

    FLAGGED = (
        "Central does not publish its individual course names, so the specific "
        "dishes served on a given date are not public information.",
        "Maido does not publish which courses are currently being served.",
        "Merito's sampled booking flow uses a S/551 guarantee per person.",
        "The number is an estimate rather than a guaranteed bill.",
        "Kjolle has not disclosed the autumn menu.",
        "The tasting price is not publicly available.",
        "No official figures exist for the wait at either counter.",
        "There is no public data on the counter seats.",
        "The closing time could not be confirmed.",
        "At the time of writing the room seats forty.",
        "Two data points put the bill near S/500.",
    )

    # These must stay clean, or the rule costs a repair call on correct prose.
    ALLOWED = (
        "Central seats twenty eight and charges S/551 for the tasting menu.",
        # "sampled" is an ordinary verb in a food article. Only the research
        # noun phrase it forms in "sampled booking flow" is the tell.
        "We sampled the ceviche at three counters in Barranco.",
        "Maido publishes its menu on the day of service.",
        "The guarantee covers the tasting menu and the pairing.",
        "Book the 1pm seating; the room fills by Thursday.",
        "The kitchen opens at noon and stops seating at half past two.",
        # "release" means putting seats on sale, not publishing research.
        "The venue does not release tickets until 10am on the day.",
        "The museum will not release the autumn schedule until August.",
        # How a reader books is the article doing its job, not a research gap.
        "Reservations are not available online, so call the counter before noon.",
        "Rooms are not available online during Fiestas Patrias.",
        "Tables are not publicly listed; the concierge holds them.",
    )

    @staticmethod
    def _research_meta_errors(text: str) -> list[str]:
        return [
            error
            for error in validate_anti_ai_tells_markdown(text).errors
            if "write around what the research could not establish" in error
        ]

    def test_research_meta_sentences_fail_validation(self):
        for sentence in self.FLAGGED:
            assert self._research_meta_errors(sentence), sentence

    def test_ordinary_prose_about_the_subject_stays_clean(self):
        for sentence in self.ALLOWED:
            assert not self._research_meta_errors(sentence), sentence

    def test_the_error_names_the_offending_phrase(self):
        errors = self._research_meta_errors(self.FLAGGED[0])
        assert "does not publish" in errors[0]
        assert "not public information" in errors[0]

    def test_a_link_target_is_not_prose(self):
        clean = "Book at [Central](https://example.com/no-public-data) early."
        assert not self._research_meta_errors(clean)

    def test_the_repair_prompt_says_to_delete_not_soften(self):
        # Softening is how this rule gets defeated: "course names vary" is the
        # same absence, told at one remove.
        prompt = build_anti_ai_repair_prompt(
            self.FLAGGED[0],
            ["Line 1: write around what the research could not establish"],
        )
        assert "reports on the research by deleting it" in prompt
        assert "Never soften it" in prompt


# --- prompt delimiters that came back with the article ---------------------
#
# Run 849ae5aa shipped a `ready_for_staging` article whose body was wrapped in
# the literal `<<<CONTENT>>>` and `<<<END_CONTENT>>>` lines the repair prompt
# had shown it. Nothing stripped them and nothing looked for them.


WRAPPED = "<<<CONTENT>>>\nThe room has six tables.\n<<<END_CONTENT>>>"


def test_a_prompt_delimiter_in_the_output_fails_validation():
    result = validate_anti_ai_tells_markdown(WRAPPED)

    assert not result.valid
    assert any("prompt delimiter left in the output" in error for error in result.errors)
    assert any("<<<CONTENT>>>" in error for error in result.errors)


def test_stripping_returns_what_it_removed():
    cleaned, found = strip_prompt_delimiters(WRAPPED)

    assert cleaned == "The room has six tables."
    assert found == ["<<<CONTENT>>>", "<<<END_CONTENT>>>"]


def test_stripping_leaves_ordinary_prose_alone():
    text = "The room has six tables.\n\nBook before noon."

    assert strip_prompt_delimiters(text) == (text, [])


def test_an_angle_bracketed_phrase_inside_a_sentence_is_not_a_delimiter():
    # The rule is a whole line that is only a marker. A sentence that happens
    # to contain one is prose with a typo in it, not a wrapper.
    text = "The sign reads <<<CONTENT>>> and nobody knows why."

    assert strip_prompt_delimiters(text) == (text, [])


def test_a_repair_that_echoes_the_wrapper_never_ships_it():
    result = enforce_anti_ai_tells_markdown(
        "The room is small — barely six tables.",
        repair=lambda _prompt: WRAPPED,
        context="test",
    )

    assert result == "The room has six tables."


def test_a_repair_that_echoes_the_wrapper_and_stays_dirty_is_discarded():
    # Stripping alone would hand back a repair that ignored its instructions
    # and call it a success. The original is at least uncorrupted.
    original = "The room is small — barely six tables."

    result = enforce_anti_ai_tells_markdown(
        original,
        repair=lambda _prompt: "<<<CONTENT>>>\nStill dirty — no rewrite.\n<<<END_CONTENT>>>",
        context="test",
    )

    assert result == original


def test_the_echoed_wrapper_is_logged_even_when_the_repair_is_kept(caplog):
    import logging

    with caplog.at_level(logging.WARNING):
        enforce_anti_ai_tells_markdown(
            "The room is small — barely six tables.",
            repair=lambda _prompt: WRAPPED,
            context="test",
        )

    assert "echoed its prompt wrapper" in caplog.text
