"""Validated, file-backed editorial catalog owned only by Prompt2Blog v3."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, get_args

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic import ValidationError as PydanticValidationError

from .config import (
    PROMPT2BLOG_FORMS_DIR,
    PROMPT2BLOG_HEADLINES_FILE,
    PROMPT2BLOG_HOUSE_RULES_FILE,
    PROMPT2BLOG_VOICE_FILE,
    PROMPT2BLOG_WRITING_CONVENTIONS_FILE,
    PROMPT2BLOG_TOPIC_MODULES_DIR,
)
from .contracts_v4 import ArticleFormId, TopicModuleId


SourceRequirement = Literal[
    "reported-people-scenes-quotations",
    "attributable-responses",
    "first-person-material",
    "documented-evaluation",
]

FORM_HEADINGS = (
    "## Use when",
    "## Do not use when",
    "## Reader promise",
    "## Required evidence",
    "## Allowed structures",
    "## Failure modes",
    "## Headline note",
)
MODULE_HEADINGS = (
    "## Research questions",
    "## Preferred sources",
    "## Freshness",
    "## Factual limits and gaps",
)


class CatalogModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EditorialRule(CatalogModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    description: str = Field(min_length=1)
    order: int = Field(ge=1)
    instructions: str = Field(min_length=1)


OpeningMode = Literal["direct-answer", "form-led"]
ClosingMode = Literal["takeaways", "form-led"]

# What one section owes the person reading it.
#
# Improvement 01: the outline already carried a `purpose` per section, and
# nothing in the outline prompt ever said what a purpose was. So it came back
# as a restatement of the heading -- "covers transport options" under a heading
# about transport -- and a section could be planned, written and audited
# without anybody naming what a reader gets out of it.
#
# Three kinds, not one, because the report is explicit that this must not turn
# every form into advice. A profile that ends each section with a
# recommendation is a worse profile, and forcing it to would trade one
# formulaic shape for another.
#
# `decision`: the reader can now choose, book, or skip something.
# `answer`:   a question the reader arrived with is now settled.
# `insight`:  the reader understands something about the subject they did not.
PayoffMode = Literal["decision", "answer", "insight"]

# What the outline is asked for, and what the audit checks was delivered, in
# each mode's own words. Kept next to the mode rather than in the prompt files
# so the planning stage, the writing stage and the auditor cannot describe the
# same obligation three different ways.
PAYOFF_NOUNS: dict[str, str] = {
    "decision": "decision the reader can make",
    "answer": "question the reader arrived with, answered",
    "insight": "thing the reader now understands about the subject",
}

PAYOFF_PLANNING_RULES: dict[str, str] = {
    "decision": (
        "one decision this section leaves the reader able to make -- what they "
        "can now choose, book, skip or budget for, and on what basis"
    ),
    "answer": (
        "one question this section settles for the reader, phrased as the "
        "question they arrived with rather than as the topic it falls under"
    ),
    "insight": (
        "one thing this section leaves the reader understanding about the "
        "subject that they did not understand before it. Not a recommendation: "
        "this form does not give advice, and a section that ends in one is "
        "doing the wrong job"
    ),
}

# The floor under `min_sections`. Below two there is no structure to plan and
# `sections_changed` has nothing to scope a repair to.
ABSOLUTE_MIN_SECTIONS = 2
ABSOLUTE_MAX_SECTIONS = 12


class FormStructurePolicy(CatalogModel):
    """How one article form is allowed to be shaped.

    Finding 07: every article was required to open with a 40-60 word direct
    answer, carry at least three `##` headings, and close with takeaways --
    rules written into the compose prompt, the outline schema and the outline
    validator, all three of them blind to which form was approved. A service
    guide wants exactly that shape. A profile, an essay and a Q&A do not, and
    being marked down for not having it is what turned different briefs into
    the same article.

    Declared in each form's own frontmatter, so the form that says how a piece
    is organized is also where its organization is written down, and resolved
    once per run into the frozen instruction meta so outline, compose and the
    deterministic checks read the same policy -- including after a resume.
    """

    opening: OpeningMode
    closing: ClosingMode
    min_sections: int = Field(ge=ABSOLUTE_MIN_SECTIONS, le=ABSOLUTE_MAX_SECTIONS)
    max_sections: int = Field(ge=ABSOLUTE_MIN_SECTIONS, le=ABSOLUTE_MAX_SECTIONS)
    # Defaulted on the model, required in the frontmatter. Those are different
    # jobs: `_structure_policy` refuses a form file that omits it, so no form
    # can quietly acquire a payoff kind it did not choose, while a run frozen
    # before this existed still validates and resumes into the shape it was
    # written under.
    payoff: PayoffMode = "decision"

    @model_validator(mode="after")
    def _range_is_a_range(self) -> "FormStructurePolicy":
        if self.min_sections > self.max_sections:
            raise ValueError("min_sections cannot exceed max_sections")
        return self

    def opening_rule(self) -> str:
        if self.opening == "direct-answer":
            return (
                "- Open with a direct 40-60 word answer to the core reader "
                "question, before the first `##` heading. The reader came for "
                "that answer; everything after it is the support."
            )
        return (
            "- Open the way this form opens. Use one of its allowed structures "
            "and start on something concrete and supported -- a scene, a "
            "figure, the claim you are about to argue. Do not bolt a "
            "question-and-answer box onto a piece that is not answering a "
            "lookup question, and do not warm up before the point either."
        )

    def closing_rule(self) -> str:
        if self.closing == "takeaways":
            return (
                "- Close with a concise takeaway section. It synthesises "
                "decisions the article already supported, in fresh wording "
                "rather than copied sentences. Never let a material fact, "
                "figure, or place appear there for the first time."
            )
        return (
            "- End where the piece ends. This form does not take a takeaways "
            "list, and appending one to reach a familiar shape weakens it. "
            "The close still lands somewhere; it does not summarise."
        )

    def sections_rule(self) -> str:
        return (
            f"- Use between {self.min_sections} and {self.max_sections} `##` "
            "headings, as many as the material actually divides into. The "
            "count is a range, not a target to hit."
        )

    def payoff_noun(self) -> str:
        return PAYOFF_NOUNS[self.payoff]

    def outline_payoff_rule(self) -> str:
        return (
            f"- `reader_payoff` is the point of the section. Write "
            f"{PAYOFF_PLANNING_RULES[self.payoff]}. One sentence, in the "
            "reader's terms. It is not a summary of what the section covers: "
            "a heading already says that, and repeating it back is how a "
            "section gets planned without ever earning its place."
        )

    def compose_payoff_rule(self) -> str:
        return (
            "- Each planned section states what the reader gets from it. That "
            f"is the {self.payoff_noun()}, and the section has not done its "
            "job until the prose actually delivers it -- not gestured at it, "
            "and not left the reader to work it out from the facts. Where the "
            "evidence cannot support the payoff as planned, say what it does "
            "support and what is missing; do not manufacture the payoff."
        )

    def compose_rules(self) -> str:
        """The structural obligations for one form, for the compose prompt."""
        return "\n".join(
            (
                self.opening_rule(),
                self.sections_rule(),
                self.compose_payoff_rule(),
                self.closing_rule(),
                "- Structure is the form's to decide and the evidence rules "
                "are not. A form never licenses an invented scene, quotation, "
                "voice, or detail to fill the shape it asks for.",
            )
        )

    def outline_rules(self) -> str:
        """The same policy, said to the stage that plans rather than writes."""
        opening = (
            "The article opens with a direct 40-60 word answer, which you do "
            "not plan as a section: put its subject in `direct_answer_focus`."
            if self.opening == "direct-answer"
            else "This form does not use a direct-answer opening. Leave "
            "`direct_answer_focus` empty and let the first section open the "
            "piece the way the form's allowed structures do."
        )
        closing = (
            "The article closes with takeaways, which you also do not plan as "
            "a section: put their subject in `takeaway_focus`."
            if self.closing == "takeaways"
            else "This form does not close with takeaways. Leave "
            "`takeaway_focus` empty."
        )
        return "\n".join(
            (
                f"- Plan at least {self.min_sections} and at most "
                f"{self.max_sections} sections.",
                f"- {opening}",
                f"- {closing}",
                self.outline_payoff_rule(),
            )
        )


DEFAULT_STRUCTURE_POLICY = FormStructurePolicy(
    opening="direct-answer",
    closing="takeaways",
    min_sections=3,
    max_sections=12,
)


class ArticleFormRule(EditorialRule):
    source_requirements: list[SourceRequirement] = Field(default_factory=list)
    structure: FormStructurePolicy
    # The direction step used to choose a form from `description` alone — one
    # summary line each. "Where to eat in Lima right now" became a News Report
    # because "reports a timely development" is a fair reading of "right now",
    # and the two sections that would have redirected it were sitting unread in
    # the same file. They ship to the chooser now.
    use_when: str = Field(min_length=1)
    do_not_use_when: str = Field(min_length=1)


class EditorialMetadataOption(CatalogModel):
    id: str
    label: str
    description: str


class EditorialCatalog(CatalogModel):
    schema_version: Literal[3] = 3
    forms: list[ArticleFormRule]
    topic_modules: list[EditorialRule]
    audience_tags: list[EditorialMetadataOption]
    scope_modes: list[EditorialMetadataOption]
    reference_roles: list[EditorialMetadataOption]
    house_rules: EditorialRule
    headline_rules: EditorialRule
    # What Questurian is like, and the conventions that cannot be inferred from
    # it. Both are always loaded and neither is a choice (ADR 0032). Until now
    # nothing read them: across all the writing instruction in the system there
    # were 41 prohibitions and not one sentence describing what a good piece
    # is, which is why bans could never fix the register.
    voice: EditorialRule
    writing_conventions: EditorialRule

    def public_metadata(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "forms": [
                {
                    "id": item.id,
                    "label": item.label,
                    "description": item.description,
                    "order": item.order,
                    "source_requirements": item.source_requirements,
                    "use_when": item.use_when,
                    "do_not_use_when": item.do_not_use_when,
                    "structure": item.structure.model_dump(),
                }
                for item in self.forms
            ],
            "topic_modules": [
                {
                    "id": item.id,
                    "label": item.label,
                    "description": item.description,
                    "order": item.order,
                }
                for item in self.topic_modules
            ],
            "audience_tags": [item.model_dump() for item in self.audience_tags],
            "scope_modes": [item.model_dump() for item in self.scope_modes],
            "reference_roles": [item.model_dump() for item in self.reference_roles],
        }


AUDIENCE_TAGS = [
    EditorialMetadataOption(
        id="first-time-visitor",
        label="First-time visitor",
        description="Needs orientation and unfamiliar terms explained.",
    ),
    EditorialMetadataOption(
        id="solo-traveler",
        label="Solo traveler",
        description="Needs decisions framed for one traveler.",
    ),
    EditorialMetadataOption(
        id="family",
        label="Family",
        description="Needs family-relevant logistics and tradeoffs.",
    ),
    EditorialMetadataOption(
        id="remote-worker-relocator",
        label="Remote worker/relocator",
        description="Needs long-stay and remote-work implications.",
    ),
    EditorialMetadataOption(
        id="accessibility-needs",
        label="Accessibility needs",
        description="Needs specific accessibility evidence and limits.",
    ),
    EditorialMetadataOption(
        id="budget-focused",
        label="Budget-focused",
        description="Prioritizes costs, value, and avoidable expenses.",
    ),
    EditorialMetadataOption(
        id="premium-focused",
        label="Premium-focused",
        description="Prioritizes service, comfort, and premium tradeoffs.",
    ),
]

SCOPE_MODES = [
    EditorialMetadataOption(
        id="single_subject",
        label="Single subject",
        description="One primary subject; other references provide context only.",
    ),
    EditorialMetadataOption(
        id="head_to_head",
        label="Head to head",
        description="Primary subject and named comparators share comparison scope.",
    ),
    EditorialMetadataOption(
        id="ranked_set",
        label="Ranked set",
        description="A defined set is evaluated against consistent criteria.",
    ),
]

REFERENCE_ROLES = [
    EditorialMetadataOption(
        id="primary_subject",
        label="Primary subject",
        description="The article's controlling subject.",
    ),
    EditorialMetadataOption(
        id="context_only",
        label="Context only",
        description="May calibrate evidence but cannot organize the article.",
    ),
    EditorialMetadataOption(
        id="comparator",
        label="Comparator",
        description="An approved co-subject in comparison scope.",
    ),
]


def _parse_rule_file(path: Path) -> tuple[dict[str, str], str]:
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise RuntimeError(f"Unable to read editorial rule file: {path}") from exc

    if not content.startswith("---\n"):
        raise ValueError(f"Editorial rule file lacks frontmatter: {path}")
    parts = content.split("---", 2)
    if len(parts) != 3:
        raise ValueError(f"Editorial rule file has malformed frontmatter: {path}")

    metadata: dict[str, str] = {}
    for line in parts[1].strip().splitlines():
        if ":" not in line:
            raise ValueError(f"Malformed frontmatter line in {path}: {line}")
        key, value = line.split(":", 1)
        key = key.strip()
        if key in metadata:
            raise ValueError(f"Duplicate frontmatter key '{key}' in {path}")
        metadata[key] = value.strip().strip("\"'")
    return metadata, parts[2].strip()


def _rule_section(body: str, heading: str) -> str:
    """The prose under one `## Heading`, up to the next one.

    Callers must have already checked the heading exists; `_load_rule_directory`
    validates every required heading before this runs.
    """
    section = body.split(heading, 1)[1]
    return section.split("\n## ", 1)[0].strip()


def _structure_policy(metadata: dict[str, str], path: Path) -> FormStructurePolicy:
    """Read `opening`, `sections`, `closing` and `payoff` off a form's frontmatter.

    Loudly. A malformed range or an unknown mode fails the catalog load, which
    fails at import in every test rather than producing an article shaped by a
    silently substituted default.
    """
    raw_range = metadata["sections"]
    try:
        low, high = (int(part) for part in raw_range.split("-", 1))
    except ValueError as exc:
        raise ValueError(
            f"Form section range must be 'min-max': {path} ({raw_range!r})"
        ) from exc
    try:
        return FormStructurePolicy(
            opening=metadata["opening"],
            closing=metadata["closing"],
            min_sections=low,
            max_sections=high,
            payoff=metadata["payoff"],
        )
    except PydanticValidationError as exc:
        raise ValueError(f"Invalid structure policy in {path}: {exc}") from exc


def _load_rule_directory(
    directory: Path,
    *,
    expected_ids: tuple[str, ...],
    headings: tuple[str, ...],
    word_range: tuple[int, int],
    forms: bool,
) -> list[EditorialRule]:
    files = sorted(directory.glob("*.md"))
    actual_filenames = {path.stem for path in files}
    if actual_filenames != set(expected_ids):
        missing = sorted(set(expected_ids) - actual_filenames)
        extra = sorted(actual_filenames - set(expected_ids))
        raise ValueError(
            f"Editorial catalog file mismatch: missing={missing}, extra={extra}"
        )

    rules: list[EditorialRule] = []
    for path in files:
        metadata, body = _parse_rule_file(path)
        required_keys = {"id", "label", "summary", "order"}
        # A form that does not declare its own structure would silently take
        # somebody else's, which is finding 07 with an extra step. Required,
        # not defaulted.
        if forms:
            required_keys |= {"opening", "sections", "closing", "payoff"}
        missing_keys = required_keys - metadata.keys()
        extra_keys = metadata.keys() - required_keys - {"source_gate"}
        if missing_keys or extra_keys:
            raise ValueError(
                f"Invalid frontmatter keys in {path}: "
                f"missing={sorted(missing_keys)}, extra={sorted(extra_keys)}"
            )
        if metadata["id"] != path.stem:
            raise ValueError(f"Editorial rule id must match filename: {path}")
        missing_headings = [heading for heading in headings if heading not in body]
        if missing_headings:
            raise ValueError(f"Missing required sections in {path}: {missing_headings}")
        word_count = len(body.split())
        if not word_range[0] <= word_count <= word_range[1]:
            raise ValueError(
                f"Editorial rule word count outside {word_range}: {path} ({word_count})"
            )

        base = {
            "id": metadata["id"],
            "label": metadata["label"],
            "description": metadata["summary"],
            "order": int(metadata["order"]),
            "instructions": body,
        }
        if forms:
            source_gate = metadata.get("source_gate")
            rules.append(
                ArticleFormRule(
                    **base,
                    source_requirements=[source_gate] if source_gate else [],
                    use_when=_rule_section(body, "## Use when"),
                    do_not_use_when=_rule_section(body, "## Do not use when"),
                    structure=_structure_policy(metadata, path),
                )
            )
        else:
            if "source_gate" in metadata:
                raise ValueError(f"Topic module cannot declare source_gate: {path}")
            rules.append(EditorialRule(**base))

    rules.sort(key=lambda item: item.order)
    if [item.id for item in rules] != list(expected_ids):
        raise ValueError("Editorial catalog order does not match approved inventory")
    return rules


def _load_shared_rule(path: Path, *, expected_id: str) -> EditorialRule:
    metadata, body = _parse_rule_file(path)
    if metadata.get("id") != expected_id or not body:
        raise ValueError(f"Invalid shared editorial rule: {path}")
    try:
        order = int(metadata["order"])
        label = metadata["label"]
        description = metadata["summary"]
    except (KeyError, ValueError) as exc:
        raise ValueError(f"Invalid shared editorial rule metadata: {path}") from exc
    return EditorialRule(
        id=expected_id,
        label=label,
        description=description,
        order=order,
        instructions=body,
    )


@lru_cache(maxsize=1)
def load_editorial_catalog() -> EditorialCatalog:
    forms = _load_rule_directory(
        PROMPT2BLOG_FORMS_DIR,
        expected_ids=get_args(ArticleFormId),
        headings=FORM_HEADINGS,
        word_range=(250, 500),
        forms=True,
    )
    topic_modules = _load_rule_directory(
        PROMPT2BLOG_TOPIC_MODULES_DIR,
        expected_ids=get_args(TopicModuleId),
        headings=MODULE_HEADINGS,
        word_range=(100, 250),
        forms=False,
    )
    return EditorialCatalog(
        forms=forms,
        topic_modules=topic_modules,
        audience_tags=AUDIENCE_TAGS,
        scope_modes=SCOPE_MODES,
        reference_roles=REFERENCE_ROLES,
        house_rules=_load_shared_rule(
            PROMPT2BLOG_HOUSE_RULES_FILE, expected_id="house-rules"
        ),
        headline_rules=_load_shared_rule(
            PROMPT2BLOG_HEADLINES_FILE, expected_id="headlines"
        ),
        voice=_load_shared_rule(
            PROMPT2BLOG_VOICE_FILE, expected_id="questurian-voice"
        ),
        writing_conventions=_load_shared_rule(
            PROMPT2BLOG_WRITING_CONVENTIONS_FILE, expected_id="writing-conventions"
        ),
    )
