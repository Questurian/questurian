"""LLM fit-scoring boundary for itinerary candidates."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .llm_stages import score_candidates
from .pipeline_state import ItineraryState
from .schemas import Candidate, IntentSpec, ScoredCandidate, ShellSlot

# Fit scoring fans out across full category pools, so structured judgment stays
# on cheaper Gemini Flash instead of the premium reason-writing model.
SCORING_MODEL = "gemini-2.5-flash"


@dataclass(frozen=True)
class CandidateScores:
    scored: list[ScoredCandidate]
    prompt: str | None
    output: str | None

    def best(self) -> ScoredCandidate | None:
        return max(
            self.scored,
            key=lambda candidate: candidate.fit_score,
            default=None,
        )

    def top(self, limit: int = 5) -> list[dict[str, Any]]:
        ranked = sorted(
            self.scored,
            key=lambda candidate: candidate.fit_score,
            reverse=True,
        )
        return [
            {
                "id": item.candidate.id,
                "title": item.candidate.title,
                "collection": item.candidate.category,
                "fit_score": item.fit_score,
                "fit_note": item.fit_note,
            }
            for item in ranked[:limit]
        ]


async def defer_slot_scoring(state: ItineraryState) -> ItineraryState:
    """Keep the scoring graph stage while scoring each slot just in time.

    A Shell Slot's pool depends on winners from earlier slots, so the actual LLM
    calls stay paired with deterministic selection rather than being batched
    before the no-repeat set exists.
    """
    return state


def score_for_slot(
    *,
    intent: IntentSpec,
    slot: ShellSlot,
    candidates: list[Candidate],
    brief: str,
) -> CandidateScores:
    """Score one slot's complete candidate pool and retain its model trace."""
    trace: dict[str, str] = {}
    scored = score_candidates(
        intent=intent,
        slot=slot,
        candidates=candidates,
        brief=brief,
        model_name=SCORING_MODEL,
        trace=trace,
    )
    return CandidateScores(
        scored=scored,
        prompt=trace.get("prompt"),
        output=trace.get("output"),
    )
