"""What the two v4 objects must not let through.

v3 had one commission and one fingerprint doing two jobs: describing the
article and binding the evidence to it. Splitting it into a brief and a work
order means there are now two bindings to keep honest, and nothing checks them
unless these do.
"""

from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from app.features.prompt2blog.contracts_v4 import (
    ArticleBrief,
    BriefMaterial,
    BriefReader,
    EvidenceClaim,
    EvidencePackage,
    EvidenceRequirement,
    EvidenceSource,
    Prompt2BlogV4Request,
    Prompt2BlogWorkOrder,
    Prompt2BlogWritingProfiles,
    WorkOrderReference,
    WorkOrderRequirement,
    WorkOrderScope,
)


def _brief(**overrides) -> ArticleBrief:
    payload = dict(
        brief_fingerprint="bf-1",
        seed="Lima is no longer simply the stopover before Machu Picchu",
        location="Lima, Peru",
        form_id="destination-guide",
        topic_module_ids=["food-drink"],
        reader=BriefReader(
            primary_reader="layover traveller, Cusco-bound",
            tags=["first-time-visitor"],
        ),
        reader_question="Is Lima worth two extra nights?",
        outcome="book two extra nights on a layover",
        spine="food, with a cheap-beats-famous argument",
        must_name=["Surquillo market", "Huaca Pucllana"],
        material=[
            BriefMaterial(
                kind="firsthand",
                statement=(
                    "the ceviche place in Surquillo market was better than any "
                    "of the fancy ones"
                ),
            )
        ],
        fails_if="reads like a tourist board",
    )
    payload.update(overrides)
    return ArticleBrief(**payload)


def _work_order(**overrides) -> Prompt2BlogWorkOrder:
    payload = dict(
        work_order_fingerprint="wo-1",
        brief_fingerprint="bf-1",
        primary_subject="Lima",
        scope=WorkOrderScope(
            mode="single_subject",
            references=[WorkOrderReference(name="Lima", role="primary_subject")],
        ),
        requirements=[
            WorkOrderRequirement(
                requirement_id="r1",
                question="What do Surquillo market stalls charge for ceviche?",
                kind="load_bearing",
            ),
            WorkOrderRequirement(
                requirement_id="r2",
                question="What is Huaca Pucllana like after dark?",
                kind="texture",
            ),
        ],
    )
    payload.update(overrides)
    return Prompt2BlogWorkOrder(**payload)


def _evidence(**overrides) -> EvidencePackage:
    # A supported requirement has to cite a claim, and a claim has to cite a
    # source: the evidence model is unchanged from v3 and stays strict.
    payload = dict(
        work_order_fingerprint="wo-1",
        sources=[
            EvidenceSource(
                source_id="s1",
                title="Surquillo market price survey",
                publisher="Peru Retail",
                url="https://example.pe/surquillo-prices",
                retrieved_at=date(2026, 8, 1),
                source_type="reporting",
                material_type="web",
                notes=["Stall ceviche is priced well under the tasting menus."],
            )
        ],
        claims=[
            EvidenceClaim(
                claim_id="c1",
                text="Market ceviche runs a fraction of the tasting-menu price.",
                source_ids=["s1"],
                requirement_ids=["r1"],
                confidence="high",
            )
        ],
        requirements=[
            EvidenceRequirement(
                requirement_id="r1", status="supported", claim_ids=["c1"]
            ),
            EvidenceRequirement(
                requirement_id="r2",
                status="unpublished",
                gap="Nobody publishes what the site is like after dark.",
            ),
        ],
    )
    payload.update(overrides)
    return EvidencePackage(**payload)


def _request(**overrides) -> Prompt2BlogV4Request:
    payload = dict(
        brief=_brief(),
        work_order=_work_order(),
        evidence_package=_evidence(),
        profiles=Prompt2BlogWritingProfiles(length_id="medium"),
    )
    payload.update(overrides)
    return Prompt2BlogV4Request(**payload)


def test_a_complete_v4_request_validates():
    request = _request()
    assert request.schema_version == 4
    assert request.brief.fails_if == "reads like a tourist board"


def test_first_hand_material_is_kept_as_the_operator_said_it():
    # The grill records what someone has, verbatim. First-hand material is
    # excused from fact-checking by design, so a paraphrase would create an
    # unverifiable claim nothing downstream can catch.
    material = _brief().material[0]
    assert material.kind == "firsthand"
    assert "better than any of the fancy ones" in material.statement


def test_a_work_order_cannot_answer_a_brief_it_was_not_derived_from():
    with pytest.raises(ValidationError, match="different brief"):
        _request(work_order=_work_order(brief_fingerprint="bf-other"))


def test_evidence_cannot_attach_to_a_work_order_it_was_not_researched_for():
    with pytest.raises(ValidationError, match="different work order"):
        _request(evidence_package=_evidence(work_order_fingerprint="wo-other"))


def test_evidence_must_answer_every_requirement_exactly_once():
    with pytest.raises(ValidationError, match=r"missing=\['r2'\]"):
        _request(
            evidence_package=_evidence(
                requirements=[
                    EvidenceRequirement(
                        requirement_id="r1", status="supported", claim_ids=["c1"]
                    )
                ]
            )
        )


def test_a_work_order_needs_something_load_bearing():
    """All texture is not an article, it is a mood.

    The operator may strike load-bearing questions -- that is the point of
    letting them cut the work order -- but striking all of them means there is
    nothing left for the piece to stand on.
    """
    with pytest.raises(ValidationError, match="load-bearing"):
        _work_order(
            requirements=[
                WorkOrderRequirement(
                    requirement_id="r2",
                    question="What is Huaca Pucllana like after dark?",
                    kind="texture",
                )
            ]
        )


def test_a_requirement_must_say_what_missing_it_costs():
    with pytest.raises(ValidationError):
        WorkOrderRequirement(requirement_id="r3", question="How much is a taxi?")


def test_the_tone_layer_is_gone_from_the_request():
    # Stage 1 collapsed the catalog to one voice and left these fields alive
    # only because the v3 contract demanded them. Nothing may send them now.
    with pytest.raises(ValidationError):
        Prompt2BlogWritingProfiles(length_id="medium", tone_id="practical")
    with pytest.raises(ValidationError):
        Prompt2BlogWritingProfiles(length_id="medium", brand_voice_id="questurian")


def test_the_brief_has_no_exclusions_field():
    """A negative instruction is a topic waiting to happen.

    "Do not claim a transformation" became a section called Scope limits. Spine
    and must_name replace it (ADR 0030, W7).
    """
    with pytest.raises(ValidationError):
        _brief(exclusions=["do not claim a transformation"])


def test_the_seed_is_kept_but_is_not_a_title():
    # Provenance, not a promise. v3 locked the typed title on entry and handed
    # it to five stages as a commitment nobody examined.
    brief = _brief()
    assert brief.seed.startswith("Lima is no longer")
    assert not hasattr(brief, "original_title")
