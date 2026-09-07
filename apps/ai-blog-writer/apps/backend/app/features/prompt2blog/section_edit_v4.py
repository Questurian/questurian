"""One section, one asked-for improvement, shown before it is applied.

Improvement 07. An editor reading a finished draft can see that one paragraph
hedges where it should choose, and the only tools available were to rewrite it
by hand or to re-run the article. Repair is not that tool: it is driven by an
audit, it fires once per run inside a token budget, and it decides for itself
what to change.

So: pick a section, pick one of a few things to ask for, read the proposal
beside the original, and apply it or throw it away. Everything about the
mechanism is borrowed from the repair work in #547 -- addressed sections, text
hashes, replacements applied in code -- because that machinery already refuses
the two failures that matter, an edit written against an older draft and an
edit that touches prose nobody asked about.

Three things this is not
------------------------
It is not a gate. Nothing runs it, nothing waits for it, and a run that never
uses it is unaffected.

It is not allowed to bring new facts. The edit is shown the frozen packet --
the same facts the writer had -- and nothing else. A request the evidence
cannot support comes back as a refusal with a reason, because the failure mode
of an editor asking for a stronger recommendation is a model inventing the
thing that would make it stronger.

And it is not trusted. The proposal is checked for figures that appear neither
in the original nor anywhere in the packet before a person is shown it, and the
person still has to press apply.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field

from .content.sections import ArticleSection, segment_article
from .dependencies import PipelineDependencies
from .provenance import _figures
from .support import _safe_dict, _safe_str

# Bumped when a stored edit history stops meaning what this code reads.
SECTION_EDIT_SCHEMA_VERSION = 1

# Where an article's edit history lives. Its own row: these are an operator's
# later work on a finished run, and writing them into the pipeline artifact
# would rewrite the record of what the pipeline itself produced.
SECTION_EDIT_STAGE = "stage_v4_section_edits"


# The things an editor actually asks for, as opposed to a free-text box.
#
# A free-text box was the obvious design and it is the wrong one. "Make this
# better" is a request only a model with an opinion can satisfy, and the
# opinion it reaches for is the house style of the internet. Each of these
# names a specific defect and says what fixing it may not cost.
@dataclass(frozen=True)
class EditAction:
    action_id: str
    label: str
    instruction: str


EDIT_ACTIONS: tuple[EditAction, ...] = (
    EditAction(
        action_id="clarify_recommendation",
        label="Make the recommendation clearer",
        instruction=(
            "This section lays out options without saying what separates them. "
            "Say which suits whom and on what basis, using only the facts "
            "supplied. If the facts do not support choosing between them, say "
            "so in `could_not_do` and leave the section alone -- do not invent "
            "the difference that would make a recommendation possible."
        ),
    ),
    EditAction(
        action_id="shorten",
        label="Say it in fewer words",
        instruction=(
            "Cut the words this section does not need. Every figure, date, "
            "qualification and named place in the original must still be there "
            "afterwards: shortening is removing padding, never removing the "
            "limits that change what a reader should do."
        ),
    ),
    EditAction(
        action_id="reduce_repetition",
        label="Stop it repeating itself",
        instruction=(
            "This section explains the same thing more than once, or lists "
            "items whose descriptions run to the same shape. Say each thing "
            "once and vary what the sentences do. Losing a fact is not "
            "de-duplication."
        ),
    ),
    EditAction(
        action_id="strengthen_comparison",
        label="Make the comparison do more work",
        instruction=(
            "This section names things without comparing them. Say what each "
            "is better and worse for, from the supplied facts only. Where the "
            "facts support no comparison on some axis, leave that axis out "
            "rather than asserting one."
        ),
    ),
    EditAction(
        action_id="explain_the_detail",
        label="Explain a detail instead of listing more",
        instruction=(
            "This section stacks facts without saying what any of them mean. "
            "Keep the two or three that carry the point and explain their "
            "significance; the rest may go. Anything under the article's "
            "must_name obligations stays."
        ),
    ),
)

EDIT_ACTIONS_BY_ID = {action.action_id: action for action in EDIT_ACTIONS}


SECTION_EDIT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["revised"],
    "properties": {
        "revised": {"type": "string"},
        "heading": {"type": "string"},
        "what_changed": {"type": "string"},
        # The refusal has to be as easy to return as the rewrite, or a model
        # asked for something impossible writes something instead.
        "could_not_do": {"type": "string"},
    },
}


P2B_SECTION_EDIT_PROMPT = """\
You are editing one section of a finished article, at an editor's request.

Return strict JSON only:
{{
  "revised": "string",
  "what_changed": "string",
  "could_not_do": "string"
}}

What you were asked to do:
{instruction}

Hard rules:
- Change this section and nothing else. You are not shown the rest of the
  article and you are not editing it.
- Every figure, date, price, duration and named place in `revised` must appear
  either in the ORIGINAL SECTION below or in the FACTS AVAILABLE. You may not
  introduce one from anywhere else, and you may not make a figure more precise,
  more recent, or more general than the fact it comes from.
- Keep the limits that change what a reader should do -- an as-of date, a
  season, a route only some operators run. Drop only hedging that changes
  nothing.
- Never cite the facts. No claim IDs, no source names, no "(Source 1)". The
  reader cannot see them.
- If what you were asked for cannot be done with the facts available, put the
  reason in `could_not_do` and return the original text unchanged in `revised`.
  That is a correct answer. Writing something that only looks like what was
  asked for is not.
- `what_changed` is one sentence, for a person deciding whether to keep this.

THE ARTICLE THIS SECTION BELONGS TO:
{brief}

FACTS AVAILABLE (the only facts you may use):
{facts}

ORIGINAL SECTION:
{original}
"""


def _facts_block(packet: dict[str, Any]) -> str:
    """The frozen packet, as the writer received it.

    Whole rather than narrowed to the section. Narrowing would need a guess at
    which facts this section rests on, and a guess that guessed wrong would
    withhold the fact the editor is asking to have explained.
    """
    lines: list[str] = []
    for fact in packet.get("facts") or []:
        record = _safe_dict(fact)
        text = _safe_str(record.get("text"))
        if not text:
            continue
        as_of = _safe_str(record.get("as_of"))
        note = _safe_str(record.get("operator_note"))
        suffix = "".join(
            part
            for part in (
                f" (as of {as_of})" if as_of else "",
                f" [you noted: {note}]" if note else "",
            )
        )
        lines.append(f"- {text}{suffix}")
    for note in packet.get("notes") or []:
        text = _safe_str(_safe_dict(note).get("text"))
        if text:
            lines.append(f"- LIMIT: {text}")
    for material in packet.get("supplied_material") or []:
        statement = _safe_str(_safe_dict(material).get("statement"))
        if statement:
            lines.append(f"- YOUR OWN NOTE, verbatim: {statement}")
    return "\n".join(lines) or "No facts were recorded for this article."


def _brief_block(brief: dict[str, Any]) -> str:
    record = _safe_dict(brief)
    parts = [
        f"Headline: {_safe_str(record.get('seed'))}",
        f"Reader: {_safe_str(_safe_dict(record.get('reader')).get('primary_reader'))}",
        f"Their question: {_safe_str(record.get('reader_question'))}",
        f"What they should be able to do: {_safe_str(record.get('outcome'))}",
        f"It fails if: {_safe_str(record.get('fails_if'))}",
    ]
    must_name = [name for name in (record.get("must_name") or []) if _safe_str(name)]
    if must_name:
        parts.append(f"Must name: {', '.join(must_name)}")
    return "\n".join(parts)


class EditProposal(BaseModel):
    """A change offered, not made."""

    schema_version: int = SECTION_EDIT_SCHEMA_VERSION
    run_id: str
    section_id: str
    heading: str = ""
    action_id: str
    # What the section said when this was proposed. `apply` refuses if it has
    # moved since, so a proposal read on one screen cannot land on another.
    text_hash: str
    original: str
    revised: str
    what_changed: str = ""
    could_not_do: str = ""
    # Figures in the proposal that are in neither the original nor the packet.
    # Deterministic, cheap, and the exact shape of the failure this invites: an
    # editor asks for a stronger recommendation and gets a number that would
    # make one.
    introduced_figures: list[str] = Field(default_factory=list)

    @property
    def changed(self) -> bool:
        return self.revised.strip() != self.original.strip()


def _packet_figures(packet: dict[str, Any]) -> set[str]:
    text = " ".join(
        _safe_str(_safe_dict(fact).get("text")) for fact in packet.get("facts") or []
    )
    material = " ".join(
        _safe_str(_safe_dict(item).get("statement"))
        for item in packet.get("supplied_material") or []
    )
    return _figures(f"{text} {material}")


def find_section(content: str, section_id: str) -> ArticleSection | None:
    for section in segment_article(content):
        if section.section_id == section_id:
            return section
    return None


def propose_section_edit(
    *,
    run_id: str,
    content: str,
    section_id: str,
    action_id: str,
    brief: dict[str, Any],
    packet: dict[str, Any],
    dependencies: PipelineDependencies,
    model_name: str | None = None,
) -> EditProposal:
    """Ask for one change to one section. Nothing is written.

    Raises rather than guessing when the section or the action is not one this
    draft has: an editor who clicked something that no longer exists should be
    told, not handed an edit to a different paragraph.
    """
    action = EDIT_ACTIONS_BY_ID.get(action_id)
    if action is None:
        raise ValueError(f"Unknown edit action '{action_id}'")
    section = find_section(content, section_id)
    if section is None:
        raise ValueError(f"This draft has no section '{section_id}'")

    original = section.render()
    prompt = P2B_SECTION_EDIT_PROMPT.format(
        instruction=action.instruction,
        brief=_brief_block(brief),
        facts=_facts_block(packet),
        original=original,
    )
    parsed, _raw = dependencies.llm.invoke_json(
        job_id="p2b.section_edit",
        prompt=prompt,
        max_tokens=2048,
        temperature=0.2,
        model_name=model_name,
        schema=SECTION_EDIT_SCHEMA,
    )
    record = _safe_dict(parsed)
    revised = _safe_str(record.get("revised")).strip()
    could_not_do = _safe_str(record.get("could_not_do")).strip()
    if not revised:
        # An empty body is far more likely to be a truncated response than a
        # considered cut, and this pass may not delete a section in any case.
        revised = original
        could_not_do = could_not_do or "The edit came back empty, so nothing changed."

    introduced = sorted(
        _figures(revised) - _figures(original) - _packet_figures(packet)
    )
    return EditProposal(
        run_id=run_id,
        section_id=section_id,
        heading=section.heading,
        action_id=action_id,
        text_hash=section.text_hash,
        original=original,
        revised=revised,
        what_changed=_safe_str(record.get("what_changed")),
        could_not_do=could_not_do,
        introduced_figures=introduced,
    )


# ---------------------------------------------------------------------------
# Applying, and taking it back
# ---------------------------------------------------------------------------


class AppliedEdit(BaseModel):
    """One applied edit, and the whole draft as it was before it."""

    section_id: str
    action_id: str
    applied_at: str = ""
    editor: str = ""
    what_changed: str = ""
    # The entire previous markdown, not a patch. Undo has to be exact, and a
    # patch that no longer applies is an undo that silently does not.
    previous_markdown: str = ""


class EditHistory(BaseModel):
    schema_version: int = SECTION_EDIT_SCHEMA_VERSION
    edits: list[AppliedEdit] = Field(default_factory=list)
    # The draft as the pipeline produced it, before any hand edit. Kept
    # separately from the undo stack: the report asks for the original draft to
    # be retained, and an undo stack unwound one step at a time is not that.
    original_markdown: str = ""


@dataclass
class ApplyResult:
    markdown: str
    history: EditHistory
    rejected: list[dict[str, str]] = field(default_factory=list)

    @property
    def applied(self) -> bool:
        return not self.rejected


def apply_proposal(
    *,
    content: str,
    proposal: EditProposal,
    history: EditHistory,
    editor: str,
    now: str,
) -> ApplyResult:
    """Write one accepted proposal into the draft, keeping what it replaced.

    The hash check is the whole safety property: a proposal read on one screen
    while another edit landed on the same section is refused rather than
    applied over the top of it. `apply_section_replacements` already enforces
    that, along with the rules that an edit may not empty a section and may not
    give the opening block a heading.
    """
    from .content.sections import apply_section_replacements

    result = apply_section_replacements(
        content,
        [
            {
                "section_id": proposal.section_id,
                "text_hash": proposal.text_hash,
                "heading": proposal.heading,
                "content": _body_of(proposal.revised, proposal.heading),
            }
        ],
    )
    if not result.changed:
        return ApplyResult(markdown=content, history=history, rejected=result.rejected)

    updated = EditHistory(
        # Recorded on the first hand edit and never again, so "the draft the
        # pipeline produced" survives any number of later edits.
        original_markdown=history.original_markdown or content,
        edits=[
            *history.edits,
            AppliedEdit(
                section_id=proposal.section_id,
                action_id=proposal.action_id,
                applied_at=now,
                editor=editor,
                what_changed=proposal.what_changed,
                previous_markdown=content,
            ),
        ],
    )
    return ApplyResult(markdown=result.content, history=updated)


def _body_of(rendered: str, heading: str) -> str:
    """The prose under a heading, given a section rendered whole.

    The model is shown the section as it appears in the article, heading and
    all, because a heading is part of what it is being asked to judge. The
    replacement machinery wants them apart.
    """
    text = rendered.strip()
    if not heading:
        return text
    first, _, rest = text.partition("\n")
    if first.strip().lstrip("#").strip() == heading.strip():
        return rest.strip()
    return text


def undo_last(history: EditHistory) -> tuple[str, EditHistory] | None:
    """Put the draft back to what it was before the last applied edit.

    Returns None when there is nothing to undo, which the caller reports rather
    than treating as a failure: pressing undo on an unedited draft is not an
    error, it is a question with a plain answer.
    """
    if not history.edits:
        return None
    last = history.edits[-1]
    return last.previous_markdown, EditHistory(
        original_markdown=history.original_markdown,
        edits=history.edits[:-1],
    )
