"""Canonical Prompt2Blog v3 instructions and stage-specific projections."""

from __future__ import annotations

from hashlib import sha256
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from .contracts_v3 import Prompt2BlogCommission, Prompt2BlogV3Request
from .editorial_catalog import EditorialCatalog, load_editorial_catalog
from .evidence_v3 import NormalizedEvidence, normalize_evidence

INSTRUCTION_SCHEMA_VERSION = 5

PRECEDENCE = (
    "verified evidence",
    "approved commission",
    "article-form rules",
    "topic modules",
    "audience guidance",
    "house style",
)

_HEADLINE_HEADING = "## Headline note"
_OUTLINE_FORM_HEADINGS = (
    "## Reader promise",
    "## Required evidence",
    "## Allowed structures",
    "## Failure modes",
)

EVIDENCE_DISPOSITION_POLICY = """EVIDENCE DISPOSITION POLICY (IMMUTABLE)
- Unsupported assertion: delete it. Never hedge it, qualify it, or label it
  unconfirmed. Omit unsupported points from reader-facing prose.
- Supported uncertainty: preserve its exact scope, confidence, and limits.
- Unpublished fact: omit it silently. Never narrate research absence.
- Gap: record it in `remaining_gaps` as internal metadata only. Never put the
  gap or the research process in reader-facing prose."""


class InstructionModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class InstructionLayer(InstructionModel):
    layer: str
    title: str
    body: str


class StageContext(InstructionModel):
    text: str
    included_sections: list[str]
    fingerprint: str


class V3StageContexts(InstructionModel):
    outline: StageContext
    compose: StageContext
    audit: StageContext
    repair_lock: StageContext
    title: StageContext


StageContextName = Literal["outline", "compose", "audit", "repair_lock", "title"]


class V3InstructionSet(InstructionModel):
    schema_version: int = INSTRUCTION_SCHEMA_VERSION
    precedence: list[str]
    layers: list[InstructionLayer]
    stage_contexts: V3StageContexts
    instruction_meta: dict[str, Any]


def _commission_body(commission: Prompt2BlogCommission) -> str:
    references = "\n".join(
        f"- {reference.name} — {reference.role}"
        for reference in commission.scope.references
    )
    requirements = "\n".join(
        f"- {requirement.requirement_id} — {requirement.question}"
        for requirement in commission.requirements
    )
    exclusions = (
        "\n".join(f"- {item}" for item in commission.exclusions) or "- None recorded."
    )
    tags = ", ".join(commission.audience.tags) or "none"
    lines = [
        f"Original title: {commission.original_title}",
        f"Location: {commission.location}",
        f"Approved direction: {commission.approved_direction}",
        f"Primary subject: {commission.primary_subject}",
        f"Scope mode: {commission.scope.mode}",
        "References and roles:",
        references,
        f"Core reader question: {commission.core_reader_question}",
        f"Reader outcome: {commission.reader_outcome}",
        f"Primary reader: {commission.audience.primary_reader}",
        f"Audience tags: {tags}",
        "Requirements:",
        requirements,
        "Exclusions:",
        exclusions,
    ]
    if commission.call_to_action:
        lines.append(f"Call to action: {commission.call_to_action}")
    lines.append(
        "Context-only references may calibrate a fact or explain significance. "
        "They may never become co-subjects, recurring sections, rankings, or "
        "verdicts, and the approved form may not change."
    )
    return "\n".join(lines)


def _evidence_body(evidence: NormalizedEvidence) -> str:
    return (
        f"{EVIDENCE_DISPOSITION_POLICY}\n\n"
        "These records are the only permitted source of fact. Use them exactly: "
        "preserve dates, units, geography, and stated uncertainty. Attribution "
        "is internal to these records. Never carry it into the prose: no "
        "\"sources report\", no \"outlets say\", no \"according to\", no "
        "\"the publication noted\", no naming the outlet, site, or report a "
        "fact came from. Never invent a bridge fact to close a gap. First-hand "
        "material "
        "is the writer's own knowledge: state it directly, as fact, with no "
        "attribution, no sourcing language, and no note about how it was "
        "obtained. A confirmed premise is simply a fact the article may use; "
        "never mention that it was checked, and never write a sentence about "
        "what the research established. A resolved conflict is the same: the "
        "resolution is the fact, and the disagreement behind it is internal. "
        "Write the settled figure as a plain sentence. Never tell the reader "
        "that two records disagreed, which one was chosen, or why.\n\n"
        f"{evidence.records_text}"
    )


def _audience_body(
    commission: Prompt2BlogCommission,
    catalog: EditorialCatalog,
) -> str:
    tags_by_id = {tag.id: tag for tag in catalog.audience_tags}
    lines = [f"Primary reader: {commission.audience.primary_reader}"]
    if commission.audience.tags:
        lines.append("Emphasis tags:")
        lines.extend(
            f"- {tags_by_id[tag_id].label} — {tags_by_id[tag_id].description}"
            for tag_id in commission.audience.tags
        )
    else:
        lines.append("Emphasis tags: none.")
    lines.append(
        "Tags adjust emphasis only. They do not change structure, scope, or the "
        "approved form."
    )
    return "\n".join(lines)


def _headline_note(form_instructions: str) -> str:
    if _HEADLINE_HEADING not in form_instructions:
        return ""
    section = form_instructions.split(_HEADLINE_HEADING, 1)[1]
    return section.split("\n## ", 1)[0].strip()


def _markdown_section(instructions: str, heading: str) -> str:
    if heading not in instructions:
        return ""
    body = instructions.split(heading, 1)[1].split("\n## ", 1)[0].strip()
    return f"{heading}\n\n{body}" if body else ""


def _form_structure(form_instructions: str) -> str:
    return "\n\n".join(
        section
        for heading in _OUTLINE_FORM_HEADINGS
        if (section := _markdown_section(form_instructions, heading))
    )


def _claim_requirement_index(evidence: NormalizedEvidence) -> str:
    lines = ["CLAIM INDEX"]
    if evidence.claims:
        for claim in evidence.claims:
            requirements = ", ".join(claim.requirement_ids) or "none"
            as_of = f" | as of: {claim.as_of}" if claim.as_of else ""
            lines.append(
                f"- {claim.claim_id} — {claim.text} | requirements: "
                f"{requirements}{as_of} | confidence: {claim.confidence}"
            )
    else:
        lines.append("- None supplied.")

    lines.extend(("", "REQUIREMENT INDEX"))
    for requirement in evidence.requirements:
        claims = ", ".join(requirement.claim_ids) or "none"
        gap = f" | gap: {requirement.gap}" if requirement.gap else ""
        lines.append(
            f"- {requirement.requirement_id} — {requirement.question} "
            f"| status: {requirement.status} | claims: {claims}{gap}"
        )
    return "\n".join(lines)


def _repair_lock_body(
    commission: Prompt2BlogCommission,
    *,
    form_label: str,
) -> str:
    references = "\n".join(
        f"- {reference.name} — {reference.role}"
        for reference in commission.scope.references
    )
    requirements = "\n".join(
        f"- {item.requirement_id} — {item.question}" for item in commission.requirements
    )
    exclusions = "\n".join(f"- {item}" for item in commission.exclusions)
    return "\n".join(
        (
            f"Original-title promise: {commission.original_title}",
            f"Article form: {form_label}",
            f"Primary subject: {commission.primary_subject}",
            f"Scope mode: {commission.scope.mode}",
            f"Core reader question: {commission.core_reader_question}",
            "Reference roles:",
            references,
            "Requirements:",
            requirements,
            "Exclusions:",
            exclusions or "- None recorded.",
            "Keep direct, specific prose for the named reader. Preserve the "
            "approved form and scope. Do not add factual material.",
        )
    )


def _title_commission_body(commission: Prompt2BlogCommission) -> str:
    references = ", ".join(
        f"{item.name} ({item.role})" for item in commission.scope.references
    )
    return "\n".join(
        (
            f"Original title: {commission.original_title}",
            f"Primary subject: {commission.primary_subject}",
            f"Location: {commission.location}",
            f"Approved direction: {commission.approved_direction}",
            f"Core reader question: {commission.core_reader_question}",
            f"Reader outcome: {commission.reader_outcome}",
            f"Scope mode: {commission.scope.mode}",
            f"References: {references}",
        )
    )


def _stage_context(*, parts: list[tuple[str, str]]) -> StageContext:
    included_sections = [name for name, body in parts if body]
    text = "\n\n".join(body for _name, body in parts if body)
    return StageContext(
        text=text,
        included_sections=included_sections,
        fingerprint=sha256(text.encode("utf-8")).hexdigest(),
    )


def _validated_stage_contexts(
    stage_contexts: V3StageContexts | dict[str, Any],
) -> V3StageContexts:
    if isinstance(stage_contexts, V3StageContexts):
        return stage_contexts
    return V3StageContexts.model_validate(stage_contexts)


def stage_context_text(
    stage_contexts: V3StageContexts | dict[str, Any],
    name: StageContextName,
) -> str:
    """Return one required projection; malformed runtime inputs fail loudly."""
    return getattr(_validated_stage_contexts(stage_contexts), name).text


def stage_context_manifest(
    stage_contexts: V3StageContexts | dict[str, Any],
) -> dict[str, Any]:
    """Compact debug receipt for contexts whose full prompts live in traces."""
    contexts = _validated_stage_contexts(stage_contexts)
    return {
        name: {
            "included_sections": list(context.included_sections),
            "character_count": len(context.text),
            "fingerprint": context.fingerprint,
        }
        for name, context in (
            ("outline", contexts.outline),
            ("compose", contexts.compose),
            ("audit", contexts.audit),
            ("repair_lock", contexts.repair_lock),
            ("title", contexts.title),
        )
    }


def assemble_v3_instructions(
    request: Prompt2BlogV3Request,
    *,
    catalog: EditorialCatalog | None = None,
) -> V3InstructionSet:
    """Build canonical layers and job-specific contexts for one commission."""
    catalog = catalog or load_editorial_catalog()
    commission = request.commission

    form = next((item for item in catalog.forms if item.id == commission.form_id), None)
    if form is None:
        raise ValueError(f"Unknown article form: {commission.form_id}")

    modules_by_id = {module.id: module for module in catalog.topic_modules}
    unknown_modules = [
        module_id
        for module_id in commission.topic_module_ids
        if module_id not in modules_by_id
    ]
    if unknown_modules:
        raise ValueError(f"Unknown topic modules: {sorted(unknown_modules)}")
    unknown_tags = [
        tag_id
        for tag_id in commission.audience.tags
        if tag_id not in {tag.id for tag in catalog.audience_tags}
    ]
    if unknown_tags:
        raise ValueError(f"Unknown audience tags: {sorted(unknown_tags)}")

    # Catalog order, not commission order, so two runs with the same modules
    # assemble byte-identical instructions.
    active_modules = [
        module
        for module in catalog.topic_modules
        if module.id in set(commission.topic_module_ids)
    ]
    evidence = normalize_evidence(commission, request.evidence_package)

    layers = [
        InstructionLayer(
            layer="evidence",
            title="VERIFIED EVIDENCE",
            body=_evidence_body(evidence),
        ),
        InstructionLayer(
            layer="commission",
            title="APPROVED COMMISSION",
            body=_commission_body(commission),
        ),
        InstructionLayer(
            layer="form",
            title=f"ARTICLE FORM — {form.label}",
            body=form.instructions,
        ),
        InstructionLayer(
            layer="topic_modules",
            title="TOPIC MODULES",
            body="\n\n".join(module.instructions for module in active_modules)
            or "No topic module is active for this commission.",
        ),
        InstructionLayer(
            layer="audience",
            title="AUDIENCE GUIDANCE",
            body=_audience_body(commission, catalog),
        ),
        InstructionLayer(
            layer="house_style",
            title="HOUSE STYLE",
            body=catalog.house_rules.instructions,
        ),
    ]

    headline_note = _headline_note(form.instructions)
    form_structure = _form_structure(form.instructions)
    commission_body = _commission_body(commission)
    audience_body = _audience_body(commission, catalog)
    topic_modules_body = (
        "\n\n".join(module.instructions for module in active_modules)
        or "No topic module is active for this commission."
    )
    stage_contexts = V3StageContexts(
        outline=_stage_context(
            parts=[
                (
                    "outline_authority",
                    "OUTLINE AUTHORITY\nThe approved commission controls scope; "
                    "the claim and requirement index controls available support; "
                    "the form structure controls organization.",
                ),
                ("commission", f"APPROVED COMMISSION\n{commission_body}"),
                (
                    "form_structure",
                    f"ARTICLE FORM STRUCTURE — {form.label}\n{form_structure}",
                ),
                ("claim_requirement_index", _claim_requirement_index(evidence)),
            ]
        ),
        compose=_stage_context(
            parts=[
                (
                    "compose_authority",
                    "COMPOSE AUTHORITY\nVerified evidence controls facts; the approved "
                    "commission controls scope; form and style rules control "
                    "expression.",
                ),
                ("evidence", f"VERIFIED EVIDENCE\n{_evidence_body(evidence)}"),
                ("commission", f"APPROVED COMMISSION\n{commission_body}"),
                ("form", f"ARTICLE FORM — {form.label}\n{form_structure}"),
                ("topic_modules", f"TOPIC MODULES\n{topic_modules_body}"),
                ("audience", f"AUDIENCE GUIDANCE\n{audience_body}"),
                ("house_style", f"HOUSE STYLE\n{catalog.house_rules.instructions}"),
            ]
        ),
        audit=_stage_context(
            parts=[
                (
                    "audit_authority",
                    "AUDIT AUTHORITY\nJudge commission fidelity, form fit, reader "
                    "service, and style. Treat the grounding verdict as final "
                    "on support.",
                ),
                ("commission", f"APPROVED COMMISSION\n{commission_body}"),
                ("form", f"ARTICLE FORM — {form.label}\n{form_structure}"),
                ("audience", f"AUDIENCE GUIDANCE\n{audience_body}"),
                ("house_style", f"HOUSE STYLE\n{catalog.house_rules.instructions}"),
            ]
        ),
        repair_lock=_stage_context(
            parts=[
                (
                    "repair_authority",
                    "REPAIR AUTHORITY\nExact revisions and unsupported-claim verdicts "
                    "control this pass. This lock is immutable.",
                ),
                ("evidence_disposition_policy", EVIDENCE_DISPOSITION_POLICY),
                (
                    "scope_style_lock",
                    f"COMPACT SCOPE AND STYLE LOCK\n"
                    f"{_repair_lock_body(commission, form_label=form.label)}",
                ),
            ]
        ),
        title=_stage_context(
            parts=[
                (
                    "title_authority",
                    "TITLE AUTHORITY\nHeadline rules control phrasing; the commission "
                    "and supplied article signals control the promise.",
                ),
                ("headline_rules", catalog.headline_rules.instructions),
                (
                    "form_headline_note",
                    (
                        f"FORM HEADLINE NOTE — {form.label}\n{headline_note}"
                        if headline_note
                        else ""
                    ),
                ),
                ("commission_summary", _title_commission_body(commission)),
            ]
        ),
    )

    return V3InstructionSet(
        precedence=list(PRECEDENCE),
        layers=layers,
        stage_contexts=stage_contexts,
        instruction_meta={
            "schema_version": INSTRUCTION_SCHEMA_VERSION,
            "form_id": form.id,
            "form_label": form.label,
            "source_requirements": list(form.source_requirements),
            "topic_module_ids": [module.id for module in active_modules],
            "audience_tag_ids": list(commission.audience.tags),
            "house_rules_id": catalog.house_rules.id,
            "headline_rules_id": catalog.headline_rules.id,
            "precedence": list(PRECEDENCE),
            "commission_fingerprint": commission.commission_fingerprint,
            "evidence_receipt": evidence.receipt(),
        },
    )
