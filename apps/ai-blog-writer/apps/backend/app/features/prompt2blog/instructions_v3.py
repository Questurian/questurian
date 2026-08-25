"""Instruction assembly for Prompt2Blog v3.

Replaces the v2 guideline fetch. Every writing stage reads one assembled stack
whose precedence is explicit and fixed:

    verified evidence → approved commission → article-form rules
    → topic modules → audience guidance → house style

A lower layer may refine emphasis. It can never add a subject, comparator,
fact, or obligation that a higher layer did not authorize.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict

from .contracts_v3 import Prompt2BlogCommission, Prompt2BlogV3Request
from .editorial_catalog import EditorialCatalog, load_editorial_catalog
from .evidence_v3 import NormalizedEvidence, normalize_evidence

INSTRUCTION_SCHEMA_VERSION = 3

PRECEDENCE = (
    "verified evidence",
    "approved commission",
    "article-form rules",
    "topic modules",
    "audience guidance",
    "house style",
)

_HEADLINE_HEADING = "## Headline note"


class InstructionModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class InstructionLayer(InstructionModel):
    layer: str
    title: str
    body: str


class V3InstructionSet(InstructionModel):
    schema_version: int = INSTRUCTION_SCHEMA_VERSION
    precedence: list[str]
    layers: list[InstructionLayer]
    instruction_text: str
    headline_instructions: str
    instruction_meta: dict[str, Any]


def _precedence_block() -> str:
    ordered = "\n".join(
        f"{index}. {label}" for index, label in enumerate(PRECEDENCE, start=1)
    )
    return (
        "AUTHORITY ORDER\n"
        f"{ordered}\n"
        "A lower layer may refine emphasis. It may never add a subject, "
        "comparator, factual claim, or obligation that a higher layer did not "
        "authorize."
    )


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
        "These records are the only permitted source of fact. Use them exactly: "
        "preserve attribution, dates, units, geography, and stated uncertainty. "
        "An unsupported requirement stays a visible gap; never invent a bridge "
        "fact to close it.\n\n"
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


def assemble_v3_instructions(
    request: Prompt2BlogV3Request,
    *,
    catalog: EditorialCatalog | None = None,
) -> V3InstructionSet:
    """Builds the layered instruction stack for one approved commission."""
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

    instruction_text = "\n\n".join(
        [_precedence_block()] + [f"{layer.title}\n{layer.body}" for layer in layers]
    )
    headline_note = _headline_note(form.instructions)
    headline_instructions = "\n\n".join(
        part
        for part in (
            catalog.headline_rules.instructions,
            (
                f"FORM HEADLINE NOTE — {form.label}\n{headline_note}"
                if headline_note
                else ""
            ),
            f"ORIGINAL TITLE (author intent, not a template)\n"
            f"{commission.original_title}",
        )
        if part
    )

    return V3InstructionSet(
        precedence=list(PRECEDENCE),
        layers=layers,
        instruction_text=instruction_text,
        headline_instructions=headline_instructions,
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
