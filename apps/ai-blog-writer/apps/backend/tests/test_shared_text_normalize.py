from app.shared.text import (
    build_anti_ai_repair_prompt,
    enforce_anti_ai_tells_markdown,
    normalize_dashes,
    normalize_dashes_markdown,
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
