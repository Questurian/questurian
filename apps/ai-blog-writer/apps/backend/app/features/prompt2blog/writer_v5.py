"""One assignment in, one article out.

Everything the old graph did between the brief and the finished piece -- plan,
research, structure, select, outline, compose, ground, audit, repair, settle --
happens inside a single research-capable call here (ADR 0036). This module owns
the two things left on this side of it: sending the frozen prompt, and reading
the reply.

The reading is deterministic and cheap on purpose. The old pipeline paid a model
to re-shape output that did not parse, and a formatting loop that costs a
writing-model call is a formatting loop that eventually costs an article. A
reply that will not split cleanly is kept whole with the problem named on it, so
a person sees the words that were paid for.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any, Protocol

from .support import _safe_str
from .writer_prompt import RESEARCH_NOTE_HEADING, WriterPrompt

logger = logging.getLogger(__name__)

# The heading the prompt asks for, matched at the start of a line, with any
# amount of trailing whitespace. Case-insensitive because a model that returns
# "## Research Note" has done what was asked, and refusing that would be a
# formatting loop over a capital letter.
_NOTE_PATTERN = re.compile(
    r"^\s*" + re.escape(RESEARCH_NOTE_HEADING) + r"\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# A leading `# Headline` line. The writer is asked for a headline that describes
# what it wrote (ADR 0036 supersedes 0034 on this point), and a markdown H1 is
# what it returns it as.
_HEADLINE_PATTERN = re.compile(r"^\s*#\s+(?P<headline>\S.*?)\s*$", re.MULTILINE)


class WriterRefused(RuntimeError):
    """Claude answered, and the answer is not an article.

    Carries the reply. A run that fails here has already been paid for, so the
    words have to reach a person even when nothing can be done with them
    automatically.
    """

    def __init__(self, reason: str, raw: str) -> None:
        self.reason = reason
        self.raw = raw
        super().__init__(reason)


@dataclass(frozen=True)
class WriterDraft:
    """What came back, split as far as it safely splits.

    `raw` is always the whole reply. Every other field is derived from it and
    may be empty; nothing here is authoritative over the text that was actually
    returned, because a parser that quietly drops half an article is worse than
    one that admits it could not read it.
    """

    headline: str
    article_markdown: str
    research_note: str
    raw: str
    # What could not be read cleanly, in a sentence a person can act on. Empty
    # when the reply split as asked.
    parse_issue: str


@dataclass(frozen=True)
class WriterOutcome:
    """One attempt: the draft, and everything true about how it was made."""

    draft: WriterDraft
    served_model: str
    requested_model: str
    effort: str
    turns: int | None
    elapsed_seconds: float | None
    cost_usd: float | None
    usage: dict[str, Any]
    tool_denials: list[str]


class ResearchWriter(Protocol):
    """The transport, narrowed to what this module uses.

    A Protocol rather than the module itself so a test can drive the whole
    writing step without a subprocess, and so the one place that can reach the
    open web is named in the type of anything that asks for it.
    """

    def __call__(
        self, *, prompt: str, model_name: str | None = None
    ) -> dict[str, Any]: ...


def parse_writer_output(raw: str) -> WriterDraft:
    """Split the reply into headline, article and research note.

    Three failure shapes are handled rather than refused, because each one still
    contains an article somebody paid for:

    * no `## Research note` heading -- the whole reply is the article and the
      note is empty, said out loud rather than inferred.
    * more than one -- the first is the boundary and the rest is note, since a
      second heading is far more likely to be the writer's own sub-heading
      inside the note than a second article.
    * no headline -- an article without an H1 is an article, and the operator
      names it at staging.

    A reply with no prose at all is the one case that raises: there is nothing
    to keep.
    """
    text = (raw or "").strip()
    if not text:
        raise WriterRefused("The writer returned nothing at all.", raw or "")

    issues: list[str] = []

    matches = list(_NOTE_PATTERN.finditer(text))
    if not matches:
        body, note = text, ""
        issues.append(
            "The writer did not return a separate research note, so no sources "
            "were listed. The article is below in full."
        )
    else:
        body = text[: matches[0].start()].rstrip()
        note = text[matches[0].end() :].strip()
        if len(matches) > 1:
            issues.append(
                f"The reply had {len(matches)} research-note headings. Everything "
                "after the first is being kept as the note."
            )
        if not note:
            issues.append("The research note heading was returned empty.")

    headline_match = _HEADLINE_PATTERN.search(body)
    if headline_match:
        headline = headline_match.group("headline").strip()
        article = (
            body[: headline_match.start()] + body[headline_match.end() :]
        ).strip()
    else:
        headline = ""
        article = body
        issues.append("The writer returned no headline, so this one is untitled.")

    if not article:
        raise WriterRefused(
            "The reply contained a research note and no article.", text
        )

    return WriterDraft(
        headline=headline,
        article_markdown=article,
        research_note=note,
        raw=text,
        parse_issue=" ".join(issues),
    )


def write_article(
    prompt: WriterPrompt,
    writer: ResearchWriter,
    *,
    model_name: str = "claude-opus-5-high",
) -> WriterOutcome:
    """Send the frozen assignment and read what comes back.

    The prompt is sent exactly as stored. Nothing is appended here -- no voice
    file, no house rules, no anti-AI block -- because the text the operator read
    before pressing the button is the contract this function keeps.

    The model is named rather than defaulted from a routing table so a receipt
    can say what was asked for as well as what answered, and a substitution
    shows up as a difference between the two instead of disappearing.
    """
    reply = writer(prompt=prompt.text, model_name=model_name)

    draft = parse_writer_output(_safe_str(reply.get("text")))
    served = _safe_str(reply.get("modelName"))
    if served and model_name and not _same_family(served, model_name):
        # Not a failure. A run that produced an article on a substituted model
        # is still an article, and hiding the substitution is what made every
        # v4 receipt say Opus while Flash wrote the piece.
        logger.warning(
            "Prompt2Blog writer substituted",
            extra={"asked_for": model_name, "served": served},
        )

    usage = reply.get("usage")
    return WriterOutcome(
        draft=draft,
        served_model=served,
        requested_model=model_name,
        effort=_safe_str(reply.get("effort")),
        turns=reply.get("turns") if isinstance(reply.get("turns"), int) else None,
        elapsed_seconds=(
            float(reply["elapsedSeconds"])
            if isinstance(reply.get("elapsedSeconds"), (int, float))
            else None
        ),
        cost_usd=(
            float(reply["costUsd"])
            if isinstance(reply.get("costUsd"), (int, float))
            else None
        ),
        usage=usage if isinstance(usage, dict) else {},
        tool_denials=[
            item for item in (reply.get("toolDenials") or []) if isinstance(item, str)
        ],
    )


def research_writer() -> ResearchWriter:
    """The real transport, resolved through the model registry.

    Deferred behind a function so importing this module does not pull in the
    provider stack, and so a test drives `write_article` with a plain callable
    rather than a monkeypatched module.
    """
    from app.shared.model_calls import research_text

    def call(*, prompt: str, model_name: str | None = None) -> dict[str, Any]:
        return research_text("p2b.write", prompt=prompt, model=model_name)

    return call


def _same_family(served: str, requested: str) -> bool:
    """Whether the model that answered is the one that was asked for.

    Compared on the family word rather than the exact string, because the
    request carries an effort suffix the served name never does and the served
    name carries a date the request never does. `claude-opus-5-high` asking and
    `claude-opus-5-20260101` answering is not a substitution.
    """
    family = requested.split("-")[1] if "-" in requested else requested
    return family.casefold() in served.casefold()
