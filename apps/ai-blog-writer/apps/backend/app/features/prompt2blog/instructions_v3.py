"""Canonical Prompt2Blog v3 instructions and stage-specific projections."""

from __future__ import annotations

from hashlib import sha256
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from .contracts_v4 import ArticleBrief, Prompt2BlogV4Request, Prompt2BlogWorkOrder
from .editorial_catalog import EditorialCatalog, load_editorial_catalog
from .evidence_v3 import NormalizedEvidence, normalize_evidence
from .support import _safe_str

INSTRUCTION_SCHEMA_VERSION = 5

PRECEDENCE = (
    "verified evidence",
    "approved brief",
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


def _brief_body(brief: ArticleBrief, work_order: Prompt2BlogWorkOrder) -> str:
    """The brief and its work order, rendered for a prompt.

    The order here is still the v3 order. Leading with the brief, and reframing
    evidence as the facts you may use rather than the article's reason for
    existing, is A5 and lands with the compose rework.
    """
    references = "\n".join(
        f"- {reference.name} — {reference.role}"
        for reference in work_order.scope.references
    )
    requirements = "\n".join(
        f"- {requirement.requirement_id} [{requirement.kind}] — {requirement.question}"
        for requirement in work_order.requirements
    )
    must_name = "\n".join(f"- {item}" for item in brief.must_name) or "- None recorded."
    material = (
        "\n".join(f"- [{item.kind}] {item.statement}" for item in brief.material)
        or "- None; this is a research-led piece."
    )
    tags = ", ".join(brief.reader.tags) or "none"
    lines = [
        f"Seed (provenance only, not a promise to keep): {brief.seed}",
        f"Location: {brief.location}",
        f"Spine: {brief.spine}",
        f"Primary subject: {work_order.primary_subject}",
        f"Scope mode: {work_order.scope.mode}",
        "References and roles:",
        references,
        f"Core reader question: {brief.reader_question}",
        f"The promise to keep: {brief.outcome}",
        f"Primary reader: {brief.reader.primary_reader}",
        f"Audience tags: {tags}",
        "Must name:",
        must_name,
        "Material the writer has:",
        material,
        "Requirements:",
        requirements,
        f"This piece fails if: {brief.fails_if}",
        "Context-only references may calibrate a fact or explain significance. "
        "They may never become co-subjects, recurring sections, rankings, or "
        "verdicts, and the approved form may not change.",
    ]
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
    brief: ArticleBrief,
    catalog: EditorialCatalog,
) -> str:
    tags_by_id = {tag.id: tag for tag in catalog.audience_tags}
    lines = [f"Primary reader: {brief.reader.primary_reader}"]
    if brief.reader.tags:
        lines.append("Emphasis tags:")
        lines.extend(
            f"- {tags_by_id[tag_id].label} — {tags_by_id[tag_id].description}"
            for tag_id in brief.reader.tags
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


def _facts_by_subject(evidence: NormalizedEvidence) -> str:
    """The facts, grouped by what they are about.

    The outline used to be handed this ledger indexed by requirement id, and it
    did the obvious thing: one section per question. That is why the Lima
    article's spine was its own research plan. Grouping by source subject
    removes the shape the plan was inheriting -- the outline has to decide what
    the piece is about instead of transcribing what was asked.

    The requirement index still follows, because coverage has to stay
    checkable. It is second, and it is labelled as bookkeeping.
    """
    by_subject: dict[str, list[str]] = {}
    for claim in evidence.claims:
        # The source's own subject line is the best grouping available without
        # asking a model to classify facts, which would be a call to save a
        # sort.
        subject = _safe_str(getattr(claim, "subject", "")) or "General"
        as_of = f" (as of {claim.as_of})" if claim.as_of else ""
        by_subject.setdefault(subject, []).append(
            f"- {claim.claim_id} — {claim.text}{as_of} [{claim.confidence}]"
        )

    lines = ["FACTS AVAILABLE, BY SUBJECT"]
    if by_subject:
        for subject in sorted(by_subject):
            lines.extend(("", subject, *by_subject[subject]))
    else:
        lines.append("- None supplied.")

    lines.extend(
        (
            "",
            "COVERAGE BOOKKEEPING (which question each fact closes — not a "
            "section plan)",
        )
    )
    for requirement in evidence.requirements:
        claims = ", ".join(requirement.claim_ids) or "none"
        gap = f" | gap: {requirement.gap}" if requirement.gap else ""
        lines.append(
            f"- {requirement.requirement_id} [{requirement.status}] "
            f"claims: {claims}{gap}"
        )
    return "\n".join(lines)


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
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    *,
    form_label: str,
) -> str:
    references = "\n".join(
        f"- {reference.name} — {reference.role}"
        for reference in work_order.scope.references
    )
    requirements = "\n".join(
        f"- {item.requirement_id} — {item.question}" for item in work_order.requirements
    )
    must_name = "\n".join(f"- {item}" for item in brief.must_name)
    return "\n".join(
        (
            f"The piece promises: {brief.outcome}",
            f"Spine: {brief.spine}",
            f"Article form: {form_label}",
            f"Primary subject: {work_order.primary_subject}",
            f"Scope mode: {work_order.scope.mode}",
            f"Core reader question: {brief.reader_question}",
            "Reference roles:",
            references,
            "Requirements:",
            requirements,
            "Must name:",
            must_name or "- None recorded.",
            f"It fails if: {brief.fails_if}",
            "Keep direct, specific prose for the named reader. Preserve the "
            "approved form and scope. Do not add factual material.",
        )
    )


def _title_brief_body(brief: ArticleBrief, work_order: Prompt2BlogWorkOrder) -> str:
    references = ", ".join(
        f"{item.name} ({item.role})" for item in work_order.scope.references
    )
    return "\n".join(
        (
            f"The promise to keep: {brief.outcome}",
            f"Spine: {brief.spine}",
            f"Primary subject: {work_order.primary_subject}",
            f"Location: {brief.location}",
            f"Core reader question: {brief.reader_question}",
            f"Scope mode: {work_order.scope.mode}",
            f"References: {references}",
            f"Seed, for provenance only: {brief.seed}",
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
    request: Prompt2BlogV4Request,
    *,
    catalog: EditorialCatalog | None = None,
) -> V3InstructionSet:
    """Build canonical layers and job-specific contexts for one brief."""
    catalog = catalog or load_editorial_catalog()
    brief = request.brief
    work_order = request.work_order

    form = next((item for item in catalog.forms if item.id == brief.form_id), None)
    if form is None:
        raise ValueError(f"Unknown article form: {brief.form_id}")

    modules_by_id = {module.id: module for module in catalog.topic_modules}
    unknown_modules = [
        module_id
        for module_id in brief.topic_module_ids
        if module_id not in modules_by_id
    ]
    if unknown_modules:
        raise ValueError(f"Unknown topic modules: {sorted(unknown_modules)}")
    unknown_tags = [
        tag_id
        for tag_id in brief.reader.tags
        if tag_id not in {tag.id for tag in catalog.audience_tags}
    ]
    if unknown_tags:
        raise ValueError(f"Unknown audience tags: {sorted(unknown_tags)}")

    # Catalog order, not brief order, so two runs with the same modules
    # assemble byte-identical instructions.
    active_modules = [
        module
        for module in catalog.topic_modules
        if module.id in set(brief.topic_module_ids)
    ]
    evidence = normalize_evidence(work_order, request.evidence_package)

    layers = [
        InstructionLayer(
            layer="evidence",
            title="VERIFIED EVIDENCE",
            body=_evidence_body(evidence),
        ),
        InstructionLayer(
            layer="brief",
            title="APPROVED COMMISSION",
            body=_brief_body(brief, work_order),
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
            or "No topic module is active for this brief.",
        ),
        InstructionLayer(
            layer="audience",
            title="AUDIENCE GUIDANCE",
            body=_audience_body(brief, catalog),
        ),
        InstructionLayer(
            layer="house_style",
            title="HOUSE STYLE",
            body=catalog.house_rules.instructions,
        ),
    ]

    headline_note = _headline_note(form.instructions)
    form_structure = _form_structure(form.instructions)
    brief_body = _brief_body(brief, work_order)
    audience_body = _audience_body(brief, catalog)
    topic_modules_body = (
        "\n\n".join(module.instructions for module in active_modules)
        or "No topic module is active for this brief."
    )
    stage_contexts = V3StageContexts(
        outline=_stage_context(
            parts=[
                (
                    "outline_authority",
                    "OUTLINE AUTHORITY\nThe approved brief controls scope; the "
                    "facts control available support; the form structure "
                    "controls organization; the voice controls what kind of "
                    "piece this is.",
                ),
                # The single largest change in the spec. Compose is obedient:
                # give it a good plan and it writes well, give it an audit and
                # it writes an excellent audit. This stage decides which.
                ("voice", f"THE VOICE YOU ARE WRITING IN\n{catalog.voice.instructions}"),
                ("brief", f"APPROVED BRIEF\n{brief_body}"),
                ("audience", f"AUDIENCE GUIDANCE\n{audience_body}"),
                (
                    "form_structure",
                    f"ARTICLE FORM STRUCTURE — {form.label}\n{form_structure}",
                ),
                ("facts", _facts_by_subject(evidence)),
                (
                    "outline_rules",
                    "PLANNING RULES\n"
                    # A3. "Do not claim a transformation" became a section
                    # called Scope limits: a negative instruction is a topic
                    # waiting to happen.
                    "- No section may take scope, limits, method, evidence or "
                    "the state of our research as its subject. The reader came "
                    "for the place, not for how we found out about it.\n"
                    # A4. Compose is separately required to add an opening and
                    # takeaways -- about 165 words nobody counts -- so a plan
                    # that budgets the full target overshoots by construction.
                    "- Your section budgets must leave room for an opening and "
                    "a closing takeaways section, which you do not plan and "
                    "which cost roughly 165 words together. Budget the "
                    "sections to the target minus that.\n"
                    "- Group sections by subject. One section per research "
                    "question is a research plan, not an article.",
                ),
            ]
        ),
        compose=_stage_context(
            parts=[
                (
                    "compose_authority",
                    "COMPOSE AUTHORITY\nThe brief says what you are making. The "
                    "facts below are the material you may make it from, and "
                    "they constrain every factual claim absolutely. Form and "
                    "style rules control expression.",
                ),
                # The brief first, and evidence reframed. Evidence still binds
                # the facts; it stops being the reason the article exists,
                # which is what produced a piece about its own research.
                ("voice", f"THE VOICE YOU ARE WRITING IN\n{catalog.voice.instructions}"),
                ("brief", f"WHAT WE ARE MAKING\n{brief_body}"),
                (
                    "evidence",
                    f"THE FACTS YOU MAY USE\n{_evidence_body(evidence)}",
                ),
                ("form", f"ARTICLE FORM — {form.label}\n{form_structure}"),
                ("topic_modules", f"TOPIC MODULES\n{topic_modules_body}"),
                ("audience", f"AUDIENCE GUIDANCE\n{audience_body}"),
                (
                    "writing_conventions",
                    f"WRITING CONVENTIONS\n{catalog.writing_conventions.instructions}",
                ),
                ("house_style", f"HOUSE STYLE\n{catalog.house_rules.instructions}"),
            ]
        ),
        audit=_stage_context(
            parts=[
                (
                    "audit_authority",
                    "AUDIT AUTHORITY\nJudge brief fidelity, form fit, reader "
                    "service, and style. Treat the grounding verdict as final "
                    "on support.",
                ),
                ("brief", f"APPROVED BRIEF\n{brief_body}"),
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
                    f"{_repair_lock_body(
        brief,
        work_order, form_label=form.label)}",
                ),
            ]
        ),
        title=_stage_context(
            parts=[
                (
                    "title_authority",
                    "TITLE AUTHORITY\nHeadline rules control phrasing; the brief "
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
                ("brief_summary", _title_brief_body(brief, work_order)),
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
            "audience_tag_ids": list(brief.reader.tags),
            "house_rules_id": catalog.house_rules.id,
            "headline_rules_id": catalog.headline_rules.id,
            "precedence": list(PRECEDENCE),
            "brief_fingerprint": brief.brief_fingerprint,
            "work_order_fingerprint": work_order.work_order_fingerprint,
            "evidence_receipt": evidence.receipt(),
        },
    )
