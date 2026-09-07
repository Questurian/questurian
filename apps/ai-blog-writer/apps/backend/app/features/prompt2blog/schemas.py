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

import json
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
                    "target_words": {"type": "integer", "minimum": 0},
                },
            },
        },
        "takeaway_focus": {"type": "string"},
        "commission_alignment": {"type": "string"},
        "unsupported_requirements": {"type": "array", "items": {"type": "string"}},
    },
}


def v3_outline_schema(*, min_sections: int, max_sections: int) -> dict[str, Any]:
    """The outline shape for one run's approved form.

    `minItems` used to be a literal 3 for every form, which is finding 07 in
    the one place a provider enforces rather than requests: a Q&A that divides
    into two was refused by the transport before any of our own checks could
    have an opinion.
    """
    schema = json.loads(json.dumps(V3_OUTLINE_SCHEMA))
    schema["properties"]["sections"]["minItems"] = min_sections
    schema["properties"]["sections"]["maxItems"] = max_sections
    return schema


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

# Repair no longer returns a whole article. It returns replacements for the
# sections it is changing, and `apply_section_replacements` writes them into
# the original document -- which is what makes "change only what was flagged"
# a property of the code rather than a request in a prompt (finding 06).
#
# `improved_content` is deliberately absent: a model that can still return one
# will, and the whole point is that it cannot hand back prose for sections
# nobody asked about.
REPAIR_SECTIONS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["sections"],
    "properties": {
        "improved_title": {"type": "string"},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["section_id", "text_hash", "content"],
                "properties": {
                    "section_id": {"type": "string"},
                    "text_hash": {"type": "string"},
                    "heading": {"type": "string"},
                    "content": {"type": "string"},
                    "claim_ids": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "brief_alignment_summary": {"type": "string"},
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


# The grounding call used to be asked in prose with nothing enforcing the
# shape, and `{}` came back looking like a pass (finding 02). The schema is the
# cheap half of the fix on providers that enforce one; `_sanitize_groundedness`
# is the half that runs everywhere, and it is the one the verdict rests on.
#
# Stricter than the others on purpose. Everything named here is something the
# verdict cannot be read without, so a schema that let it through would only be
# moving the refusal one stage later.
GROUNDEDNESS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["grounded", "assessment", "unsupported_claims"],
    "properties": {
        "grounded": {"type": "boolean"},
        "assessment": {"type": "string"},
        "unsupported_claims": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["claim", "reason", "severity"],
                "properties": {
                    "claim": {"type": "string"},
                    "reason": {"type": "string"},
                    "severity": {"type": "string", "enum": ["high", "low"]},
                },
            },
        },
    },
}
