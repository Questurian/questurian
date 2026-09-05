"""Vertex-backed text, image, and grounded generation.

Every call here names a job and lets the model gateway decide the rest. The
model comes from the dashboard's table (falling back to the gateway's own
defaults when it is unreachable), the call is timed, and its tokens and cost
are reported to the usage collector.

Before this, none of that happened. This service picked its own models from
constants in `vertex_runtime`, and reported nothing at all -- every alt-text
and field-suggestion call it had ever made was invisible on the dashboard. It
was also missed entirely by the sweep that moved the rest of the repo from
Gemini 3.x to 2.5, and nobody noticed for days, which is the whole argument
for the decision living in one place.

The environment overrides still work exactly as they did: `ALT_TEXT_MODEL`,
`NEIGHBORHOOD_DESCRIPTION_MODEL` and `ACCOMMODATIONS_FIELD_SUGGESTION_MODEL`
each still pin their job, and a pinned job ignores the dashboard. See
`model_gateway.settings`.
"""

import logging

from model_gateway import vertex

from grounding import (
    is_valid_http_url,
    merge_grounded_snippets,
    parse_json_object,
)
from models import FieldSuggestionRequest, SUPPORTED_FIELD_SUGGESTION_CATEGORIES
from prompts import build_alt_text_prompt, build_field_suggestion_prompt

logger = logging.getLogger("vertex_alt_text")

# The job each route does, as the gateway and the usage dashboard know it.
JOB_ALT_TEXT = "lm.alt_text"
JOB_NEIGHBORHOOD_DESCRIPTION = "lm.neighborhood_description"
JOB_ACCOMMODATIONS_FIELD_SUGGESTION = "lm.accommodations_field_suggestion"
JOB_DINING_FIELD_SUGGESTION = "lm.dining_field_suggestion"

# Which job a field-suggestion request is, by the category it asks about. Two
# jobs rather than one because they are separately worth costing: dining runs
# far more often, and a model change that is right for one may not be for the
# other.
FIELD_SUGGESTION_JOBS = {
    "accommodations": JOB_ACCOMMODATIONS_FIELD_SUGGESTION,
    "dining": JOB_DINING_FIELD_SUGGESTION,
}


def generate_alt_text_from_data(image_data: bytes, content_type: str) -> str:
    return vertex.generate_from_image(
        JOB_ALT_TEXT,
        image_data,
        content_type,
        build_alt_text_prompt(),
        endpoint="alt",
    ).text


def generate_text_from_prompt(prompt: str, model_name: str | None = None) -> str:
    """Neighborhood prose.

    ``model_name`` is kept because callers pass it, and it now means what a
    caller would expect: an explicit override that beats the dashboard, the
    same way an operator's dropdown choice does.
    """
    return vertex.generate_text(
        JOB_NEIGHBORHOOD_DESCRIPTION,
        prompt,
        model=model_name,
        endpoint="neighborhood-description",
    ).text


def generate_grounded_json_from_prompt(
    prompt: str,
    model_name: str | None = None,
    *,
    job_id: str = JOB_ACCOMMODATIONS_FIELD_SUGGESTION,
) -> dict:
    """A grounded answer, parsed, with the sources it read merged in."""
    try:
        generated = vertex.generate_grounded(
            job_id, prompt, model=model_name, endpoint="field-suggestion"
        )
    except vertex.GroundingUnavailable:
        # Degrading here is a deliberate, long-standing choice: a suggestion
        # from an ungrounded model is worth more to an operator than an error,
        # and the empty `sources` list says plainly that nothing was read.
        logger.warning(
            "google-genai is not installed; falling back to non-grounded Vertex generation."
        )
        return parse_json_object(
            vertex.generate_text(
                job_id, prompt, model=model_name, endpoint="field-suggestion-ungrounded"
            ).text
        )

    parsed = parse_json_object(generated.text)
    return merge_grounded_snippets(parsed, generated.raw)


def generate_field_suggestion(
    request: FieldSuggestionRequest,
    grounded_generator=generate_grounded_json_from_prompt,
) -> dict:
    if request.category not in SUPPORTED_FIELD_SUGGESTION_CATEGORIES:
        raise ValueError(
            f"category '{request.category}' is not implemented yet. Supported: {sorted(SUPPORTED_FIELD_SUGGESTION_CATEGORIES)}"
        )
    if request.kind not in {"single", "multi", "url"}:
        raise ValueError("kind must be single, multi, or url.")
    if request.kind in {"single", "multi"} and (not request.allowed_options):
        raise ValueError("allowed_options cannot be empty for kind=single|multi.")

    job_id = FIELD_SUGGESTION_JOBS[request.category]
    # The model argument stays None: the gateway resolves it from the job. The
    # positional slot is kept because the injected test doubles take it.
    result = grounded_generator(
        build_field_suggestion_prompt(request),
        None,
        job_id=job_id,
    )
    if request.kind == "url":
        suggestion = result.get("suggestion")
        if suggestion is not None and (not is_valid_http_url(suggestion)):
            result["suggestion"] = None
            result["confidence"] = 0
    return result
