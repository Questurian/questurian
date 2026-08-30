"""Validated, file-backed editorial catalog owned only by Prompt2Blog v3."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, get_args

from pydantic import BaseModel, ConfigDict, Field

from .config import (
    PROMPT2BLOG_FORMS_DIR,
    PROMPT2BLOG_HEADLINES_FILE,
    PROMPT2BLOG_HOUSE_RULES_FILE,
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


class ArticleFormRule(EditorialRule):
    source_requirements: list[SourceRequirement] = Field(default_factory=list)
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
    )
