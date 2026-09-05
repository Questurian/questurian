"""Every model call this monorepo makes, named.

A **job** is one kind of work someone asks a model to do: compose an article,
score a candidate, describe an image, suggest a field. Call sites name a job.
They never name a model, because the whole failure this package exists to
prevent is a model decision written down in 22 places and changed in 21.

The id is also the ``feature`` reported to the dashboard's usage collector, so
the usage history and the settings table line up on the same word. That is
finer-grained than what the collector receives today -- every Prompt2Blog
stage currently reports the single feature ``prompt2blog``, and the listicle
grill reports ``prompt2blog`` too, because it borrows that pipeline's code.
Rows recorded before the migration keep the old coarse feature; nothing
rewrites history.

This file is the catalogue: which jobs exist, in which app, and what shape of
call each one makes. It deliberately does **not** say which model a job runs
on. That lives in ``defaults.json`` next to it, in the same shape the
dashboard serves, so the fallback and the live table cannot drift apart by
being different kinds of thing.
"""

from __future__ import annotations

from dataclasses import dataclass

APP_ABW = "ai-blog-writer"
APP_LM = "location-manager"

# The shape of the provider call, which decides how the gateway makes it.
CALL_TEXT = "text"
"""Prompt in, prose out."""

CALL_JSON = "json"
"""Prompt in, a JSON object out, parsed or schema-validated by the transport."""

CALL_GROUNDED_TEXT = "grounded_text"
"""Google Search grounding, prose plus the source URLs it read."""

CALL_GROUNDED_JSON = "grounded_json"
"""Google Search grounding, parsed into an object with its sources merged in."""

CALL_STRUCTURED = "structured"
"""A forced tool call, where the provider guarantees the shape."""

CALL_MULTIMODAL = "multimodal"
"""An image (or image plus prompt) in, text out."""

CALL_PLACES = "places"
"""Google Places. No model, no tokens, priced per request rather than per token."""

CALL_KINDS = frozenset(
    {
        CALL_TEXT,
        CALL_JSON,
        CALL_GROUNDED_TEXT,
        CALL_GROUNDED_JSON,
        CALL_STRUCTURED,
        CALL_MULTIMODAL,
        CALL_PLACES,
    }
)


@dataclass(frozen=True)
class Job:
    """One kind of work, and where in the repo it is asked for."""

    job_id: str
    app: str
    call: str
    summary: str
    # Where the call is made today. Kept because a job id is only useful if
    # you can find the code it names, and these move.
    site: str

    @property
    def is_model_call(self) -> bool:
        """False for jobs that reach an API with no model behind it."""
        return self.call != CALL_PLACES


JOBS: tuple[Job, ...] = (
    # ---- Prompt2Blog -----------------------------------------------------
    Job(
        "p2b.compose",
        APP_ABW,
        CALL_JSON,
        "Write the article. The one call whose prose a reader sees.",
        "features/prompt2blog/stages/v3/compose.py",
    ),
    Job(
        "p2b.outline",
        APP_ABW,
        CALL_JSON,
        "Turn the work order into a section plan before anything is written.",
        "features/prompt2blog/stages/v3/outline.py",
    ),
    Job(
        "p2b.audit",
        APP_ABW,
        CALL_JSON,
        "Read the draft against the constraints and say what it breaks.",
        "features/prompt2blog/stages/v3/audit_repair.py",
    ),
    Job(
        "p2b.repair",
        APP_ABW,
        CALL_JSON,
        "Rewrite the draft to fix what the audit found. A full article rewrite.",
        "features/prompt2blog/stages/v3/audit_repair.py",
    ),
    Job(
        "p2b.groundedness",
        APP_ABW,
        CALL_JSON,
        "Check each claim in the draft against the evidence gathered for it.",
        "features/prompt2blog/stages/v3/groundedness.py",
    ),
    Job(
        "p2b.classify",
        APP_ABW,
        CALL_JSON,
        "Decide what kind of article the seed is asking for.",
        "features/prompt2blog/classification.py",
    ),
    Job(
        "p2b.grill",
        APP_ABW,
        CALL_JSON,
        "Interview the operator. Decides what the article is; every later stage inherits it.",
        "features/prompt2blog/grill_v4.py",
    ),
    Job(
        "p2b.grill_research",
        APP_ABW,
        CALL_GROUNDED_TEXT,
        "Look up the subject mid-interview so the next question can be sharp.",
        "features/prompt2blog/api/intake.py",
    ),
    Job(
        "p2b.brief",
        APP_ABW,
        CALL_JSON,
        "Write the Article Brief: the vision, never consumed by a later stage.",
        "features/prompt2blog/brief_v4.py",
    ),
    Job(
        "p2b.work_order",
        APP_ABW,
        CALL_JSON,
        "Turn the brief into the instructions the writing stages actually read.",
        "features/prompt2blog/work_order_v4.py",
    ),
    Job(
        "p2b.notes",
        APP_ABW,
        CALL_JSON,
        "Capture the operator's own notes into the run's record.",
        "features/prompt2blog/notes_v4.py",
    ),
    Job(
        "p2b.research_gather",
        APP_ABW,
        CALL_GROUNDED_TEXT,
        "Search for evidence the article will be written from.",
        "features/prompt2blog/research_v4.py",
    ),
    Job(
        "p2b.research_structure",
        APP_ABW,
        CALL_JSON,
        "Shape gathered prose into sources and claims. Shape, not judgement.",
        "features/prompt2blog/research_v4.py",
    ),
    # ---- Listicle pipeline -----------------------------------------------
    Job(
        "listicle.search",
        APP_ABW,
        CALL_GROUNDED_TEXT,
        "Search one angle for places worth listing, with evidence for each.",
        "features/listicle_pipeline/api.py",
    ),
    Job(
        "listicle.grill",
        APP_ABW,
        CALL_JSON,
        "Interview the operator about the list, using the article grill's engine.",
        "features/listicle_pipeline/service.py",
    ),
    Job(
        "listicle.grill_research",
        APP_ABW,
        CALL_GROUNDED_TEXT,
        "Look the subject up mid-interview, as the article grill does.",
        "features/listicle_pipeline/api.py",
    ),
    Job(
        "listicle.profile_research",
        APP_ABW,
        CALL_GROUNDED_TEXT,
        "Look one named place up and bring back claims with their sources.",
        "features/listicle_pipeline/profile_research.py",
    ),
    Job(
        "listicle.identity",
        APP_ABW,
        CALL_PLACES,
        "Resolve a written name to the place Google actually holds.",
        "features/listicle_pipeline/identity.py",
    ),
    Job(
        "listicle.place_details",
        APP_ABW,
        CALL_PLACES,
        "Fetch what Google holds about a place, before any model reads it.",
        "features/listicle_pipeline/places.py",
    ),
    # ---- Itineraries pipeline --------------------------------------------
    Job(
        "itinerary.intent",
        APP_ABW,
        CALL_TEXT,
        "Read the brief for keywords, price bounds and lodging hints.",
        "features/itineraries_pipeline/llm_stages.py",
    ),
    Job(
        "itinerary.scoring",
        APP_ABW,
        CALL_TEXT,
        "Score one slot's whole candidate pool against the intent.",
        "features/itineraries_pipeline/llm_stages.py",
    ),
    Job(
        "itinerary.reasons",
        APP_ABW,
        CALL_TEXT,
        "Say why each chosen stop earns its place in the day.",
        "features/itineraries_pipeline/llm_stages.py",
    ),
    Job(
        "itinerary.title",
        APP_ABW,
        CALL_TEXT,
        "Name the itinerary.",
        "features/itineraries_pipeline/routes.py",
    ),
    # ---- Editor assist ---------------------------------------------------
    Job(
        "editor.writer_brief",
        APP_ABW,
        CALL_TEXT,
        "Draft the brief an editor hands a writer.",
        "features/editor_assist/writer_brief.py",
    ),
    Job(
        "editor.research_profile",
        APP_ABW,
        CALL_GROUNDED_TEXT,
        "Research one place for the editor, grounded in search.",
        "features/editor_assist/research_profile.py",
    ),
    Job(
        "editor.seo_metadata",
        APP_ABW,
        CALL_STRUCTURED,
        "Produce title, description and slug under a forced schema.",
        "features/editor_assist/seo_metadata.py",
    ),
    Job(
        "editor.listicle_blurb",
        APP_ABW,
        CALL_TEXT,
        "Write one listicle entry, then rewrite it if validation rejects it.",
        "features/editor_assist/blurb_composition_execution.py",
    ),
    Job(
        "editor.generate_title",
        APP_ABW,
        CALL_TEXT,
        "Propose a title for an article already written.",
        "features/editor_assist/editorial_actions.py",
    ),
    Job(
        "editor.rewrite_block",
        APP_ABW,
        CALL_TEXT,
        "Rewrite one block an editor selected, with a repair pass behind it.",
        "features/editor_assist/editorial_actions.py",
    ),
    Job(
        "editor.itinerary_intro",
        APP_ABW,
        CALL_TEXT,
        "Write the opening of an itinerary article.",
        "features/editor_assist/itinerary_intro.py",
    ),
    Job(
        "editor.itinerary_brief",
        APP_ABW,
        CALL_TEXT,
        "Write the brief that frames an itinerary.",
        "features/editor_assist/itinerary_brief.py",
    ),
    Job(
        "editor.itinerary_day_blurb",
        APP_ABW,
        CALL_TEXT,
        "Write one day's summary, with a repair pass behind it.",
        "features/editor_assist/itinerary_day_blurb_execution.py",
    ),
    Job(
        "editor.itinerary_stop_reason",
        APP_ABW,
        CALL_TEXT,
        "Say why one stop belongs on the itinerary.",
        "features/editor_assist/itinerary_stop_reason.py",
    ),
    # ---- Images ----------------------------------------------------------
    Job(
        "images.alt_text",
        APP_ABW,
        CALL_MULTIMODAL,
        "Describe an image for a reader who cannot see it.",
        "features/images/alt_text_generator.py",
    ),
    Job(
        "images.scene_description",
        APP_ABW,
        CALL_MULTIMODAL,
        "Describe what is happening in an image.",
        "features/images/scene_describer.py",
    ),
    Job(
        "images.subject_description",
        APP_ABW,
        CALL_MULTIMODAL,
        "Describe the subject of an image, for re-creation.",
        "features/images/subject_describer.py",
    ),
    Job(
        "images.edit_prompt",
        APP_ABW,
        CALL_MULTIMODAL,
        "Write the prompt that edits an existing image.",
        "features/images/edit_prompt_builder.py",
    ),
    Job(
        "images.insert_prompt",
        APP_ABW,
        CALL_MULTIMODAL,
        "Write the prompt that inserts a subject into a scene.",
        "features/images/insert_prompt_builder.py",
    ),
    # ---- Location Manager ------------------------------------------------
    Job(
        "lm.alt_text",
        APP_LM,
        CALL_MULTIMODAL,
        "Describe a location photograph for a reader who cannot see it.",
        "packages/python-alt-text/generation.py",
    ),
    Job(
        "lm.neighborhood_description",
        APP_LM,
        CALL_TEXT,
        "Write a paragraph of prose about a neighborhood.",
        "packages/python-alt-text/generation.py",
    ),
    Job(
        "lm.accommodations_field_suggestion",
        APP_LM,
        CALL_GROUNDED_JSON,
        "Suggest one accommodations field from an image and grounded search.",
        "packages/python-alt-text/generation.py",
    ),
    Job(
        "lm.dining_field_suggestion",
        APP_LM,
        CALL_GROUNDED_JSON,
        "Suggest one dining field from an image and grounded search.",
        "packages/python-alt-text/generation.py",
    ),
)

JOBS_BY_ID: dict[str, Job] = {job.job_id: job for job in JOBS}


class UnknownJob(KeyError):
    """A call site named a job the registry has never heard of."""


def job(job_id: str) -> Job:
    """The job with this id.

    Raises rather than falling back to a default model. A typo that silently
    ran on some other model would be the exact class of bug this package
    exists to remove.
    """
    try:
        return JOBS_BY_ID[job_id]
    except KeyError:
        near = sorted(
            other
            for other in JOBS_BY_ID
            if other.split(".", 1)[0] == job_id.split(".", 1)[0]
        )
        hint = f" Jobs in that namespace: {', '.join(near)}." if near else ""
        raise UnknownJob(f"No job named {job_id!r}.{hint}") from None


def jobs_for_app(app: str) -> tuple[Job, ...]:
    """Every job one app is responsible for."""
    return tuple(entry for entry in JOBS if entry.app == app)
