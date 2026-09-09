"""Building a listicle interview by hand, without a model or a network.

Every test below the interview needs a `GrillState` that has agreed, and
building one inline is thirty lines of contract before the test says anything.
"""

from __future__ import annotations

from app.features.prompt2blog.contracts_v4 import (
    GrillOption,
    GrillQuestion,
    GrillState,
    GrillTurn,
)
from app.features.listicle_pipeline.contracts import LISTICLE_MARKER_KEYS


def turn(
    marker: str,
    answer: str,
    *,
    ask: str = "",
    recommendation: str = "-",
    options: list[GrillOption] | None = None,
) -> GrillTurn:
    return GrillTurn(
        question=GrillQuestion(
            question_id=f"q-{marker}-{abs(hash(answer)) % 10_000}",
            topic=marker,
            ask=ask or f"About {marker}?",
            recommendation=recommendation,
            asks_about=marker,
            options=options or [],
        ),
        answer=answer,
    )


def option(
    text: str,
    *,
    recommended: bool = False,
    group: str = "",
    shape: str = "",
    role: str = "",
) -> GrillOption:
    return GrillOption(
        text=text, recommended=recommended, group=group, shape=shape, role=role
    )


def agreed_state(
    *,
    run_id: str = "run0001",
    seed: str = "The 20 best cevicherias in Lima",
    turns: list[GrillTurn] | None = None,
    consensus: str = "Twenty cevicherias in Lima.",
) -> GrillState:
    """An interview that has settled every marker."""
    return GrillState(
        run_id=run_id,
        seed=seed,
        status="agreed",
        consensus=consensus,
        markers_covered=list(LISTICLE_MARKER_KEYS),
        marker_keys=LISTICLE_MARKER_KEYS,
        turns=turns or default_turns(),
    )


def default_turns() -> list[GrillTurn]:
    return [
        turn("kind", "cevicherias"),
        turn("place", "Lima, Peru"),
        turn("count", "20", recommendation="20"),
        turn("bar", "written up by someone other than the place itself"),
        turn("cut", "no chains, no delivery-only"),
        turn(
            "angles",
            "cevicherias open for decades\nvery cheap cevicherias people rate highly",
            options=[
                option(
                    "cevicherias open for decades",
                    recommended=True,
                    group="heritage",
                    shape="institution",
                    role="broad",
                ),
                option(
                    "very cheap cevicherias people rate highly",
                    recommended=True,
                    group="price",
                    shape="cheap",
                    role="broad",
                ),
                option(
                    "nikkei cevicherias doing Japanese-Peruvian preparations",
                    group="tradition",
                    shape="crossed",
                    role="distinctive",
                ),
            ],
        ),
    ]
