from app.features.url2blog.config import (
    URL2BLOG_EDITORIAL_BLUEPRINT_MAX_COMPONENTS,
)
from app.features.url2blog.content.editorial_blocks import (
    _build_insert_only_editorial_augmentation,
    _format_editorial_blueprint_for_prompt,
)
from app.features.url2blog.content.sanitizers import (
    _sanitize_v2_editorial_augmentation,
    _sanitize_v2_editorial_blueprint,
)
from app.features.url2blog.dependencies import PipelineDependencies
from app.features.url2blog.llm.coerce import _tokenize_similarity_words
from app.features.url2blog.pipeline_v2.editorial_recheck import (
    _pipeline_v2_run_editorial_post_recheck_phase,
)


def test_editorial_augmentation_normalizes_faq_component_and_adds_box():
    parsed = {
        "augmented_content": (
            "## Overview\n\nThis article compares timing, weather, crowds, and cost."
        ),
        "components_added": [
            {
                "component": "faq",
                "justification": "Captures question-style search arrivals without new claims.",
                "placement": "Near the end after key takeaways.",
            }
        ],
        "diagnostic": {
            "cognitive_load": "strong",
            "narrative_density": "strong",
            "emphasis_clarity": "strong",
            "reading_behavior_risk": "weak",
        },
        "augmentation_summary": "Added compact FAQ block for search-intent coverage.",
    }

    sanitized = _sanitize_v2_editorial_augmentation(
        parsed,
        fallback_content="## Overview\n\nFallback body.",
    )

    assert sanitized["components_added"][0]["component"] == "faq_block"
    assert "[!EDITORIAL-BLOCK-START|faq_block]" in sanitized["augmented_content"]
    assert "[!EDITORIAL-BLOCK-LABEL|FAQ Block]" in sanitized["augmented_content"]
    assert "[!EDITORIAL-BOX|faq_block]" in sanitized["augmented_content"]
    assert "[!EDITORIAL-BLOCK-END|faq_block]" in sanitized["augmented_content"]
    assert "**Component:** FAQ Block" in sanitized["augmented_content"]


def test_editorial_augmentation_adds_official_label_inside_existing_block():
    parsed = {
        "augmented_content": (
            "## Overview\n\n"
            "> [!EDITORIAL-BLOCK-START|highlight_callout]\n"
            "> [!EDITORIAL-BOX|highlight_callout]\n"
            "> Brief pacing reset sentence.\n"
            "> [!EDITORIAL-BLOCK-END|highlight_callout]\n"
        ),
        "components_added": [
            {
                "component": "highlight_callout",
                "justification": "Creates breathing room in a dense area.",
                "placement": "After the first section.",
            }
        ],
    }

    sanitized = _sanitize_v2_editorial_augmentation(
        parsed,
        fallback_content="## Overview\n\nFallback body.",
    )

    assert (
        "[!EDITORIAL-BLOCK-START|highlight_callout]" in sanitized["augmented_content"]
    )
    assert (
        "[!EDITORIAL-BLOCK-LABEL|Highlight Callout]" in sanitized["augmented_content"]
    )
    assert "[!EDITORIAL-BOX|highlight_callout]" in sanitized["augmented_content"]
    assert "**Component:** Highlight Callout" in sanitized["augmented_content"]
    assert "[!EDITORIAL-BLOCK-END|highlight_callout]" in sanitized["augmented_content"]


def test_editorial_augmentation_does_not_shorten_article_body():
    fallback_content = (
        "## Overview\n\n"
        "Peru has multiple climate zones that affect trip timing.\n\n"
        "## Key Insights\n\n"
        "Dry season in the highlands and summer on the coast do not fully overlap.\n\n"
        "## Practical Implications\n\n"
        "Travelers should prioritize weather, crowds, and budget based on region."
    )
    parsed = {
        "augmented_content": "## Overview\n\nShort summary only.",
        "components_added": [
            {
                "component": "faq_block",
                "justification": "Adds question-style retrieval for skimmers.",
                "placement": "Near the end.",
            }
        ],
    }

    sanitized = _sanitize_v2_editorial_augmentation(
        parsed,
        fallback_content=fallback_content,
    )

    assert len(_tokenize_similarity_words(sanitized["augmented_content"])) >= len(
        _tokenize_similarity_words(fallback_content)
    )
    assert "[!EDITORIAL-BLOCK-START|faq_block]" in sanitized["augmented_content"]


def test_sanitize_v2_editorial_blueprint_limits_components_and_defaults():
    parsed = {
        "apply_plan": True,
        "components": [
            {
                "component": "faq",
                "placement": "Near end",
                "objective": "Answer common questions.",
            },
            {
                "component": "pull_quote",
                "placement": "After overview",
                "objective": "Emphasize a key line.",
            },
            {
                "component": "highlight",
                "placement": "Midpoint",
                "objective": "Break dense pacing.",
            },
            {
                "component": "key_takeaways_box",
                "placement": "End",
                "objective": "Summarize points.",
            },
        ],
        "drafting_directives": [],
        "guardrails": [],
    }

    blueprint = _sanitize_v2_editorial_blueprint(parsed)

    assert blueprint["apply_plan"] is True
    assert len(blueprint["components"]) == URL2BLOG_EDITORIAL_BLUEPRINT_MAX_COMPONENTS
    assert blueprint["components"][0]["component"] == "faq_block"
    assert blueprint["components"][1]["component"] == "pull_quote"
    assert blueprint["drafting_directives"]
    assert blueprint["guardrails"]


def test_format_editorial_blueprint_for_prompt_handles_no_plan():
    text = _format_editorial_blueprint_for_prompt(
        {"apply_plan": False, "components": []}
    )
    assert text == "No editorial blueprint directives."


def test_build_insert_only_editorial_augmentation_adds_component_boxes():
    fallback = (
        "## Overview\n\nReader context.\n\n"
        "## Key Insights\n\nMain ideas.\n\n"
        "## Practical Implications\n\nActionable guidance."
    )
    blueprint = {
        "apply_plan": True,
        "components": [
            {
                "component": "faq_block",
                "placement": "Near the end",
                "objective": "Support skimmers with clear Q&A.",
                "priority": "medium",
            }
        ],
    }

    result = _build_insert_only_editorial_augmentation(
        fallback_content=fallback,
        editorial_blueprint=blueprint,
    )

    assert result["augmentation_applied"] is True
    assert result["components_added"][0]["component"] == "faq_block"
    assert "[!EDITORIAL-BLOCK-START|faq_block]" in result["augmented_content"]


def test_editorial_post_recheck_skips_when_disabled():
    context = {
        "run_id": "run-test",
        "selected_model_name": "gemini-2.5-flash",
        "include_debug": False,
        "use_editorial_post_recheck": False,
        "editorial_augmentation": {
            "augmentation_applied": True,
            "augmented_content": "## Overview\n\nBody.",
        },
        "stage_trace": [],
    }

    updated = _pipeline_v2_run_editorial_post_recheck_phase(
        context, PipelineDependencies()
    )

    assert updated["editorial_post_recheck"]["decision"] == "skipped"
    assert updated["editorial_post_recheck"]["pass_mode"] == "skipped"
