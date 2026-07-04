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
