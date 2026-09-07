"""A repeatable way to ask whether a change made the articles better.

Every writer-phase change so far has been argued from one run. That is not
enough to decide anything: the same prompt on the same packet does not produce
the same article twice, provider behaviour drifts, and the run somebody
remembers is the one that stuck out. Improvement 06 in the writer-improvements
report is the fix -- a small set of frozen inputs a candidate can be run
against, scored by a person who cannot see which version wrote which draft.

What is frozen
--------------
A **fixture** is one article's inputs, exactly as the writer would have
received them: the approved brief, the work order, the researched dossier, and
the operator's selection. It is captured from a run that already happened, so
it is real editorial material rather than invented test data, and once written
it never changes. That matters more than it sounds: the whole point is that the
only thing differing between two drafts is the candidate.

A **variant** is what is being tested -- a model route, a creativity level, and
the revision of this code the drafts were written by. Prompt changes are not a
field here on purpose. A prompt lives in the repository, so the revision *is*
the prompt; recording a separate "prompt version" string would let the two
disagree.

A **sample** is one draft: a variant run against a fixture, with its article,
its receipt, and how long it took.

What is not decided here
------------------------
Nothing in this module scores prose, and nothing in it combines scores. The
criteria are recorded separately and stay separate all the way to the report,
because "better" is several different questions -- a draft can be more useful
to a reader and quietly drop a caveat, and one number would hide exactly that
trade. A person reads the drafts blind and fills the sheet in.

Cost and latency are measured rather than scored. They come off the run's own
receipt, so they are facts about what happened, not opinions about it.

This module makes no model calls by itself. `run_sample` takes the executor
that does, so the whole pipeline around it -- capture, blinding, scoring,
reporting -- is testable without buying anything.
"""

from __future__ import annotations

import json
import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Literal, Protocol, Sequence

from pydantic import BaseModel, Field, model_validator

from .contracts_v4 import (
    ArticleBrief,
    EvidencePackage,
    Prompt2BlogModelRouting,
    Prompt2BlogV4Request,
    Prompt2BlogWorkOrder,
    Prompt2BlogWritingProfiles,
)
from .selection_v4 import Selection

# Bumped when a stored file stops meaning what this code reads. An older file
# is refused rather than reinterpreted: a comparison run against a fixture this
# code has misunderstood produces a confident answer to the wrong question.
EVAL_SCHEMA_VERSION = 1


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# What a fixture has to cover
# ---------------------------------------------------------------------------

# The properties an evaluation set has to contain before a comparison over it
# says anything general. Each one is a case where writers are known to differ:
# first-hand material is the one the checker used to call invented, a dated
# fact is the one style cleanup used to un-date, a declared conflict is the one
# a writer resolves silently, and a sparse dossier is where a thin brief either
# admits the gap or fills it.
#
# Deliberately computed from the frozen request rather than typed by hand. A
# label somebody assigns is a claim about a fixture; this is a reading of it.
FixtureTrait = Literal[
    "first_hand_material",
    "dated_facts",
    "declared_conflict",
    "sparse_research",
    "unsettled_requirement",
    "must_name_obligation",
]

# Below this many selected claims, the writer is working from thin material and
# the interesting question is what it does about the gap. Chosen from the
# stored corpus: the runs that read as padded sat under it, the ones that read
# as catalogues sat far above it.
SPARSE_CLAIM_COUNT = 12


def fixture_traits(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    evidence: EvidencePackage,
) -> list[str]:
    """What this article's inputs would put a writer through."""
    selected = [claim for claim in evidence.claims if claim.selected]
    traits: list[str] = []
    if brief.material:
        traits.append("first_hand_material")
    if any(claim.as_of is not None for claim in selected):
        traits.append("dated_facts")
    if evidence.conflicts:
        traits.append("declared_conflict")
    if len(selected) < SPARSE_CLAIM_COUNT:
        traits.append("sparse_research")
    if any(item.status != "supported" for item in evidence.requirements):
        traits.append("unsettled_requirement")
    if brief.must_name:
        traits.append("must_name_obligation")
    return traits


class EvalFixture(BaseModel):
    """One article's frozen inputs, and nothing about how it was written."""

    schema_version: Literal[1] = EVAL_SCHEMA_VERSION
    fixture_id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    notes: str = ""
    # The run this material came off, so a reader can go and look at what the
    # pipeline actually did with it the first time.
    captured_from_run: str = Field(min_length=1)
    captured_at: str = Field(min_length=1)
    request: Prompt2BlogV4Request
    # The operator's editorial cut, held as its own record because that is how
    # the pipeline holds it -- the dossier stays what research returned.
    selection: dict[str, Any]

    @property
    def form_id(self) -> str:
        return self.request.brief.form_id

    @property
    def length_id(self) -> str:
        return self.request.profiles.length_id

    @property
    def selection_record(self) -> Selection:
        return Selection.from_record(self.selection)

    @property
    def traits(self) -> list[str]:
        return fixture_traits(
            self.request.brief,
            self.request.work_order,
            self.request.evidence_package,
        )


def capture_fixture(
    run_id: str,
    *,
    fixture_id: str,
    label: str,
    request: Prompt2BlogV4Request,
    selection: Selection,
    notes: str = "",
    clock: Callable[[], str] = _now_iso,
) -> EvalFixture:
    """Freeze what a finished run handed its writer.

    The request and selection are passed in rather than read here, so the one
    place that knows how to reconstruct them from storage stays
    `intake_v4.writing_request` and this cannot drift into a second, subtly
    different reading of the same rows.
    """
    return EvalFixture(
        fixture_id=fixture_id,
        label=label,
        notes=notes,
        captured_from_run=run_id,
        captured_at=clock(),
        request=request,
        selection=selection.as_record(),
    )


def coverage_report(fixtures: Sequence[EvalFixture]) -> dict[str, Any]:
    """Which forms and which hard cases this set actually contains.

    A comparison is only as general as its fixtures, and the failure mode is
    quiet: six restaurant guides look like a healthy set and answer one
    question six times. This names what is missing so the gap is visible before
    a candidate is judged on it.
    """
    forms = sorted({fixture.form_id for fixture in fixtures})
    present: set[str] = set()
    for fixture in fixtures:
        present.update(fixture.traits)
    missing = [
        trait for trait in FixtureTrait.__args__ if trait not in present  # type: ignore[attr-defined]
    ]
    return {
        "fixtures": len(fixtures),
        "forms": forms,
        "traits_present": sorted(present),
        "traits_missing": missing,
        # Not a pass mark. One fixture per form and every trait covered is the
        # floor for the result meaning anything beyond those fixtures; it is
        # never evidence that the candidate is good.
        "covers_every_trait": not missing,
    }


# ---------------------------------------------------------------------------
# What is being compared
# ---------------------------------------------------------------------------


class EvalVariant(BaseModel):
    """One candidate: a route, a temperature band, and the code that ran it."""

    schema_version: Literal[1] = EVAL_SCHEMA_VERSION
    variant_id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    notes: str = ""
    model_routing: Prompt2BlogModelRouting = Field(
        default_factory=Prompt2BlogModelRouting
    )
    # Left unset to keep the fixture's own level. Set it only when the level is
    # the thing under test, because changing two things at once makes the
    # result unattributable.
    creativity_level: str | None = None

    def apply(self, request: Prompt2BlogV4Request) -> Prompt2BlogV4Request:
        """This variant's version of a fixture's request.

        A copy. The fixture on disk is the control and is never edited, which
        is the only reason two samples can be said to share inputs.
        """
        profiles = request.profiles
        if self.creativity_level:
            profiles = Prompt2BlogWritingProfiles(
                length_id=request.profiles.length_id,
                creativity_level=self.creativity_level,  # type: ignore[arg-type]
            )
        return request.model_copy(
            update={
                "model_routing": self.model_routing,
                "profiles": profiles,
            }
        )


class SampleMeasurements(BaseModel):
    """What the run cost, as opposed to what a reader thought of it."""

    duration_seconds: float | None = None
    calls: int | None = None
    total_tokens: int | None = None
    billed_cost_usd: float | None = None
    word_count: int | None = None
    # Present and non-empty means the pipeline itself said the article was not
    # ready. A reader scoring prose should not have to rediscover that.
    readiness_blockers: list[str] = Field(default_factory=list)
    repair_outcome: str = ""


class EvalSample(BaseModel):
    """One draft, and everything measurable about producing it."""

    schema_version: Literal[1] = EVAL_SCHEMA_VERSION
    sample_id: str = Field(min_length=1)
    fixture_id: str = Field(min_length=1)
    variant_id: str = Field(min_length=1)
    # The run row this draft was written under. Real, so every stage row,
    # prompt and receipt is inspectable the ordinary way.
    run_id: str = Field(min_length=1)
    # The revision of this repository that wrote it. The prompts are in the
    # tree, so this is what makes a sample reproducible; a sample captured on a
    # dirty tree records that too, because it is not reproducible.
    code_revision: str = ""
    code_dirty: bool = False
    started_at: str = Field(min_length=1)
    finished_at: str = ""
    status: Literal["completed", "failed"] = "completed"
    error: str = ""
    title: str = ""
    markdown: str = ""
    measurements: SampleMeasurements = Field(default_factory=SampleMeasurements)


class SampleExecutor(Protocol):
    """Runs one fixture through the real pipeline and returns its artifact.

    A protocol rather than a direct call so the module around it can be tested
    without spending money. The real one is `pipeline_executor` below.
    """

    def __call__(
        self,
        *,
        run_id: str,
        request: Prompt2BlogV4Request,
        selection: Selection,
    ) -> dict[str, Any]: ...


def _word_count(markdown: str) -> int | None:
    return len(markdown.split()) or None


def sample_from_artifact(
    artifact: dict[str, Any],
    *,
    sample_id: str,
    fixture_id: str,
    variant_id: str,
    run_id: str,
    started_at: str,
    finished_at: str,
    duration_seconds: float,
    code_revision: str = "",
    code_dirty: bool = False,
) -> EvalSample:
    """Read one `pipeline_v3` artifact into a sample.

    Everything here is copied, never recomputed. The cost of an article is
    whatever its own receipt says it was; a second calculation from token
    counts would be a different number that looks like the same one.
    """
    article = artifact.get("improved_article") or {}
    markdown = artifact.get("final_markdown") or ""
    cost = artifact.get("run_cost") or {}
    return EvalSample(
        sample_id=sample_id,
        fixture_id=fixture_id,
        variant_id=variant_id,
        run_id=run_id,
        code_revision=code_revision,
        code_dirty=code_dirty,
        started_at=started_at,
        finished_at=finished_at,
        status="completed",
        title=article.get("title") or "",
        markdown=markdown,
        measurements=SampleMeasurements(
            duration_seconds=round(duration_seconds, 2),
            calls=cost.get("calls"),
            total_tokens=cost.get("total_tokens"),
            billed_cost_usd=cost.get("billed_cost_usd"),
            word_count=_word_count(markdown),
            readiness_blockers=list(artifact.get("readiness_blockers") or []),
            repair_outcome=str(artifact.get("repair_outcome") or ""),
        ),
    )


def failed_sample(
    error: str,
    *,
    sample_id: str,
    fixture_id: str,
    variant_id: str,
    run_id: str,
    started_at: str,
    finished_at: str,
    code_revision: str = "",
    code_dirty: bool = False,
) -> EvalSample:
    """A variant that could not produce a draft, recorded rather than dropped.

    A candidate that fails on one fixture and wins on the rest has not won. If
    failures vanished from the set, that is exactly what it would look like.
    """
    return EvalSample(
        sample_id=sample_id,
        fixture_id=fixture_id,
        variant_id=variant_id,
        run_id=run_id,
        code_revision=code_revision,
        code_dirty=code_dirty,
        started_at=started_at,
        finished_at=finished_at,
        status="failed",
        error=error,
    )


# ---------------------------------------------------------------------------
# Reading the drafts without knowing who wrote them
# ---------------------------------------------------------------------------

# The questions a reader is asked, one at a time. Kept apart on purpose: these
# trade against each other, and a single "which is better" hides the trade.
#
# `unsupported_additions` and `caveat_retention` are the two that protect the
# article's factual footing, and they are the ones a livelier draft tends to
# lose. If a candidate wins usefulness and voice while losing these, the answer
# is not that it won.
SCORE_CRITERIA: tuple[str, ...] = (
    "usefulness",
    "unsupported_additions",
    "caveat_retention",
    "voice",
    "repetition",
    "edit_effort",
)

CRITERION_QUESTIONS: dict[str, str] = {
    "usefulness": (
        "Could a reader act on this? Name the decision each section helped "
        "them make."
    ),
    "unsupported_additions": (
        "Does anything here assert more than the evidence does? Higher is "
        "cleaner."
    ),
    "caveat_retention": (
        "Are the limits and dates that change a reader's decision still "
        "present?"
    ),
    "voice": "Does this read as one Questurian piece, or as generated prose?",
    "repetition": (
        "Is anything explained twice, or listed where it should be judged? "
        "Higher is less repetitive."
    ),
    "edit_effort": (
        "How much work to publish this? Higher means less work."
    ),
}

SCORE_MIN = 1
SCORE_MAX = 5


class BlindEntry(BaseModel):
    """One draft as the reader sees it: a letter, and the prose."""

    display_label: str = Field(min_length=1)
    title: str = ""
    markdown: str = ""
    status: Literal["completed", "failed"] = "completed"
    error: str = ""


class BlindComparison(BaseModel):
    """The sheet a reader is given. Carries no variant identity at all.

    The mapping lives in `ComparisonKey`, written to a separate file. That is
    the whole mechanism: the file the reader opens cannot tell them which draft
    is the candidate, so it cannot be read carelessly and reveal it.
    """

    schema_version: Literal[1] = EVAL_SCHEMA_VERSION
    comparison_id: str = Field(min_length=1)
    created_at: str = Field(min_length=1)
    fixture_id: str = Field(min_length=1)
    fixture_label: str = ""
    form_id: str = ""
    # What the reader needs in order to judge the piece, and nothing more. The
    # brief is the measure the article is written against, so withholding it
    # would make the reading worse, not more blind.
    seed: str = ""
    reader_question: str = ""
    fails_if: str = ""
    criteria: list[str] = Field(default_factory=lambda: list(SCORE_CRITERIA))
    entries: list[BlindEntry] = Field(default_factory=list)


class ComparisonKey(BaseModel):
    """Which letter was which variant. Never shown beside the drafts."""

    schema_version: Literal[1] = EVAL_SCHEMA_VERSION
    comparison_id: str = Field(min_length=1)
    fixture_id: str = Field(min_length=1)
    # display label -> sample id
    mapping: dict[str, str] = Field(default_factory=dict)


LETTERS = "ABCDEFGH"


def blind_comparison(
    fixture: EvalFixture,
    samples: Sequence[EvalSample],
    *,
    comparison_id: str | None = None,
    rng: random.Random | None = None,
    clock: Callable[[], str] = _now_iso,
) -> tuple[BlindComparison, ComparisonKey]:
    """Shuffle the drafts behind letters and split off the answer.

    Shuffled, not ordered by variant, because a reader who learns that A is
    always the incumbent has stopped reading blind halfway through the second
    fixture.

    A failed sample still gets a letter. Hiding it would quietly turn the
    comparison into "the fixtures this candidate survived".
    """
    if len(samples) < 2:
        raise ValueError("a comparison needs at least two drafts to compare")
    if len(samples) > len(LETTERS):
        raise ValueError(f"at most {len(LETTERS)} drafts can be compared at once")
    if any(sample.fixture_id != fixture.fixture_id for sample in samples):
        raise ValueError("every draft in a comparison must come from one fixture")

    ordered = list(samples)
    (rng or random.Random()).shuffle(ordered)
    identifier = comparison_id or f"cmp-{uuid.uuid4().hex[:12]}"
    brief = fixture.request.brief
    sheet = BlindComparison(
        comparison_id=identifier,
        created_at=clock(),
        fixture_id=fixture.fixture_id,
        fixture_label=fixture.label,
        form_id=brief.form_id,
        seed=brief.seed,
        reader_question=brief.reader_question,
        fails_if=brief.fails_if,
        entries=[
            BlindEntry(
                display_label=LETTERS[index],
                title=sample.title,
                markdown=sample.markdown,
                status=sample.status,
                error=sample.error,
            )
            for index, sample in enumerate(ordered)
        ],
    )
    key = ComparisonKey(
        comparison_id=identifier,
        fixture_id=fixture.fixture_id,
        mapping={
            LETTERS[index]: sample.sample_id for index, sample in enumerate(ordered)
        },
    )
    return sheet, key


class CriterionScore(BaseModel):
    criterion: str = Field(min_length=1)
    value: int = Field(ge=SCORE_MIN, le=SCORE_MAX)
    note: str = ""


class EntryScore(BaseModel):
    display_label: str = Field(min_length=1)
    scores: list[CriterionScore] = Field(default_factory=list)
    # What the reader wanted to say about this draft that no number carries.
    # Never aggregated; it is read alongside the report, which is the point.
    note: str = ""

    @model_validator(mode="after")
    def validate_criteria(self) -> "EntryScore":
        seen = [score.criterion for score in self.scores]
        if len(seen) != len(set(seen)):
            raise ValueError("each criterion may be scored once per draft")
        unknown = sorted(set(seen) - set(SCORE_CRITERIA))
        if unknown:
            raise ValueError(f"unknown scoring criteria: {unknown}")
        return self


class ScoreSheet(BaseModel):
    """One reader's answers for one comparison."""

    schema_version: Literal[1] = EVAL_SCHEMA_VERSION
    comparison_id: str = Field(min_length=1)
    reviewer: str = Field(min_length=1)
    created_at: str = Field(min_length=1)
    entries: list[EntryScore] = Field(default_factory=list)
    note: str = ""


# ---------------------------------------------------------------------------
# The result, and what it is allowed to claim
# ---------------------------------------------------------------------------

# How many fixtures a candidate has to win a criterion on before the result is
# reported as a direction rather than as an observation. Three is not a
# statistical threshold and is not presented as one; it is the point at which
# "it happened once" stops being the obvious explanation.
DIRECTION_MIN_FIXTURES = 3


@dataclass(frozen=True)
class CriterionOutcome:
    criterion: str
    # variant_id -> mean score across the fixtures that scored it
    means: dict[str, float]
    fixtures_scored: int
    leader: str | None
    # True only when one variant leads on every fixture scored, and there were
    # enough of them. Anything else reads as "no direction", including a wide
    # average built out of one big win and two losses.
    consistent: bool

    @property
    def reportable_direction(self) -> bool:
        return self.consistent and self.fixtures_scored >= DIRECTION_MIN_FIXTURES


def unblind(
    sheets: Sequence[ScoreSheet],
    keys: Sequence[ComparisonKey],
    samples: Sequence[EvalSample],
) -> dict[str, Any]:
    """Put the letters back to variants and report each criterion on its own.

    No composite score is produced, here or anywhere downstream. The whole
    reason the criteria are separate is that a candidate can buy usefulness
    with unsupported additions, and a total would price that as a win.
    """
    key_by_comparison = {key.comparison_id: key for key in keys}
    sample_by_id = {sample.sample_id: sample for sample in samples}

    # criterion -> variant -> fixture -> value
    gathered: dict[str, dict[str, dict[str, list[int]]]] = {}
    fixtures_seen: set[str] = set()
    unresolved: list[str] = []

    for sheet in sheets:
        key = key_by_comparison.get(sheet.comparison_id)
        if key is None:
            unresolved.append(sheet.comparison_id)
            continue
        for entry in sheet.entries:
            sample_id = key.mapping.get(entry.display_label)
            sample = sample_by_id.get(sample_id or "")
            if sample is None:
                unresolved.append(f"{sheet.comparison_id}:{entry.display_label}")
                continue
            fixtures_seen.add(sample.fixture_id)
            for score in entry.scores:
                by_variant = gathered.setdefault(score.criterion, {})
                by_fixture = by_variant.setdefault(sample.variant_id, {})
                by_fixture.setdefault(sample.fixture_id, []).append(score.value)

    outcomes: list[CriterionOutcome] = []
    for criterion in SCORE_CRITERIA:
        by_variant = gathered.get(criterion)
        if not by_variant:
            continue
        per_fixture: dict[str, dict[str, float]] = {}
        means: dict[str, float] = {}
        for variant_id, fixture_values in by_variant.items():
            for fixture_id, values in fixture_values.items():
                per_fixture.setdefault(fixture_id, {})[variant_id] = sum(values) / len(
                    values
                )
            flattened = [
                value for values in fixture_values.values() for value in values
            ]
            means[variant_id] = round(sum(flattened) / len(flattened), 2)

        leader = max(means, key=lambda variant: means[variant]) if means else None
        # A lead every fixture agrees with. One fixture where the candidate
        # loses is enough to withdraw the claim, which is the behaviour the
        # report needs: a change that helps four articles and hurts one has
        # not been shown to be safe.
        scored_fixtures = [
            values for values in per_fixture.values() if len(values) > 1
        ]
        consistent = bool(scored_fixtures) and leader is not None and all(
            values.get(leader, float("-inf")) >= max(values.values())
            for values in scored_fixtures
        )
        outcomes.append(
            CriterionOutcome(
                criterion=criterion,
                means=means,
                fixtures_scored=len(per_fixture),
                leader=leader,
                consistent=consistent,
            )
        )

    return {
        "criteria": [
            {
                "criterion": outcome.criterion,
                "question": CRITERION_QUESTIONS[outcome.criterion],
                "means": outcome.means,
                "fixtures_scored": outcome.fixtures_scored,
                "leader": outcome.leader,
                "consistent": outcome.consistent,
                "reportable_direction": outcome.reportable_direction,
            }
            for outcome in outcomes
        ],
        "fixtures_scored": sorted(fixtures_seen),
        "measurements": measurement_summary(samples),
        # Named rather than silently skipped. A sheet whose key is missing is a
        # scoring session that has to be repeated, not a smaller sample.
        "unresolved": sorted(set(unresolved)),
        "verdict": _verdict(outcomes, len(fixtures_seen)),
    }


def _verdict(outcomes: Sequence[CriterionOutcome], fixture_count: int) -> dict[str, Any]:
    """What this comparison is entitled to say, in words.

    Refuses to name a winner when the evidence does not support one. The
    failure this exists to prevent is the ordinary one: a candidate wins two
    criteria on two fixtures and gets rolled out as an improvement.
    """
    if fixture_count < DIRECTION_MIN_FIXTURES:
        return {
            "decision": "not enough evidence",
            "reason": (
                f"{fixture_count} fixture(s) scored; at least "
                f"{DIRECTION_MIN_FIXTURES} are needed before a direction is "
                "reported."
            ),
        }
    directions = [outcome for outcome in outcomes if outcome.reportable_direction]
    if not directions:
        return {
            "decision": "no direction",
            "reason": (
                "No criterion had one variant ahead on every fixture scored."
            ),
        }
    guards = [
        outcome
        for outcome in directions
        if outcome.criterion in {"unsupported_additions", "caveat_retention"}
    ]
    leaders = {outcome.leader for outcome in directions}
    conflicted = len(leaders) > 1
    return {
        "decision": "direction found",
        "leaders": sorted(leader for leader in leaders if leader),
        "criteria_with_direction": [outcome.criterion for outcome in directions],
        "factual_footing_criteria": [outcome.criterion for outcome in guards],
        # Said out loud rather than left for a reader to notice. Different
        # winners on different criteria is the normal result and it is not a
        # tie to be broken by adding the scores up.
        "reason": (
            "Different variants lead different criteria; this is a trade, not "
            "a winner."
            if conflicted
            else "One variant leads every criterion that showed a direction."
        ),
    }


def measurement_summary(samples: Sequence[EvalSample]) -> dict[str, Any]:
    """Cost, tokens, latency and failures per variant. Measured, not judged."""
    by_variant: dict[str, list[EvalSample]] = {}
    for sample in samples:
        by_variant.setdefault(sample.variant_id, []).append(sample)

    summary: dict[str, Any] = {}
    for variant_id, variant_samples in sorted(by_variant.items()):
        completed = [s for s in variant_samples if s.status == "completed"]

        def mean(pick: Callable[[EvalSample], float | int | None]) -> float | None:
            values = [
                float(value)
                for value in (pick(sample) for sample in completed)
                if value is not None
            ]
            return round(sum(values) / len(values), 4) if values else None

        summary[variant_id] = {
            "samples": len(variant_samples),
            "completed": len(completed),
            "failed": len(variant_samples) - len(completed),
            "mean_billed_cost_usd": mean(lambda s: s.measurements.billed_cost_usd),
            "mean_total_tokens": mean(lambda s: s.measurements.total_tokens),
            "mean_duration_seconds": mean(lambda s: s.measurements.duration_seconds),
            "mean_word_count": mean(lambda s: s.measurements.word_count),
            # Counted, not averaged. A draft the pipeline itself calls unready
            # is a different kind of fact from a slow one.
            "samples_with_readiness_blockers": sum(
                1 for s in completed if s.measurements.readiness_blockers
            ),
        }
    return summary


# ---------------------------------------------------------------------------
# Producing a draft, which is the part that costs money
# ---------------------------------------------------------------------------

# The prefix every evaluation run id carries. Evaluation runs land in the same
# database as real ones -- that is what makes their stage rows, prompts and
# receipts inspectable with the tools that already exist -- so they have to be
# recognisable at a glance and filterable out of an operator's article list.
EVAL_RUN_PREFIX = "eval-"


def is_eval_run(run_id: str) -> bool:
    return run_id.startswith(EVAL_RUN_PREFIX)


def pipeline_executor(
    *,
    run_id: str,
    request: Prompt2BlogV4Request,
    selection: Selection,
) -> dict[str, Any]:
    """Run the real v3 writing graph and hand back its artifact.

    Deliberately the same entrypoint an operator's run uses, with the same
    packet build and the same recorder. An evaluation that ran a special path
    would measure the special path.

    Imported here rather than at module scope: the orchestrator pulls in the
    stages, and the stages are what a test of this module wants to avoid
    loading at all.
    """
    from .intake_v3 import prepare_v3_runtime_request
    from .orchestrator_v3 import run_pipeline_v3
    from .run_recorder import RunRecorder

    runtime = prepare_v3_runtime_request(request, selection)
    RunRecorder().queue(run_id)
    run_pipeline_v3(run_id, runtime)

    from app.core import read_stage_result

    stored = read_stage_result(run_id, "pipeline_v3") or {}
    artifact = stored.get("data") if isinstance(stored, dict) else None
    if not isinstance(artifact, dict) or not artifact:
        raise RuntimeError(
            f"Run {run_id} finished without writing a pipeline_v3 artifact"
        )
    return artifact


def code_revision() -> tuple[str, bool]:
    """The commit these drafts were written by, and whether the tree was dirty.

    A dirty tree is recorded rather than refused. Trying a change before
    committing it is the ordinary way to use this; what must not happen is a
    sample that claims to be reproducible from a commit that never contained
    the change.
    """
    import subprocess

    def git(*args: str) -> str:
        return subprocess.run(
            ["git", *args],
            cwd=Path(__file__).resolve().parent,
            capture_output=True,
            text=True,
            check=False,
        ).stdout.strip()

    revision = git("rev-parse", "HEAD")
    dirty = bool(git("status", "--porcelain"))
    return revision, dirty


def run_sample(
    fixture: EvalFixture,
    variant: EvalVariant,
    *,
    executor: SampleExecutor = pipeline_executor,
    clock: Callable[[], str] = _now_iso,
    timer: Callable[[], float] | None = None,
    run_id: str | None = None,
    revision: tuple[str, bool] | None = None,
) -> EvalSample:
    """Write one draft from a frozen fixture under one variant.

    This is the only function in the module that spends anything, and it spends
    a full article's worth every time it is called. Callers are expected to
    have said so out loud.

    A failure is caught and recorded as a failed sample rather than raised. One
    fixture the candidate cannot survive is a result about the candidate, and
    losing the whole comparison to it would throw away the drafts already
    bought.
    """
    import time

    now = timer or time.monotonic
    head, dirty = revision if revision is not None else code_revision()
    sample_id = f"{fixture.fixture_id}.{variant.variant_id}.{uuid.uuid4().hex[:8]}"
    identifier = run_id or f"{EVAL_RUN_PREFIX}{uuid.uuid4().hex[:12]}"
    started_at = clock()
    began = now()

    try:
        artifact = executor(
            run_id=identifier,
            request=variant.apply(fixture.request),
            selection=fixture.selection_record,
        )
    except Exception as exc:  # noqa: BLE001 - recorded, not swallowed
        return failed_sample(
            f"{type(exc).__name__}: {exc}",
            sample_id=sample_id,
            fixture_id=fixture.fixture_id,
            variant_id=variant.variant_id,
            run_id=identifier,
            started_at=started_at,
            finished_at=clock(),
            code_revision=head,
            code_dirty=dirty,
        )

    return sample_from_artifact(
        artifact,
        sample_id=sample_id,
        fixture_id=fixture.fixture_id,
        variant_id=variant.variant_id,
        run_id=identifier,
        started_at=started_at,
        finished_at=clock(),
        duration_seconds=now() - began,
        code_revision=head,
        code_dirty=dirty,
    )


# ---------------------------------------------------------------------------
# Where it all lives
# ---------------------------------------------------------------------------


class EvalStore:
    """Plain JSON files under one directory.

    A directory rather than the pipeline database on purpose. Fixtures are
    inputs to a decision and want to be diffable, reviewable and committable;
    the database is where runs go, and runs are exactly what a fixture must
    survive being deleted.
    """

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def _dir(self, name: str) -> Path:
        path = self.root / name
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _write(self, path: Path, model: BaseModel) -> Path:
        path.write_text(
            json.dumps(model.model_dump(mode="json"), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        return path

    def _read_all(self, name: str, model: type[BaseModel]) -> list[Any]:
        return [
            model.model_validate_json(path.read_text(encoding="utf-8"))
            for path in sorted(self._dir(name).glob("*.json"))
        ]

    # Fixtures -------------------------------------------------------------
    def save_fixture(self, fixture: EvalFixture) -> Path:
        return self._write(
            self._dir("fixtures") / f"{fixture.fixture_id}.json", fixture
        )

    def fixtures(self) -> list[EvalFixture]:
        return self._read_all("fixtures", EvalFixture)

    def fixture(self, fixture_id: str) -> EvalFixture:
        path = self._dir("fixtures") / f"{fixture_id}.json"
        if not path.exists():
            raise FileNotFoundError(f"No evaluation fixture '{fixture_id}'")
        return EvalFixture.model_validate_json(path.read_text(encoding="utf-8"))

    # Variants -------------------------------------------------------------
    def save_variant(self, variant: EvalVariant) -> Path:
        return self._write(
            self._dir("variants") / f"{variant.variant_id}.json", variant
        )

    def variants(self) -> list[EvalVariant]:
        return self._read_all("variants", EvalVariant)

    def variant(self, variant_id: str) -> EvalVariant:
        path = self._dir("variants") / f"{variant_id}.json"
        if not path.exists():
            raise FileNotFoundError(f"No evaluation variant '{variant_id}'")
        return EvalVariant.model_validate_json(path.read_text(encoding="utf-8"))

    # Samples --------------------------------------------------------------
    def save_sample(self, sample: EvalSample) -> Path:
        return self._write(self._dir("samples") / f"{sample.sample_id}.json", sample)

    def samples(self) -> list[EvalSample]:
        return self._read_all("samples", EvalSample)

    # Comparisons ----------------------------------------------------------
    def save_comparison(
        self, sheet: BlindComparison, key: ComparisonKey
    ) -> tuple[Path, Path]:
        """The sheet and its answer, in two files.

        Two files because the reader opens one directory. A single file with a
        `key` field inside it is blind only until somebody scrolls.

        Both are committed, so this blinds a careless reading rather than a
        determined one -- somebody who wants to know which draft is the
        candidate can go and read the key. That is the right trade for a
        one-person workflow: the guard is against learning it by accident
        while reading the drafts, which is how blinding actually fails here.
        """
        sheet_path = self._write(
            self._dir("comparisons") / f"{sheet.comparison_id}.json", sheet
        )
        key_path = self._write(
            self._dir("keys") / f"{key.comparison_id}.json", key
        )
        return sheet_path, key_path

    def comparisons(self) -> list[BlindComparison]:
        return self._read_all("comparisons", BlindComparison)

    def comparison(self, comparison_id: str) -> BlindComparison:
        path = self._dir("comparisons") / f"{comparison_id}.json"
        if not path.exists():
            raise FileNotFoundError(f"No comparison '{comparison_id}'")
        return BlindComparison.model_validate_json(path.read_text(encoding="utf-8"))

    def keys(self) -> list[ComparisonKey]:
        return self._read_all("keys", ComparisonKey)

    # Scores ---------------------------------------------------------------
    def save_score_sheet(self, sheet: ScoreSheet) -> Path:
        return self._write(
            self._dir("scores") / f"{sheet.comparison_id}.{sheet.reviewer}.json", sheet
        )

    def score_sheets(self) -> list[ScoreSheet]:
        return self._read_all("scores", ScoreSheet)

    def report(self) -> dict[str, Any]:
        return unblind(self.score_sheets(), self.keys(), self.samples())
