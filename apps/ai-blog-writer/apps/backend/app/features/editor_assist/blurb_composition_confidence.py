"""Low-confidence policy for generated listicle blurbs."""

from dataclasses import dataclass, field

from .angle_assignment import ANTI_AI_PROMPT_CATEGORIES
from .blurb_composition_contracts import (
    ListicleCompositionSettings,
    ListicleCompositionTarget,
)
from .research_profile import ResearchProfile


@dataclass
class LowConfidence:
    """Accumulate unique reasons that a generated blurb needs editorial review."""

    reasons: list[str] = field(default_factory=list)

    def add(self, reason: str) -> None:
        if reason not in self.reasons:
            self.reasons.append(reason)

    @property
    def value(self) -> bool:
        return bool(self.reasons)


def initial_low_confidence(
    *,
    is_blurb: bool,
    target: ListicleCompositionTarget,
    research_profile: ResearchProfile | None,
    settings: ListicleCompositionSettings,
) -> LowConfidence:
    low_confidence = LowConfidence()
    angle_failed = (
        is_blurb
        and target.category in ANTI_AI_PROMPT_CATEGORIES
        and settings.requested_angle is not None
        and settings.effective_angle is None
    )
    if angle_failed:
        low_confidence.add("requested angle unsupported")
    if (
        is_blurb
        and research_profile is not None
        and not research_profile.usable_for_blurb
    ):
        low_confidence.add("research profile unusable")
    return low_confidence
