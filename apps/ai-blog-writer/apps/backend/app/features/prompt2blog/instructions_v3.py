"""Canonical Prompt2Blog v3 instructions and stage-specific projections."""

from __future__ import annotations

from hashlib import sha256
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from .contracts_v4 import ArticleBrief, Prompt2BlogV4Request, Prompt2BlogWorkOrder
from .editorial_catalog import EditorialCatalog, load_editorial_catalog
from .evidence_v3 import NormalizedEvidence, normalize_evidence
from .packet_v4 import WritingPacket

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

# What each editorial role is called where a model reads it. The role names in
# the packet are short because they are data; these say what the job is.
_ROLE_LABELS = {
    "backbone": "BACKBONE — what the piece argues from",
    "practical": "PRACTICAL — what the reader acts on",
    "texture": "TEXTURE — what makes the place real",
    "": "CHOSEN FOR THIS ARTICLE",
}
_ROLE_ORDER = (
    _ROLE_LABELS["backbone"],
    _ROLE_LABELS["practical"],
    _ROLE_LABELS["texture"],
    _ROLE_LABELS[""],
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
    # Characters per section, so a prompt's size can be read off the run
    # instead of guessed at. The compose call measured 29,218 tokens with only
    # about 11,000 traceable from stored data; the other 18,000 were invisible,
    # which made "what should we cut" unanswerable. Characters rather than
    # tokens because this is assembled before any tokenizer is in reach, and a
    # four-to-one ratio is close enough to find the big one.
    section_sizes: dict[str, int] = {}

    @property
    def characters(self) -> int:
        return len(self.text)


class V3StageContexts(InstructionModel):
    outline: StageContext
    compose: StageContext
    audit: StageContext
    repair_lock: StageContext


StageContextName = Literal["outline", "compose", "audit", "repair_lock"]


class V3InstructionSet(InstructionModel):
    schema_version: int = INSTRUCTION_SCHEMA_VERSION
    precedence: list[str]
    layers: list[InstructionLayer]
    stage_contexts: V3StageContexts
    instruction_meta: dict[str, Any]


def _brief_body(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
) -> str:
    """The brief and its work order, rendered for a prompt.

    The order here is still the v3 order. Leading with the brief, and reframing
    evidence as the facts you may use rather than the article's reason for
    existing, is A5 and lands with the compose rework.

    The research questions used to be pasted in here. They arrived everywhere
    under a bare `Requirements:` heading with nothing saying what they were,
    and a plan can carry forty-four of them: a judge handed forty-four items
    called requirements marks a draft down for each one missing, and a repair
    pass handed the same list adds them back, one paragraph each, until the
    article is a coverage checklist. That is the mechanism behind #506.

    The outline was the last stage that needed the ids, because it named the
    `requirement_ids` each section served. It no longer does -- the packet says
    what a fact is for, which is the thing a section is actually organized
    around -- so the list has no reader left anywhere.
    """
    references = "\n".join(
        f"- {reference.name} — {reference.role}"
        for reference in work_order.scope.references
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
    ]
    lines += [
        f"This piece fails if: {brief.fails_if}",
        "Context-only references may calibrate a fact or explain significance. "
        "They may never become co-subjects, recurring sections, rankings, or "
        "verdicts, and the approved form may not change.",
    ]
    return "\n".join(lines)


def _evidence_body(evidence: NormalizedEvidence, *, for_compose: bool = False) -> str:
    """The policy, then the records.

    `for_compose` selects the projection without the bibliography. The
    canonical layer keeps the full rendering, because that layer is the run's
    own record of what the evidence was, and groundedness and the readiness
    follow-up read `records_text` directly and are untouched by this.
    """
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
        f"{evidence.compose_records_text if for_compose else evidence.records_text}"
    )


def _packet_facts_body(packet: WritingPacket) -> str:
    """The chosen facts, for the stage that decides where they go.

    Grouped by editorial role rather than by the question that found them.
    Grouping by search group was the previous answer and it inherited the
    research plan's shape: a section per subject researched, which is a
    section per question wearing a different hat. What the outline needs to
    know about a fact is what it is for -- the backbone of the argument, a
    decision the reader has to make, or the detail that makes a place real.

    The reason line travels with each fact. It is the selection saying what
    the article uses this for, which is the only thing that lets a plan put
    two facts in the same section because they do the same job.
    """
    by_role: dict[str, list[str]] = {}
    for fact in packet.facts:
        as_of = f" (as of {fact.as_of})" if fact.as_of else ""
        reason = f"\n    Why it is here: {fact.reason}" if fact.reason else ""
        note = (
            f"\n    The operator looked at this: {fact.operator_note}"
            if fact.operator_note
            else ""
        )
        by_role.setdefault(_ROLE_LABELS.get(fact.role, _ROLE_LABELS[""]), []).append(
            f"- {fact.claim_id} — {fact.text}{as_of} [{fact.confidence}]"
            f"{reason}{note}"
        )

    lines = ["THE FACTS THIS ARTICLE IS BEING WRITTEN FROM"]
    # Label order, not dictionary order, so two runs of the same packet
    # assemble byte-identically and the backbone is read first.
    for label in _ROLE_ORDER:
        if label in by_role:
            lines.extend(("", label, *by_role[label]))
    if not by_role:
        lines.append("- None supplied.")

    notes = _packet_notes(packet)
    if notes:
        lines.extend(("", notes))
    lines.extend(
        (
            "",
            "This is the whole desk. Research found more and a person chose "
            "these; the rest is not a hole to plan around and not work left "
            "undone. Do not plan a section whose subject is what is missing.",
        )
    )
    return "\n".join(lines)


def _packet_notes(packet: WritingPacket) -> str:
    """The limitations attached to those facts, and nothing else.

    Long by design where it needs to be. A caveat is what makes a fact true;
    a packet that dropped it to save characters would be smaller and wrong.
    """
    if not packet.notes:
        return ""
    lines = ["HOW THESE FACTS MAY BE STATED"]
    lines.extend(
        f"- {', '.join(note.claim_ids)}: {note.text}" for note in packet.notes
    )
    return "\n".join(lines)


def _packet_material(packet: WritingPacket) -> str:
    if not packet.supplied_material:
        return ""
    lines = ["MATERIAL THE WRITER ALREADY HAS"]
    lines.extend(
        f"- [{item.kind}] {item.statement}"
        + (f" ({item.note})" if item.note else "")
        for item in packet.supplied_material
    )
    return "\n".join(lines)


def _packet_evidence_body(packet: WritingPacket) -> str:
    """The facts the writer may use, and the rules for using them.

    What is deliberately absent: the research questions, their statuses, their
    gaps, and the claims that were not chosen. Compose used to receive all of
    them under the same heading as the facts -- on run 4a56545b, 10,371
    characters of coverage bookkeeping against 7,225 characters of chosen
    facts, eleven rows of it reading `none kept for this article`. A writer
    handed a list of questions answers questions; the article that comes back
    is shaped like a research plan because it was given one.

    Grounding is unaffected and still reads the whole dossier. This is the
    writer's desk, not the record.
    """
    facts = [
        f"- {fact.claim_id} — {fact.text}"
        + (f" (as of {fact.as_of})" if fact.as_of else "")
        + f" [{fact.confidence}]"
        + (
            f"\n    The operator looked at this: {fact.operator_note}"
            if fact.operator_note
            else ""
        )
        for fact in packet.facts
    ]
    blocks = [
        EVIDENCE_DISPOSITION_POLICY,
        "These records are the only permitted source of fact. Use them exactly: "
        "preserve dates, units, geography, and stated uncertainty. Attribution "
        "is internal to these records. Never carry it into the prose: no "
        "\"sources report\", no \"outlets say\", no \"according to\", no "
        "\"the publication noted\", no naming the outlet, site, or report a "
        "fact came from. Never invent a bridge fact to close a gap. First-hand "
        "material is the writer's own knowledge: state it directly, as fact, "
        "with no attribution, no sourcing language, and no note about how it "
        "was obtained.\n\n"
        "These facts were chosen for this article by a person. They are "
        "available material, not a checklist: a fact you do not need is a fact "
        "you leave out, and using fewer of them well is better than using all "
        "of them badly. Nothing here is owed a sentence except what the brief "
        "itself asks for.",
        "THE FACTS\n" + ("\n".join(facts) if facts else "- None supplied."),
    ]
    blocks.extend(
        block for block in (_packet_notes(packet), _packet_material(packet)) if block
    )
    return "\n\n".join(blocks)


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


def _packet_support_body(packet: WritingPacket) -> str:
    """What the writer had, so the audit does not ask for what it did not.

    The audit used to receive every research question with its status. That
    block existed for a real reason -- on run 95a74dce it read
    `water_refill_points` in the requirements, did not know research had filed
    it unsupported, and told repair to add water-fountain information, which
    repair is forbidden to invent -- and it solved that problem by handing the
    judge a checklist.

    A checklist is what the redesign is removing. An auditor that can see the
    facts a person cut will ask for them back, repair will oblige as far as it
    can, and the editorial cut is undone by the two stages downstream of it.
    So the audit is told the shape of what happened and not its contents: a
    person chose, material outside the draft is not a hole, and the only
    limitations named are the ones that constrain the facts actually used.
    """
    lines = [
        "WHAT THE WRITER HAD",
        f"- {len(packet.facts)} facts, chosen for this article by a person out "
        "of a larger dossier.",
        "- Material that is not in the draft was either never found or "
        "deliberately not chosen. Neither is a hole. Asking for it in "
        "required_revisions asks repair for a fact it is forbidden to invent, "
        "and a revision the stage it is addressed to cannot satisfy is a "
        "revision that fails in every run.",
        "- If something the brief itself promises is genuinely unsupported, "
        "say the article needs more research rather than more writing.",
    ]
    if notes := _packet_notes(packet):
        lines.extend(
            (
                "",
                notes,
                "",
                "A draft that states one of those facts within its limitation "
                "is correct. Do not ask for a flatter, more confident sentence "
                "than the evidence allows.",
            )
        )
    return "\n".join(lines)


def _repair_lock_body(
    brief: ArticleBrief,
    work_order: Prompt2BlogWorkOrder,
    packet: WritingPacket,
    *,
    form_label: str,
) -> str:
    """The scope this repair may not move, and nothing else.

    The research questions used to be pasted here under `Requirements:`. They
    are not scope -- the outcome, spine, reader question, form and `fails_if`
    are -- and repair is separately forbidden to add facts, so the list could
    only ever be read as a checklist to satisfy. See `_brief_body`.
    """
    references = "\n".join(
        f"- {reference.name} — {reference.role}"
        for reference in work_order.scope.references
    )
    must_name = "\n".join(f"- {item}" for item in brief.must_name)
    # Repair rewrites the whole article. A caveat that reached compose and not
    # this pass is a caveat the rewrite can drop without noticing, which turns
    # a correctly hedged sentence into a confident wrong one -- and repair is
    # separately forbidden to add anything, so it could never put it back.
    limitations = _packet_notes(packet)
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
            "Must name:",
            must_name or "- None recorded.",
            f"It fails if: {brief.fails_if}",
            *((limitations,) if limitations else ()),
            "Keep direct, specific prose for the named reader. Preserve the "
            "approved form and scope. Do not add factual material, and do not "
            "remove a limitation from a fact you keep.",
        )
    )


def _stage_context(*, parts: list[tuple[str, str]]) -> StageContext:
    included = [(name, body) for name, body in parts if body]
    text = "\n\n".join(body for _name, body in included)
    return StageContext(
        text=text,
        included_sections=[name for name, _body in included],
        fingerprint=sha256(text.encode("utf-8")).hexdigest(),
        section_sizes={name: len(body) for name, body in included},
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
        )
    }


def assemble_v3_instructions(
    request: Prompt2BlogV4Request,
    packet: WritingPacket,
    *,
    catalog: EditorialCatalog | None = None,
) -> V3InstructionSet:
    """Build canonical layers and job-specific contexts for one brief.

    The packet is required rather than optional. Two ways to reach the writer
    -- one narrow, one from the whole dossier -- is the arrangement where a
    failure in the narrow one silently restores the old behaviour, which is
    the failure this redesign exists to prevent. A run that wants every fact
    says so with `select_everything`, and gets a packet either way.
    """
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
                ("facts", _packet_facts_body(packet)),
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
                    # The reserve is now subtracted before the prompt is built
                    # and arrives as SECTION BUDGET: this rule and the template
                    # used to give the model two different totals and ask it to
                    # reconcile them, which is why run 95a74dce planned 730
                    # against a 900 target, twice.
                    "- The SECTION BUDGET already excludes the opening and the "
                    "closing takeaways, which you do not plan. Budget to it "
                    "exactly; do not subtract anything further.\n"
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
                    f"THE FACTS YOU MAY USE\n{_packet_evidence_body(packet)}",
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
                ("support", _packet_support_body(packet)),
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
                    "COMPACT SCOPE AND STYLE LOCK\n"
                    + _repair_lock_body(
                        brief, work_order, packet, form_label=form.label
                    ),
                ),
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
            "precedence": list(PRECEDENCE),
            "brief_fingerprint": brief.brief_fingerprint,
            "work_order_fingerprint": work_order.work_order_fingerprint,
            "evidence_receipt": evidence.receipt(),
        },
    )
