"""Strict version-four editorial contracts for Prompt2Blog.

Two objects replace the v3 commission, because it was doing two jobs. The
**Article Brief** is the vision: what this piece is for, who reads it, what it
must name, and what failure looks like. It is written by the grill with a
person, it is never consumed, and the finished article is judged against it.
The **work order** is its translation into separately checkable research
questions, and it persists only until research answers them.

The evidence model is unchanged from v3. It was the best thing in the pipeline
and the redesign was never about it.

There is no v3 compatibility. Stored v3 runs do not load, which is deliberate
(ADR 0031).
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


ArticleFormId = Literal[
    "news-report",
    "analysis",
    "explainer",
    "feature-profile",
    "interview-qa",
    "opinion-column",
    "personal-essay-travelogue",
    "destination-guide",
    "service-guide",
    "itinerary",
    "curated-list-best-of",
    "comparison",
    "review",
    "how-to-checklist",
    "cost-budget-breakdown",
]
TopicModuleId = Literal[
    "cost-affordability",
    "accommodation-neighborhoods",
    "food-drink",
    "transportation",
    "safety",
    "visa-entry",
    "seasonality-weather",
    "adventure-outdoors",
    "long-stay-remote-work",
    "culture-etiquette",
]
AudienceTagId = Literal[
    "first-time-visitor",
    "solo-traveler",
    "family",
    "remote-worker-relocator",
    "accessibility-needs",
    "budget-focused",
    "premium-focused",
]
ScopeMode = Literal["single_subject", "head_to_head", "ranked_set"]
ReferenceRole = Literal["primary_subject", "context_only", "comparator"]
EvidenceSourceType = Literal[
    "official", "reporting", "specialist", "firsthand", "other"
]
EvidenceMaterialType = Literal[
    "web",
    "report",
    "transcript",
    "interview-responses",
    "first-person-notes",
    "evaluation-notes",
    "other",
]
EvidenceConfidence = Literal["high", "medium", "low"]
# `unpublished` is the exit a research desk previously did not have. A question
# nobody has ever published an answer to — Lima's customs processing minutes, for
# either terminal — could only be reported as `partial`, which blocked the run and
# sent the operator back to ask again for a fact that does not exist. It is a
# finding, not a failure: the article omits the number without narrating the gap.
EvidenceRequirementStatus = Literal["supported", "partial", "missing", "unpublished"]
# What research found when it went to check what the direction step assumed.
#
# `refuted` is the verdict that had nowhere to live. A question about a ranking
# that has not been published yet is not unpublished — the ranking's prices and
# dishes are published in abundance — it is a question about something that does
# not exist. Conflating the two sent an operator looking for a fact instead of
# a different direction.
PremiseVerdict = Literal["confirmed", "refuted", "unverified"]
CreativityLevel = Literal["low", "medium", "high"]
# What a requirement costs when research cannot answer it. Load-bearing means
# the piece cannot be written without it; texture means the piece is duller.
RequirementKind = Literal["load_bearing", "texture"]
# Where the operator's material came from. `firsthand` bypasses fact-checking
# by design -- nobody can verify someone's lunch -- which is exactly why its
# statement is stored as the operator typed it and never as a model's
# paraphrase. A reworded first-hand claim is unverifiable and uncatchable.
MaterialKind = Literal["firsthand", "interview", "research"]


def _require_unique(values: list[str], label: str) -> None:
    if len(set(values)) != len(values):
        raise ValueError(f"{label} values must be unique")


class V4ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class BriefReader(V4ContractModel):
    primary_reader: str = Field(min_length=1)
    tags: list[AudienceTagId] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_tags(self) -> "BriefReader":
        _require_unique(self.tags, "audience tag")
        return self


class WorkOrderReference(V4ContractModel):
    name: str = Field(min_length=1)
    role: ReferenceRole


class WorkOrderScope(V4ContractModel):
    mode: ScopeMode
    references: list[WorkOrderReference] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_roles_for_mode(self) -> "WorkOrderScope":
        _require_unique(
            [reference.name.casefold() for reference in self.references],
            "reference name",
        )
        primary_count = sum(
            reference.role == "primary_subject" for reference in self.references
        )
        if primary_count != 1:
            raise ValueError("scope must contain exactly one primary_subject")

        comparator_count = sum(
            reference.role == "comparator" for reference in self.references
        )
        if self.mode == "single_subject" and comparator_count:
            raise ValueError("single_subject scope cannot contain comparators")
        if self.mode == "head_to_head" and comparator_count < 1:
            raise ValueError("head_to_head scope requires a comparator")
        if self.mode == "ranked_set" and comparator_count < 2:
            raise ValueError("ranked_set scope requires at least two comparators")
        return self


class WorkOrderAssumption(V4ContractModel):
    """One thing the direction step took as true without being able to check it.

    The direction model is forbidden to browse, so every fact it builds on is
    unverified by construction. Declaring them is what lets a later step refute
    one instead of discovering the refutation five unanswerable questions in.
    """

    assumption_id: str = Field(min_length=1)
    statement: str = Field(min_length=1)


class WorkOrderRequirement(V4ContractModel):
    """One separately checkable question, and what it costs to miss.

    `kind` is new in v4. A missing texture answer costs a flourish; a missing
    load-bearing one costs the piece. v3 could not tell them apart and blocked
    on both equally, which is how a run died over a scene it could have cut.
    """

    requirement_id: str = Field(min_length=1)
    question: str = Field(min_length=1)
    kind: RequirementKind
    # Empty when the question stands on its own. Every id here must name a
    # premise the same commission declares.
    assumption_ids: list[str] = Field(default_factory=list)


GrillStatus = Literal["asking", "agreed"]


class GrillQuestion(V4ContractModel):
    """One question, and the operator's answer to it, written in advance.

    Every question carries a recommendation because nobody should face a blank
    (ADR 0030, G1). The people using this write about places they may never
    have been; correcting a proposal is easy where composing one is not.

    `recommendation` is not advice about the answer -- it is the answer, in
    the operator's own voice. The screen loads it into their answer box and
    one click sends it unedited, so a recommendation addressed to them ("I'm
    guessing you spent time there") is recorded as the operator saying it
    about themselves, and can reach the brief as verbatim first-hand material.

    `pushback` is set when the answer being questioned contradicts the seed or
    an earlier answer. The grill says so and makes the operator resolve it
    rather than collecting the contradiction and writing around it.
    """

    question_id: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    ask: str = Field(min_length=1)
    recommendation: str = Field(min_length=1)
    pushback: str = ""
    # Which of `BRIEF_MARKERS` this question exists to settle. Declared by the
    # grill so that answering it can count as progress in code, rather than
    # progress being an opinion the grill is free to withhold -- which is how
    # run a9959013 (2026-08-30 19:29Z) asked the same failure question four
    # times and never moved.
    asks_about: str = ""


class GrillTurn(V4ContractModel):
    """A question and what the operator actually typed.

    The answer is stored verbatim. It is the source of `BriefMaterial` for
    anything first-hand, and a paraphrase there would be an unverifiable claim
    nothing downstream can catch.
    """

    question: GrillQuestion
    answer: str = Field(min_length=1)

    @property
    def accepted_as_drafted(self) -> bool:
        """Did they send the grill's own draft back untouched?

        The screen pre-fills the answer box with `recommendation` and one click
        sends it, so this is the most common way to answer -- and the grill has
        to be told, because otherwise it reads its own sentence coming back as
        a confident answer from a writer and concludes it learned something
        (ADR 0033). Accepting is agreement; it is not new information.
        """
        return self.answer.strip() == self.question.recommendation.strip()


# The six things a brief cannot be assembled without, and the stop condition
# for the grill (ADR 0033). One definition with two readers: the grill asks
# until every marker is covered, and the brief refuses to assemble without the
# field each one maps to. Kept together so the two cannot drift -- a grill that
# stops one marker short of what the brief demands is a run that dies at the
# handoff having already paid for the interview.
BRIEF_MARKERS: tuple[tuple[str, str, str], ...] = (
    ("form", "form_id", "the kind of article"),
    ("reader", "primary_reader", "who it is for"),
    ("reader_question", "reader_question", "the question it answers for them"),
    ("outcome", "outcome", "what it should make them do or decide"),
    ("spine", "spine", "what the piece is built on"),
    ("fails_if", "fails_if", "what would make it a failure"),
)

MARKER_KEYS: tuple[str, ...] = tuple(marker for marker, _, _ in BRIEF_MARKERS)


class GrillState(V4ContractModel):
    """Everything the grill knows, recorded on the run from the first keystroke.

    Persisted per turn rather than held in a browser, so an abandoned grill is
    resumable and its tokens reach the receipt (ADR 0031).
    """

    schema_version: Literal[4] = 4
    run_id: str = Field(min_length=1)
    seed: str = Field(min_length=1)
    # What the grill looked up before asking anything. This is what keeps the
    # grill short -- not a question limit (G2).
    research_digest: str = ""
    research_source_urls: list[str] = Field(default_factory=list)
    location: str = ""
    turns: list[GrillTurn] = Field(default_factory=list)
    status: GrillStatus = "asking"
    pending: GrillQuestion | None = None
    # The played-back summary the operator approves or corrects. Agreement on
    # this is necessary and no longer sufficient: the markers below have to be
    # covered too, because agreement was being judged by a grill that could not
    # tell the operator's words from its own (ADR 0033).
    consensus: str = ""
    # Which of `BRIEF_MARKERS` the grill says it has. Recorded per turn so a
    # grill that stalls shows what it is still missing, rather than looking
    # like it is asking at random.
    markers_covered: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_grill_state(self) -> "GrillState":
        _require_unique(
            [turn.question.question_id for turn in self.turns], "question_id"
        )
        if self.status == "asking" and self.pending is None:
            raise ValueError("a grill that is still asking must have a pending question")
        if self.status == "agreed":
            if self.pending is not None:
                raise ValueError("an agreed grill cannot still be asking something")
            if not self.consensus:
                raise ValueError("an agreed grill must have played back what it agreed")
            missing = [key for key in MARKER_KEYS if key not in self.markers_covered]
            if missing:
                # The code refuses to agree without these, so the contract says
                # so too. A schema that permits what the code refuses is a
                # schema that was not written down properly.
                raise ValueError(
                    "an agreed grill must cover every brief marker; missing: "
                    + ", ".join(missing)
                )
        return self


class BriefMaterial(V4ContractModel):
    """Something the operator has, labelled by where it came from.

    A first-hand statement is stored verbatim. The grill asks what someone
    *has*, never what they are qualified in, and whatever they answer arrives
    here in their own words so the brief they approve shows exactly what the
    system thinks they said.
    """

    kind: MaterialKind
    statement: str = Field(min_length=1)
    note: str = ""


class ArticleBrief(V4ContractModel):
    """The vision for one article. Never consumed.

    Written by the grill and approved by a person. It rides the whole run and
    the finished article is judged against it, including against `fails_if`,
    which is the measure the system has never had: every score v3 owned said
    the Lima article passed.

    `seed` is provenance, not instruction. In v3 the typed title was locked on
    entry and handed to five stages as a promise nobody examined.
    """

    schema_version: Literal[4] = 4
    brief_fingerprint: str = Field(min_length=1)
    seed: str = Field(min_length=1)
    location: str = Field(min_length=1)
    form_id: ArticleFormId
    topic_module_ids: list[TopicModuleId] = Field(default_factory=list, max_length=4)
    reader: BriefReader
    reader_question: str = Field(min_length=1)
    outcome: str = Field(min_length=1)
    spine: str = Field(min_length=1)
    must_name: list[str] = Field(default_factory=list)
    material: list[BriefMaterial] = Field(default_factory=list)
    fails_if: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_brief(self) -> "ArticleBrief":
        _require_unique(self.topic_module_ids, "topic module")
        _require_unique([item.casefold() for item in self.must_name], "must_name entry")
        return self


class Prompt2BlogWorkOrder(V4ContractModel):
    """The brief translated into separately checkable questions.

    Turning "the market food beats the famous restaurants" into three
    researchable questions is a real skill and no operator should be doing it,
    so this stays with the machine. It answers to exactly one brief and it
    stops mattering the moment research answers it.

    There is no `exclusions` field. A negative instruction is a topic waiting
    to happen: "do not claim a transformation" became a section called *Scope
    limits*. The brief's spine and must_name replace it.
    """

    schema_version: Literal[4] = 4
    work_order_fingerprint: str = Field(min_length=1)
    brief_fingerprint: str = Field(min_length=1)
    primary_subject: str = Field(min_length=1)
    scope: WorkOrderScope
    premise: list[WorkOrderAssumption] = Field(default_factory=list)
    requirements: list[WorkOrderRequirement] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_work_order(self) -> "Prompt2BlogWorkOrder":
        primary_reference = next(
            reference
            for reference in self.scope.references
            if reference.role == "primary_subject"
        )
        if primary_reference.name.casefold() != self.primary_subject.casefold():
            raise ValueError("primary_subject must match the primary reference")
        _require_unique(
            [item.requirement_id for item in self.requirements],
            "requirement_id",
        )
        _require_unique(
            [item.assumption_id for item in self.premise],
            "assumption_id",
        )
        declared = {item.assumption_id for item in self.premise}
        for requirement in self.requirements:
            unknown = sorted(set(requirement.assumption_ids) - declared)
            if unknown:
                raise ValueError(
                    f"requirement {requirement.requirement_id} depends on "
                    f"undeclared assumptions: {', '.join(unknown)}"
                )
        if not any(item.kind == "load_bearing" for item in self.requirements):
            raise ValueError(
                "a work order needs at least one load-bearing requirement"
            )
        return self


class EvidenceSource(V4ContractModel):
    source_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    publisher: str | None = None
    url: HttpUrl | None = None
    published_at: date | None = None
    retrieved_at: date
    source_type: EvidenceSourceType
    material_type: EvidenceMaterialType
    notes: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_external_metadata(self) -> "EvidenceSource":
        if self.material_type in {"web", "report"} and (
            not self.publisher or not self.url
        ):
            raise ValueError("web and report sources require publisher and url")
        return self


class EvidenceClaim(V4ContractModel):
    claim_id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    source_ids: list[str] = Field(min_length=1)
    requirement_ids: list[str] = Field(min_length=1)
    as_of: date | None = None
    confidence: EvidenceConfidence
    # The place this claim would send a reader: a tour, a restaurant, a bar, a
    # museum. Set only when the claim names somewhere bookable or visitable,
    # so the operator can be shown a short list rather than every fact.
    #
    # Research can confirm a site resolves and a price is published. It cannot
    # see that the last post was 2024 and the checkout is janky. Moravia Tours
    # came back correct in every word and was a business winding down, which is
    # not a fact on a page but the absence of recent activity. That judgment
    # needs a person, and this field is how they are given the short list.
    venue: str = ""
    # What the operator said about it after looking. Reaches the writer.
    venue_note: str = ""

    @model_validator(mode="after")
    def validate_unique_links(self) -> "EvidenceClaim":
        _require_unique(self.source_ids, "claim source reference")
        _require_unique(self.requirement_ids, "claim requirement reference")
        return self


class EvidenceRequirement(V4ContractModel):
    requirement_id: str = Field(min_length=1)
    status: EvidenceRequirementStatus
    claim_ids: list[str] = Field(default_factory=list)
    gap: str = ""

    @model_validator(mode="after")
    def validate_status_details(self) -> "EvidenceRequirement":
        _require_unique(self.claim_ids, "requirement claim reference")
        if self.status == "supported" and not self.claim_ids:
            raise ValueError("supported requirements must reference at least one claim")
        if self.status == "supported" and self.gap:
            raise ValueError("supported requirements cannot describe a gap")
        if self.status in {"partial", "missing", "unpublished"} and not self.gap:
            raise ValueError(
                "partial, missing, and unpublished requirements must describe the gap"
            )
        if self.status == "missing" and self.claim_ids:
            raise ValueError("missing requirements cannot reference claims")
        # `unpublished` keeps claims on purpose: "OSITRAN's December 2025 report
        # measures immigration and baggage and no other step" is a real claim with
        # a real source, and it is what makes the absence reportable rather than
        # merely asserted.
        return self


class EvidencePremiseFinding(V4ContractModel):
    """One verdict on one thing the direction step assumed without checking."""

    assumption_id: str = Field(min_length=1)
    verdict: PremiseVerdict
    basis: str = Field(min_length=1)
    # Claims are wanted on every verdict, and they are what separates an
    # established refutation from a desk that simply failed to find the thing:
    # "the organizers' own news page schedules the reveal for 1 December 2026"
    # is a source, not an opinion.
    claim_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_claim_links(self) -> "EvidencePremiseFinding":
        _require_unique(self.claim_ids, "premise finding claim reference")
        return self


class EvidenceConflict(V4ContractModel):
    conflict_id: str = Field(min_length=1)
    claim_ids: list[str] = Field(min_length=2)
    summary: str = Field(min_length=1)
    resolution: str | None = None


class EvidenceGap(V4ContractModel):
    gap_id: str = Field(min_length=1)
    requirement_ids: list[str] = Field(min_length=1)
    summary: str = Field(min_length=1)


class EvidencePackage(V4ContractModel):
    schema_version: Literal[4] = 4
    work_order_fingerprint: str = Field(min_length=1)
    sources: list[EvidenceSource] = Field(default_factory=list)
    claims: list[EvidenceClaim] = Field(default_factory=list)
    requirements: list[EvidenceRequirement] = Field(min_length=1)
    premise_findings: list[EvidencePremiseFinding] = Field(default_factory=list)
    conflicts: list[EvidenceConflict] = Field(default_factory=list)
    gaps: list[EvidenceGap] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_evidence_links(self) -> "EvidencePackage":
        source_ids = [source.source_id for source in self.sources]
        claim_ids = [claim.claim_id for claim in self.claims]
        requirement_ids = [item.requirement_id for item in self.requirements]
        conflict_ids = [item.conflict_id for item in self.conflicts]
        gap_ids = [item.gap_id for item in self.gaps]
        premise_ids = [item.assumption_id for item in self.premise_findings]
        for values, label in (
            (source_ids, "source_id"),
            (claim_ids, "claim_id"),
            (requirement_ids, "requirement_id"),
            (conflict_ids, "conflict_id"),
            (gap_ids, "gap_id"),
            (premise_ids, "premise finding assumption_id"),
        ):
            _require_unique(values, label)

        known_sources = set(source_ids)
        known_claims = set(claim_ids)
        known_requirements = set(requirement_ids)
        for claim in self.claims:
            if not set(claim.source_ids) <= known_sources:
                raise ValueError(f"claim {claim.claim_id} references an unknown source")
            if not set(claim.requirement_ids) <= known_requirements:
                raise ValueError(
                    f"claim {claim.claim_id} references an unknown requirement"
                )
        for requirement in self.requirements:
            if not set(requirement.claim_ids) <= known_claims:
                raise ValueError(
                    f"requirement {requirement.requirement_id} references an unknown claim"
                )
        for finding in self.premise_findings:
            if not set(finding.claim_ids) <= known_claims:
                raise ValueError(
                    f"premise finding {finding.assumption_id} references an unknown claim"
                )
        requirement_claims = {
            requirement.requirement_id: set(requirement.claim_ids)
            for requirement in self.requirements
        }
        claim_requirements = {
            claim.claim_id: set(claim.requirement_ids) for claim in self.claims
        }
        mapped_from_claims = {
            requirement_id: {
                claim_id
                for claim_id, linked_requirements in claim_requirements.items()
                if requirement_id in linked_requirements
            }
            for requirement_id in known_requirements
        }
        if requirement_claims != mapped_from_claims:
            raise ValueError(
                "claim and requirement mappings must agree in both directions"
            )
        for conflict in self.conflicts:
            _require_unique(conflict.claim_ids, "conflict claim reference")
            if not set(conflict.claim_ids) <= known_claims:
                raise ValueError("conflict references an unknown claim")
        for gap in self.gaps:
            _require_unique(gap.requirement_ids, "gap requirement reference")
            if not set(gap.requirement_ids) <= known_requirements:
                raise ValueError("gap references an unknown requirement")
        return self


class Prompt2BlogWritingProfiles(V4ContractModel):
    """What is still selectable about the writing.

    `tone_id` and `brand_voice_id` are gone. Questurian has one voice, sent
    with one set of writing conventions, and neither is a choice (ADR 0032).
    Per-article variation comes from the brief, which knows who is reading and
    what the piece is for.
    """

    length_id: str = Field(min_length=1)
    creativity_level: CreativityLevel = "medium"


class Prompt2BlogModelRouting(V4ContractModel):
    """Which model answers for each role a v3 run actually calls.

    Outline, groundedness and title used to be pinned in ``config.py`` and
    unreachable from a request, so a route could only move the writer and the
    judge -- two of the six calls a run makes. They are declared per route now,
    and they are still separate fields rather than "same as the writer": the
    reason they were pinned was to stop a premium prose model silently
    promoting every small call to the same tier, and a route that has to name
    them cannot do that by accident.

    All optional. A request that omits one gets the ``P2B_V3_*_MODEL`` default,
    so an older client keeps the routing it has always had.
    """

    model_name: str | None = None
    writing_model: str | None = None
    repair_model: str | None = None
    audit_model: str | None = None
    outline_model: str | None = None
    groundedness_model: str | None = None
    model_stack_id: str | None = None


class Prompt2BlogV4Request(V4ContractModel):
    """One run's inputs.

    The brief and the work order are separate objects with their own
    fingerprints, and the binding between them is checked here rather than
    trusted: a work order must answer the brief it was derived from, and
    evidence must answer the work order it was researched for. In v3 one
    fingerprint carried both jobs, so there was nothing to check.
    """

    schema_version: Literal[4] = 4
    brief: ArticleBrief
    work_order: Prompt2BlogWorkOrder
    evidence_package: EvidencePackage
    profiles: Prompt2BlogWritingProfiles
    model_routing: Prompt2BlogModelRouting = Field(
        default_factory=Prompt2BlogModelRouting
    )
    include_debug: bool = True
    enable_editorial_augmentation: bool = False

    @model_validator(mode="after")
    def validate_bindings(self) -> "Prompt2BlogV4Request":
        if self.work_order.brief_fingerprint != self.brief.brief_fingerprint:
            raise ValueError(
                "work order answers a different brief than the one supplied"
            )
        if (
            self.evidence_package.work_order_fingerprint
            != self.work_order.work_order_fingerprint
        ):
            raise ValueError(
                "evidence was researched for a different work order"
            )
        declared = {item.requirement_id for item in self.work_order.requirements}
        answered = {item.requirement_id for item in self.evidence_package.requirements}
        if declared != answered:
            missing = sorted(declared - answered)
            extra = sorted(answered - declared)
            raise ValueError(
                "evidence must answer every work order requirement exactly once; "
                f"missing={missing}, unknown={extra}"
            )
        return self
