"""Compatibility facade for the Itinerary Composition family.

HTTP orchestration, contracts, prompt preparation, writer execution, validation,
and tracing live in cohesive adjacent modules. Existing imports from this module
remain valid.
"""

from app.shared.writer_invocation import WriterModelError

from .contracts import MAX_ARTICLE_TITLE_CHARS, ListTone
from .itinerary_brief import (
    COMPOSE_BRIEF_PROMPT,
    _clean_profile_options,
    _compose_itinerary_brief_impl,
)
from .itinerary_composition_contracts import (
    MAX_DAY_BLURB_STOPS,
    MAX_INTRO_OVERVIEW_CHARS,
    MAX_INTRO_STOPS,
    MAX_PROFILE_NOTES_CHARS,
    MAX_PROFILE_OPTION_CHARS,
    MAX_PROFILE_OPTIONS_PER_SECTION,
    ComposeDayBlurbResult,
    ComposeDayBlurbStop,
    ComposeDayBlurbsNeighborStop,
    ComposeDayBlurbsRequest,
    ComposeDayBlurbsResponse,
    ComposeIntroStepEvent,
    ComposeIntroStepStatus,
    ComposeItineraryBriefRequest,
    ComposeItineraryBriefResponse,
    ComposeItineraryIntroRequest,
    ComposeItineraryIntroResponse,
    ComposeItineraryIntroStop,
    ComposeStopReasonRequest,
    ComposeStopReasonResponse,
)
from .itinerary_composition_routes import (
    compose_itinerary_brief,
    compose_itinerary_day_blurbs,
    compose_itinerary_intro,
    compose_itinerary_stop_reason,
    router,
)
from .itinerary_day_blurb_execution import (
    BLURB_ENVELOPE_PATTERN,
    _compose_day_blurbs_impl,
)
from .itinerary_day_blurb_prompt import (
    COMPOSE_DAY_BLURBS_PROMPT,
    _format_day_blurb_stop_line,
)
from .itinerary_intro import (
    COMPOSE_INTRO_PROMPT,
    _compose_itinerary_intro_impl,
    _format_intro_stop_line,
)
from .itinerary_stop_reason import (
    COMPOSE_STOP_REASON_PROMPT,
    _compose_stop_reason_impl,
)

__all__ = [
    "BLURB_ENVELOPE_PATTERN",
    "COMPOSE_BRIEF_PROMPT",
    "COMPOSE_DAY_BLURBS_PROMPT",
    "COMPOSE_INTRO_PROMPT",
    "COMPOSE_STOP_REASON_PROMPT",
    "ComposeDayBlurbResult",
    "ComposeDayBlurbStop",
    "ComposeDayBlurbsNeighborStop",
    "ComposeDayBlurbsRequest",
    "ComposeDayBlurbsResponse",
    "ComposeIntroStepEvent",
    "ComposeIntroStepStatus",
    "ComposeItineraryBriefRequest",
    "ComposeItineraryBriefResponse",
    "ComposeItineraryIntroRequest",
    "ComposeItineraryIntroResponse",
    "ComposeItineraryIntroStop",
    "ComposeStopReasonRequest",
    "ComposeStopReasonResponse",
    "ListTone",
    "MAX_ARTICLE_TITLE_CHARS",
    "MAX_DAY_BLURB_STOPS",
    "MAX_INTRO_OVERVIEW_CHARS",
    "MAX_INTRO_STOPS",
    "MAX_PROFILE_NOTES_CHARS",
    "MAX_PROFILE_OPTION_CHARS",
    "MAX_PROFILE_OPTIONS_PER_SECTION",
    "WriterModelError",
    "_clean_profile_options",
    "_compose_day_blurbs_impl",
    "_compose_itinerary_brief_impl",
    "_compose_itinerary_intro_impl",
    "_compose_stop_reason_impl",
    "_format_day_blurb_stop_line",
    "_format_intro_stop_line",
    "compose_itinerary_brief",
    "compose_itinerary_day_blurbs",
    "compose_itinerary_intro",
    "compose_itinerary_stop_reason",
    "router",
]
