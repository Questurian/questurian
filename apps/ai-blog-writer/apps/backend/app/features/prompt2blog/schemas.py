"""JSON shapes for the writer-model stages, for providers that can enforce one.

Why these exist and the other stages' do not
--------------------------------------------
Prompt2Blog asks for JSON in prose and parses whatever comes back, retrying up
to three times when it does not parse. That is the only option on a provider
with no schema enforcement, and it stays the path for those.

The Claude Code CLI does have one: ``--json-schema`` returns an already-parsed,
already-validated object. Claude only ever holds the **writer** role in this
pipeline -- research and audit stay on Gemini -- so these are exactly the four
call sites that a Claude stack can reach, and no others were written
speculatively.

Two deliberate choices about strictness
---------------------------------------
``additionalProperties`` is left open. The prompts ask for more than the
sanitizers read, and the schema refusing a field the prompt requested would
quietly lose it on Claude while Gemini kept it. ``required`` names only what the
sanitizer actually needs to produce a usable result, for the same reason: a
schema stricter than the code downstream turns a recoverable omission into a
failed call.

``component`` is the exception. The sanitizer accepts a table of aliases
because a model asked in prose picks its own wording; a model handed an enum
does not have to guess, so the canonical names are pinned and the alias table
is left to keep serving the providers still being asked in prose.
"""

from typing import Any

# Compose requires at least three `##` headings, so `sections` is required --
# an outline without them is discarded downstream anyway.
OUTLINE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["working_title", "sections"],
    "properties": {
        "working_title": {"type": "string"},
        "direct_answer_focus": {"type": "string"},
        "sections": {
            "type": "array",
            "minItems": 3,
            "maxItems": 12,
            "items": {
                "type": "object",
                "required": ["heading"],
                "properties": {
                    "heading": {"type": "string"},
                    "purpose": {"type": "string"},
                    "source_support": {"type": "string"},
                    "target_words": {"type": "integer", "minimum": 0},
                },
            },
        },
        "takeaway_focus": {"type": "string"},
        "guideline_alignment": {"type": "string"},
        "unsupported_requests": {"type": "array", "items": {"type": "string"}},
    },
}

V3_OUTLINE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["working_title", "sections"],
    "properties": {
        "working_title": {"type": "string"},
        "direct_answer_focus": {"type": "string"},
        "sections": {
            "type": "array",
            "minItems": 3,
            "maxItems": 12,
            "items": {
                "type": "object",
                "required": ["heading"],
                "properties": {
                    "heading": {"type": "string"},
                    "purpose": {"type": "string"},
                    "claim_ids": {"type": "array", "items": {"type": "string"}},
                    "requirement_ids": {"type": "array", "items": {"type": "string"}},
                    "target_words": {"type": "integer", "minimum": 0},
                },
            },
        },
        "takeaway_focus": {"type": "string"},
        "commission_alignment": {"type": "string"},
        "unsupported_requirements": {"type": "array", "items": {"type": "string"}},
    },
}

# Shared by compose and by repair: both return a whole rewritten article, and
# both go through _sanitize_rewrite.
REWRITE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["improved_title", "improved_content"],
    "properties": {
        "improved_title": {"type": "string"},
        "improved_content": {"type": "string"},
        "guideline_alignment_summary": {"type": "string"},
        "improvements_applied": {"type": "array", "items": {"type": "string"}},
        "remaining_gaps": {"type": "array", "items": {"type": "string"}},
    },
}

EDITORIAL_COMPONENT_NAMES = (
    "pull_quote",
    "in_the_know_box",
    "key_takeaways_box",
    "highlight_callout",
    "faq_block",
)

EDITORIAL_DIAGNOSTIC_AXES = (
    "cognitive_load",
    "narrative_density",
    "emphasis_clarity",
    "reading_behavior_risk",
)

EDITORIAL_AUGMENTATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["augmented_content"],
    "properties": {
        "augmented_content": {"type": "string"},
        "augmentation_summary": {"type": "string"},
        "components_added": {
            "type": "array",
            "maxItems": 5,
            "items": {
                "type": "object",
                "required": ["component"],
                "properties": {
                    "component": {
                        "type": "string",
                        "enum": list(EDITORIAL_COMPONENT_NAMES),
                    },
                    "justification": {"type": "string"},
                    "placement": {"type": "string"},
                },
            },
        },
        "diagnostic": {
            "type": "object",
            "properties": {
                axis: {"type": "string"} for axis in EDITORIAL_DIAGNOSTIC_AXES
            },
        },
    },
}
