from app.features.editor_assist.listicle_writer import (
    ListicleWriterTarget,
    build_generation_prompt,
    build_retry_prompt,
    strip_generation_fence,
    validate_generated_text,
)


def _paragraph(word_count: int, token: str = "polished") -> str:
    return " ".join([token] * word_count)


def test_build_generation_prompt_for_dining_blurb_includes_custom_instruction():
    prompt = build_generation_prompt(
        article_title="Best Restaurants in Lima",
        article_type="single-type-listicle",
        article_location="Lima, Peru",
        article_context="### Intro\nDraft context",
        custom_instruction="Lead with the seafood angle.",
        target=ListicleWriterTarget(
            target_id="item-1_blurb",
            field_type="blurb",
            category="dining",
            display_name="La Mar",
            research_subject="La Mar",
            location_label="Miraflores, Lima",
            supporting_context="Ideal for: seafood lovers",
        ),
    )

    assert "Restaurant name:\nLa Mar" in prompt
    assert "Do not include a heading or subheading." in prompt
    assert "Make clear why it belongs in this specific list." in prompt
    assert "CUSTOM INSTRUCTION\nLead with the seafood angle." in prompt


def test_build_generation_prompt_for_itinerary_intro_uses_itinerary_guidance():
    prompt = build_generation_prompt(
        article_title="One Perfect Day in Lima",
        article_type="listicle-itinerary",
        article_location="Lima, Peru",
        article_context="### Stop 1\nBarranco",
        custom_instruction="",
        target=ListicleWriterTarget(
            target_id="draft-1_header_intro",
            field_type="intro",
            category=None,
            supporting_context="Day audience: weekend",
        ),
    )

    assert "You are writing the intro for a travel listicle" in prompt
    assert "Frame the piece like a polished itinerary opener" in prompt
    assert "One intro paragraph only." in prompt


def test_build_retry_prompt_includes_validation_feedback_and_current_draft():
    prompt = build_retry_prompt(
        article_title="Best Restaurants in Lima",
        article_type="single-type-listicle",
        article_location="Lima, Peru",
        article_context="",
        custom_instruction="",
        current_output="too short",
        validation_errors=["Blurb must be between 90 and 140 words."],
        target=ListicleWriterTarget(
            target_id="item-1_blurb",
            field_type="blurb",
            category="dining",
            display_name="La Mar",
        ),
    )

    assert "VALIDATION FAILURES" in prompt
    assert "CURRENT DRAFT\ntoo short" in prompt
    assert "Return only the corrected final paragraph." in prompt


def test_validate_generated_text_rejects_headings_process_disclosure_and_em_dash():
    errors = validate_generated_text(
        field_type="blurb",
        text="## La Mar\nreviews say this place is great — and it has five stars",
    )

    assert "Output must not include a heading or subheading." in errors
    assert "Output must not expose the research or review process." in errors
    assert "Output must not include em dashes." in errors
    assert "Output must not mention ratings, stars, or scores." in errors


def test_validate_generated_text_accepts_valid_paragraph_lengths():
    assert validate_generated_text(field_type="blurb", text=_paragraph(100)) == []
    assert validate_generated_text(field_type="intro", text=_paragraph(90)) == []


def test_strip_generation_fence_removes_common_wrappers():
    assert strip_generation_fence("```markdown\nhello world\n```") == "hello world"
    assert strip_generation_fence("Paragraph: hello world") == "hello world"
