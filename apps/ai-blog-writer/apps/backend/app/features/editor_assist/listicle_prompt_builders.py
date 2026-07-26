"""Prompt builders for Listicle Content Generation."""

from __future__ import annotations

from .angle_assignment import ListicleAngle
from .listicle_prompt_policy import (
    ARTICLE_TYPE_LABELS,
    BLURB_MAX_WORDS,
    BLURB_MIN_WORDS,
    CATEGORY_PROMPT_VARIANTS,
    LEAN_AVOID_LINES_BY_CATEGORY,
    LEAN_AVOID_LINES_SHARED,
    LIST_TONE_GUIDANCE,
    angle_block,
    build_common_rules,
    format_location_for_prompt,
    intro_category_angle_block,
    render_supporting_context,
    tone_block,
    voice_rules_block,
)
from .listicle_writer_contracts import (
    ListTone,
    ListicleArticleType,
    ListicleCategory,
    ListicleWriterTarget,
)
from .writer_brief_contracts import WriterBrief
from .writer_brief_rendering import render_source_facts_block


def build_generation_prompt(
    *,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    target: ListicleWriterTarget,
    article_context: str,
    custom_instruction: str = "",
) -> str:
    article_type_label = ARTICLE_TYPE_LABELS[article_type]
    rendered_context = render_supporting_context(
        target.supporting_context,
        article_context,
        include_article_context=target.field_type == "intro",
    )
    current_copy_block = (
        f"\n\nCURRENT BUILDER COPY\n{target.current_content.strip()}"
        if target.current_content.strip()
        else ""
    )

    if target.field_type == "intro":
        rules = "\n".join(
            f"- {line}" for line in build_common_rules(field_type="intro")
        )
        intro_angle = intro_category_angle_block(target.category)
        itinerary_context = (
            "Frame the piece like a polished itinerary opener that previews the overall day or sequence."
            if article_type == "listicle-itinerary"
            else "Frame the piece like a polished publication intro that sets up the list without turning into a table of contents."
        )
        custom_block = (
            f"\n\nCUSTOM INSTRUCTION\n{custom_instruction.strip()}"
            if custom_instruction.strip()
            else ""
        )
        context_block = f"\n\n{rendered_context}" if rendered_context else ""
        return (
            "You are writing the intro for a travel listicle in the style of a polished digital publication. "
            "Write like a confident travel editor, not like a review summary.\n\n"
            f"Article type:\n{article_type_label}\n\n"
            f"Article title:\n{article_title.strip()}\n\n"
            f"Location:\n{format_location_for_prompt(article_location)}\n"
            f"{intro_angle}"
            f"{context_block}"
            f"{current_copy_block}"
            "\n\nTask:\n"
            "Use the supplied context as the source of truth. Write one publication-ready intro paragraph. "
            "If CURRENT BUILDER COPY is present, treat it as a draft reference only and improve it freely.\n\n"
            "Requirements:\n"
            f"{rules}\n"
            f"- {itinerary_context}\n"
            "- Make clear what kind of experience this article delivers in this location.\n"
            "- Use selected venue names as range context only; do not list venues by default.\n"
            f"{'- Let the LISTICLE CATEGORY INTRO ANGLE shape the article promise.' + chr(10) if intro_angle else ''}"
            "- Keep the writing concise, polished, and specific.\n"
            f"{custom_block}\n\n"
            "Output:\n"
            "One intro paragraph only."
        ).strip()

    category = target.category or "dining"
    variant = CATEGORY_PROMPT_VARIANTS[category]
    rules = "\n".join(f"- {line}" for line in build_common_rules(field_type="blurb"))
    subject_label = variant["subject_label"]
    subject_name = (target.research_subject or target.display_name or "").strip()
    subject_location = format_location_for_prompt(
        target.location_label or article_location
    )
    custom_block = (
        f"\n\nCUSTOM INSTRUCTION\n{custom_instruction.strip()}"
        if custom_instruction.strip()
        else ""
    )
    context_block = f"\n\n{rendered_context}" if rendered_context else ""
    voice_block = voice_rules_block(category, target.field_type)
    return (
        "You are writing a blurb for a travel listicle in the style of a polished digital publication. "
        f"Write like a confident {variant['editor_role']}, not like a review summary.\n\n"
        f"Article type:\n{article_type_label}\n\n"
        f"Article title:\n{article_title.strip()}\n\n"
        f"{subject_label}:\n{subject_name}\n\n"
        f"Location:\n{subject_location}\n"
        f"{context_block}"
        f"{current_copy_block}"
        "\n\nTask:\n"
        f"First, research this {variant['label'].lower()} online. {variant['research']} "
        "Then write one publication-ready blurb based on that research. "
        "If CURRENT BUILDER COPY is present, treat it as a draft reference only and improve it freely.\n\n"
        "Requirements:\n"
        f"{rules}\n"
        f"- {variant['focus']}\n"
        "- Make clear why it belongs in this specific list.\n"
        "- Absorb the research into direct, confident editorial writing.\n"
        "- Keep the writing concise, polished, and specific.\n"
        f"{custom_block}"
        f"{voice_block}\n\n"
        "Output:\n"
        "One blurb paragraph only."
    ).strip()


def build_writer_prompt(
    *,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    target: ListicleWriterTarget,
    article_context: str,
    custom_instruction: str = "",
    list_tone: ListTone | None = None,
    listicle_angle: ListicleAngle | None = None,
) -> str:
    """Build the writer-only prompt after research is supplied."""
    article_type_label = ARTICLE_TYPE_LABELS[article_type]
    rendered_context = render_supporting_context(
        target.supporting_context,
        article_context,
        include_article_context=target.field_type == "intro",
    )
    rendered_tone = tone_block(list_tone)
    intro_angle = intro_category_angle_block(target.category)
    rendered_angle = angle_block(listicle_angle) if target.field_type == "blurb" else ""
    current_copy_block = (
        f"\n\nCURRENT BUILDER COPY\n{target.current_content.strip()}"
        if target.current_content.strip()
        else ""
    )

    if target.field_type == "intro":
        rules = "\n".join(
            f"- {line}" for line in build_common_rules(field_type="intro")
        )
        itinerary_context = (
            "Frame the piece like a polished itinerary opener that previews the overall day or sequence."
            if article_type == "listicle-itinerary"
            else "Frame the piece like a polished publication intro that sets up the list without turning into a table of contents."
        )
        custom_block = (
            f"\n\nCUSTOM INSTRUCTION\n{custom_instruction.strip()}"
            if custom_instruction.strip()
            else ""
        )
        context_block = f"\n\n{rendered_context}" if rendered_context else ""
        return (
            "You are writing the intro for a travel listicle in the style of a polished digital publication. "
            "Write like a confident travel editor, not like a review summary.\n\n"
            f"Article type:\n{article_type_label}\n\n"
            f"Article title:\n{article_title.strip()}\n\n"
            f"Location:\n{format_location_for_prompt(article_location)}"
            f"{rendered_tone}"
            f"{intro_angle}\n"
            f"{context_block}"
            f"{current_copy_block}"
            "\n\nTask:\n"
            "Use the supplied context as the source of truth. Write one publication-ready intro paragraph. "
            "If CURRENT BUILDER COPY is present, treat it as a draft reference only and improve it freely. "
            "Do not invent details beyond what the context supports.\n\n"
            "Requirements:\n"
            f"{rules}\n"
            f"- {itinerary_context}\n"
            "- Make clear what kind of experience this article delivers in this location.\n"
            "- Use selected venue names as range context only; do not list venues by default.\n"
            f"{'- Match the LIST TONE precisely.' + chr(10) if rendered_tone else ''}"
            f"{'- Let the LISTICLE CATEGORY INTRO ANGLE shape the article promise.' + chr(10) if intro_angle else ''}"
            "- Keep the writing concise, polished, and specific.\n"
            f"{custom_block}\n\n"
            "Output:\n"
            "One intro paragraph only."
        ).strip()

    category = target.category or "dining"
    variant = CATEGORY_PROMPT_VARIANTS[category]
    rules = "\n".join(f"- {line}" for line in build_common_rules(field_type="blurb"))
    subject_label = variant["subject_label"]
    subject_name = (target.research_subject or target.display_name or "").strip()
    subject_location = format_location_for_prompt(
        target.location_label or article_location
    )
    custom_block = (
        f"\n\nCUSTOM INSTRUCTION\n{custom_instruction.strip()}"
        if custom_instruction.strip()
        else ""
    )
    context_block = f"\n\n{rendered_context}" if rendered_context else ""
    voice_block = voice_rules_block(category, target.field_type)
    return (
        "You are writing a blurb for a travel listicle in the style of a polished digital publication. "
        f"Write like a confident {variant['editor_role']}, not like a review summary.\n\n"
        f"Article type:\n{article_type_label}\n\n"
        f"Article title:\n{article_title.strip()}\n\n"
        f"{subject_label}:\n{subject_name}\n\n"
        f"Location:\n{subject_location}"
        f"{rendered_tone}"
        f"{rendered_angle}\n"
        f"{context_block}"
        f"{current_copy_block}"
        "\n\nTask:\n"
        "Use the supplied context as the source of truth. Write one publication-ready blurb. "
        "If CURRENT BUILDER COPY is present, treat it as a draft reference only and improve it freely. "
        "Do not invent details beyond what the context supports.\n\n"
        "Requirements:\n"
        f"{rules}\n"
        f"- {variant['focus']}\n"
        "- Make clear why it belongs in this specific list.\n"
        "- Anchor the writing in the concrete facts you have; do not speculate.\n"
        f"{'- Match the LIST TONE precisely.' + chr(10) if rendered_tone else ''}"
        f"{'- Lead from the BLURB ANGLE; let it shape the first sentence.' + chr(10) if rendered_angle else ''}"
        "- Keep the writing concise, polished, and specific.\n"
        f"{custom_block}"
        f"{voice_block}\n\n"
        "Output:\n"
        "One blurb paragraph only."
    ).strip()


def build_lean_writer_prompt(
    *,
    category: ListicleCategory,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    target: ListicleWriterTarget,
    brief: WriterBrief,
    custom_instruction: str = "",
    list_tone: ListTone | None = None,
) -> str:
    """Build the curated Writer Brief prompt used by lean blurb paths."""
    article_type_label = ARTICLE_TYPE_LABELS[article_type]
    venue_name = (target.research_subject or target.display_name or "").strip()
    venue_location = format_location_for_prompt(
        target.location_label or article_location
    )
    tone_guidance = LIST_TONE_GUIDANCE.get(list_tone) if list_tone else None
    tone_line = (
        f"Tone: {list_tone}. {tone_guidance}"
        if list_tone and tone_guidance
        else "Tone: Elevated editorial. Confident, precise, a point of view. Not formal to the point of stiffness."
    )
    angle_line = (
        f"Angle: {brief.angle_directive}"
        if brief.angle_directive
        else "Angle: Open with one concrete reason this venue belongs in the list."
    )
    source_facts_block = render_source_facts_block(brief)
    avoid_lines = LEAN_AVOID_LINES_SHARED + LEAN_AVOID_LINES_BY_CATEGORY.get(
        category, ()
    )
    avoid_block = "Avoid:\n" + "\n".join(f"- {line}" for line in avoid_lines)
    current_copy_block = (
        f"\n\nCurrent draft (improve freely; do not preserve its shape):\n{target.current_content.strip()}"
        if target.current_content.strip()
        else ""
    )
    custom_block = (
        f"\n\nExtra instruction: {custom_instruction.strip()}"
        if custom_instruction.strip()
        else ""
    )
    if category in ("dining", "accommodations", "attractions"):
        editor_role = CATEGORY_PROMPT_VARIANTS[category]["editor_role"]
        voice_line = (
            f"Write like a {editor_role} who has been there. Take a position. Pick the "
            "one detail that actually decides the recommendation and lead with it."
        )
        category_label = CATEGORY_PROMPT_VARIANTS[category]["label"].lower()
        listicle_descriptor = f"{category_label} listicle"
    else:
        voice_line = (
            "Write like an editor who has been there. Take a position. Pick the one "
            "detail that actually decides the recommendation and lead with it."
        )
        listicle_descriptor = "nightlife listicle"
    return (
        f'You are writing one blurb for a {listicle_descriptor}, "{article_title.strip()}."\n'
        f"Article type: {article_type_label}\n"
        f"Venue: {venue_name}, {venue_location}\n"
        f"{tone_line}\n"
        f"{angle_line}\n\n"
        f"{source_facts_block}\n\n"
        f"Length: {BLURB_MIN_WORDS} to {BLURB_MAX_WORDS} words. One paragraph. No heading.\n"
        f"{voice_line}\n\n"
        f"{avoid_block}\n\n"
        "Vary sentence length. Not every sentence the same shape."
        f"{current_copy_block}"
        f"{custom_block}\n\n"
        "Output the paragraph only."
    ).strip()


def build_identity_only_writer_prompt(
    *,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    target: ListicleWriterTarget,
    article_context: str,
    custom_instruction: str = "",
    list_tone: ListTone | None = None,
) -> str:
    """Build the strict identity-only prompt for unusable research."""
    article_type_label = ARTICLE_TYPE_LABELS[article_type]
    category = target.category or "dining"
    variant = CATEGORY_PROMPT_VARIANTS[category]
    rules = "\n".join(f"- {line}" for line in build_common_rules(field_type="blurb"))
    subject_label = variant["subject_label"]
    subject_name = (target.research_subject or target.display_name or "").strip()
    subject_location = format_location_for_prompt(
        target.location_label or article_location
    )
    rendered_tone = tone_block(list_tone)
    custom_block = (
        f"\n\nCUSTOM INSTRUCTION\n{custom_instruction.strip()}"
        if custom_instruction.strip()
        else ""
    )
    voice_block = voice_rules_block(category, target.field_type)
    return (
        "You are writing a blurb for a travel listicle in the style of a polished digital publication. "
        f"Write like a confident {variant['editor_role']}, not like a review summary.\n\n"
        "EVIDENCE STATUS\n"
        "No public evidence was found for this venue. Compose only from the identity fields below. "
        "Do not infer specifics that are not present here.\n\n"
        f"Article type:\n{article_type_label}\n\n"
        f"Article title:\n{article_title.strip()}\n\n"
        f"{subject_label}:\n{subject_name}\n\n"
        f"Location:\n{subject_location}"
        f"{rendered_tone}\n\n"
        "Task:\n"
        "Write one short, factual blurb paragraph using only the identity and category above.\n\n"
        "Strict constraints:\n"
        f"{rules}\n"
        "- Do not claim a signature dish, signature program, signature feature, or signature amenity.\n"
        "- Do not assert atmosphere, vibe, energy, crowd, or room feel.\n"
        "- Do not name dishes, drinks, DJs, designers, owners, or founders.\n"
        "- Do not use superlatives or comparative claims (best, most, finest, beloved, iconic).\n"
        "- Do not invent history, dates, awards, prices, hours, or amenities.\n"
        "- Keep to the category and neighborhood positioning only.\n"
        f"{custom_block}"
        f"{voice_block}\n\n"
        "Output:\n"
        "One short blurb paragraph only."
    ).strip()
