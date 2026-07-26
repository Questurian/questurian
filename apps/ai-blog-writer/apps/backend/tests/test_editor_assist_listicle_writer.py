from app.features.editor_assist.listicle_writer import (
    ListicleWriterTarget,
    _voice_rules_block,
    build_generation_prompt,
    build_identity_only_writer_prompt,
    build_retry_prompt,
    build_writer_prompt,
    strip_generation_fence,
    validate_generated_text,
)


def test_compatibility_facade_reexports_canonical_implementations():
    from app.features.editor_assist import (
        blurb_composition_retry,
        listicle_prompt_builders,
        listicle_prompt_policy,
        listicle_writer,
        listicle_writer_validation,
    )

    assert (
        listicle_writer.build_generation_prompt
        is listicle_prompt_builders.build_generation_prompt
    )
    assert (
        listicle_writer.build_writer_prompt
        is listicle_prompt_builders.build_writer_prompt
    )
    assert (
        listicle_writer.build_retry_prompt is blurb_composition_retry.build_retry_prompt
    )
    assert (
        listicle_writer.validate_generated_text
        is listicle_writer_validation.validate_generated_text
    )
    assert (
        listicle_writer._voice_rules_block is listicle_prompt_policy.voice_rules_block
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


def test_build_writer_prompt_for_blurb_omits_article_context():
    prompt = build_writer_prompt(
        article_title="Best Bars in Lima",
        article_type="single-type-listicle",
        article_location="Lima, Peru",
        article_context="### Item 2\nSelected source snapshot with address fields",
        custom_instruction="",
        target=ListicleWriterTarget(
            target_id="item-1_blurb",
            field_type="blurb",
            category="nightlife",
            display_name="Ayahuasca",
            research_subject="Ayahuasca",
            location_label="Barranco, Lima",
            supporting_context="Ideal for: late-night cocktails",
        ),
    )

    assert "BUILDER CONTEXT\nIdeal for: late-night cocktails" in prompt
    assert "ARTICLE CONTEXT" not in prompt
    assert "Selected source snapshot" not in prompt


def test_identity_only_writer_prompt_forbids_inferred_claims():
    """When Research Profile has no usable evidence, writer takes the
    identity-only path. The prompt must explicitly forbid
    invented vibe, signature anything, superlatives, and people/dates."""
    prompt = build_identity_only_writer_prompt(
        article_title="Best Bars in Lima",
        article_type="single-type-listicle",
        article_location="Lima, Peru",
        article_context="",
        custom_instruction="",
        target=ListicleWriterTarget(
            target_id="item-1_blurb",
            field_type="blurb",
            category="nightlife",
            display_name="Brand New Bar",
            location_label="Barranco, Lima",
        ),
    )

    assert "EVIDENCE STATUS" in prompt
    assert "No public evidence was found" in prompt
    assert "Do not claim a signature dish" in prompt
    assert "Do not assert atmosphere, vibe, energy, crowd, or room feel" in prompt
    assert "Do not invent history, dates, awards, prices, hours" in prompt
    assert "Do not use superlatives or comparative claims" in prompt


def test_build_writer_prompt_for_dining_blurb_omits_article_context():
    prompt = build_writer_prompt(
        article_title="Best Restaurants in Lima",
        article_type="single-type-listicle",
        article_location="Lima, Peru",
        article_context="### Item 2\nSelected source snapshot with address fields",
        custom_instruction="",
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

    assert "BUILDER CONTEXT\nIdeal for: seafood lovers" in prompt
    assert "ARTICLE CONTEXT" not in prompt
    assert "Selected source snapshot" not in prompt


def test_build_writer_prompt_for_intro_keeps_article_context():
    prompt = build_writer_prompt(
        article_title="Best Bars in Lima",
        article_type="single-type-listicle",
        article_location="Lima, Peru",
        article_context="### Item 1\nSelected source snapshot",
        custom_instruction="",
        target=ListicleWriterTarget(
            target_id="draft-1_header_intro",
            field_type="intro",
            category="nightlife",
            supporting_context="Selected venues: Ayahuasca",
        ),
    )

    assert "BUILDER CONTEXT\nSelected venues: Ayahuasca" in prompt
    assert "ARTICLE CONTEXT\n### Item 1\nSelected source snapshot" in prompt
    assert "LISTICLE CATEGORY INTRO ANGLE\nnightlife:" in prompt
    assert "Use selected venue names as range context only" in prompt
    assert "Use the online research to inform the copy" not in prompt


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


def test_voice_rules_block_is_injected_for_dining_blurb():
    block = _voice_rules_block("dining", "blurb")
    assert "VOICE RULES" in block
    assert "NIGHTLIFE BLURB CALIBRATION" not in block


def test_voice_rules_block_is_injected_for_nightlife_blurb():
    block = _voice_rules_block("nightlife", "blurb")
    assert "VOICE RULES" in block
    assert "NIGHTLIFE BLURB CALIBRATION" in block
    assert "Do not write a standalone address sentence" in block


def test_voice_rules_block_is_empty_for_key_location():
    """Per-category gate stays closed for key_location, which has no lean
    Writer Brief path."""
    assert _voice_rules_block("key_location", "blurb") == ""


def test_voice_rules_block_is_empty_for_intros_even_in_dining():
    """Intros are excluded from the blurb-shaped rule set (different prose
    shape, no per-item angle). Separate rollout."""
    assert _voice_rules_block("dining", "intro") == ""


# ---------- Lean nightlife writer prompt (ADR 0007) ----------


def _lean_brief(angle="best-for-night"):
    from app.features.editor_assist.writer_brief import SourceFact, WriterBrief

    return WriterBrief(
        angle_directive=(
            "Open by naming the kind of night Ayahuasca is best for, and give "
            "one concrete reason rooted in the room, the drinks, the crowd, or "
            "the pacing."
        ),
        source_facts=[
            SourceFact(
                fact="Set in the Berninzon mansion in Barranco.",
                citations=["https://x"],
            ),
            SourceFact(fact="Pisco-forward cocktail program.", citations=["https://y"]),
            SourceFact(
                fact="Open late, roughly until 2 or 3 AM.", citations=["https://z"]
            ),
        ],
        angle=angle,
        venue="Ayahuasca",
    )


def _lean_target(supporting_context="Some LM identity dump that should not appear"):
    from app.features.editor_assist.listicle_writer import ListicleWriterTarget

    return ListicleWriterTarget(
        target_id="item-1_blurb",
        field_type="blurb",
        category="nightlife",
        display_name="Ayahuasca",
        research_subject="Ayahuasca",
        location_label="Barranco, Lima",
        supporting_context=supporting_context,
    )


def test_lean_nightlife_prompt_contains_required_sections():
    from app.features.editor_assist.listicle_writer import (
        build_lean_writer_prompt,
    )

    prompt = build_lean_writer_prompt(
        category="nightlife",
        article_title="Best Bars in Barranco for a Night Out in Lima",
        article_type="single-type-listicle",
        article_location="Lima, Peru",
        target=_lean_target(),
        brief=_lean_brief(),
        list_tone="elevated",
    )
    assert "Best Bars in Barranco for a Night Out in Lima" in prompt
    assert "Venue: Ayahuasca, Barranco, Lima" in prompt
    assert prompt.count("Best Bars in Barranco") == 1  # title not duplicated
    assert "Tone: elevated." in prompt
    assert "Angle: Open by naming the kind of night Ayahuasca" in prompt
    assert "Source facts (use only what you need):" in prompt
    assert "- Set in the Berninzon mansion in Barranco." in prompt
    assert "Length: 90 to 140 words. One paragraph. No heading." in prompt
    assert "Write like an editor who has been there." in prompt
    assert "Avoid:" in prompt
    assert "Em dashes" in prompt
    assert "Vary sentence length." in prompt
    assert prompt.endswith("Output the paragraph only.")


def test_lean_nightlife_prompt_omits_legacy_voice_walls_and_builder_context():
    from app.features.editor_assist.listicle_writer import (
        build_lean_writer_prompt,
    )

    prompt = build_lean_writer_prompt(
        category="nightlife",
        article_title="Best Bars in Barranco",
        article_type="single-type-listicle",
        article_location="Lima, Peru",
        target=_lean_target(
            supporting_context="hours: noon to 3am, sqm: 1200, lunch service"
        ),
        brief=_lean_brief(),
        list_tone="elevated",
    )
    # BUILDER CONTEXT and LM identity payload must not leak into the lean prompt
    assert "BUILDER CONTEXT" not in prompt
    assert "hours: noon to 3am" not in prompt
    assert "sqm" not in prompt
    assert "lunch service" not in prompt
    # Legacy voice-block fragments must be absent
    assert "VOICE RULES" not in prompt
    assert "Triad rule" not in prompt
    assert "Blurb rhythm" not in prompt
    assert "Cadence rule" not in prompt
    assert "NIGHTLIFE BLURB CALIBRATION" not in prompt
    # Citations live in inspector trace only
    assert "https://" not in prompt


def test_lean_nightlife_prompt_renders_current_draft_when_present():
    from app.features.editor_assist.listicle_writer import (
        ListicleWriterTarget,
        build_lean_writer_prompt,
    )

    target = ListicleWriterTarget(
        target_id="item-1_blurb",
        field_type="blurb",
        category="nightlife",
        display_name="Ayahuasca",
        research_subject="Ayahuasca",
        location_label="Barranco, Lima",
        current_content="A prior draft to improve.",
    )
    prompt = build_lean_writer_prompt(
        category="nightlife",
        article_title="Best Bars",
        article_type="single-type-listicle",
        article_location="Lima, Peru",
        target=target,
        brief=_lean_brief(),
        list_tone="elevated",
    )
    assert "Current draft" in prompt
    assert "A prior draft to improve." in prompt


def test_lean_nightlife_prompt_falls_back_to_elevated_tone_when_unset():
    from app.features.editor_assist.listicle_writer import (
        build_lean_writer_prompt,
    )

    prompt = build_lean_writer_prompt(
        category="nightlife",
        article_title="Best Bars",
        article_type="single-type-listicle",
        article_location="Lima, Peru",
        target=_lean_target(),
        brief=_lean_brief(),
        list_tone=None,
    )
    assert "Tone: Elevated editorial." in prompt
