"""What one research request is looking for, worked out before anything is bought.

The first version of this step had no brief. It had a prompt template with four
fixed directions in it -- the menu, the preparation, the customers, the room --
and it sent all four every time, including when the operator had asked one
narrow follow-up question. A gap request that said "find me a dated customer
review" also asked for the room and the street, and the reply spent its length
on the room.

A brief is the fix, and it is deliberately not a model call. Everything in it
is derivable: the identity comes from Google, the questions come from the list's
own standard, the leads come from the searches that found this place and from
links the operator pasted. Paying a model to restate what is already written
down is how a pipeline acquires a stage nobody can predict.

What a brief separates that the old prompt merged
-------------------------------------------------
**A lead from a fact.** A discovery search saying "famous for its wings" is why
this place is on the list. It is not evidence of anything, and the brief carries
it under its own heading with the angle that produced it, so the reply can be
asked to *check* it rather than repeat it.

**A discovery source pool from a citation.** Nine searches returned nine pools
of URLs, each pool belonging to a multi-place search. Nothing in a pool says
which URL is about which place. They are pages worth looking at; they are never
attribution, and this module never turns one into one.

**A list question from a claim question.** "Is this place right for a wings
list" and "what is published about its wings" are different questions. Only the
second is research. The first is the operator's, and the brief says so by
keeping the standard as context rather than as something to answer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Bumped when the wording or the structure below changes in a way that would
# produce a different request. Recorded on the attempt beside the prompt
# version, so "the same question" means the same brief as well as the same
# prompt template.
BRIEF_VERSION = "research-brief/1"

# How many of each kind of thing reaches the prompt. Bounds, not targets: a
# prompt carrying forty leads is a prompt whose real question is buried.
MAX_LEADS = 8
MAX_HELD = 25
MAX_SOURCE_LEADS = 10
MAX_QUESTIONS = 6


@dataclass(frozen=True)
class SourceLead:
    """A page worth looking at, and why anybody thinks so.

    `origin` is the whole point. A link the operator pasted, a link a prior
    audit noted and a URL that appeared in a multi-place discovery pool are
    three different strengths of suggestion, and the one thing none of them is
    is a citation. Promotion to evidence happens after the page has been read
    and its identity matched -- never here, and never by position in a list.
    """

    url: str
    origin: str
    note: str = ""


@dataclass(frozen=True)
class DiscoveryLead:
    """One time a discovery search returned this place, with what it said.

    The angle is carried because it is the reason this place is a candidate,
    and because it tells the request where to dig: a place returned by "still
    serving wings after midnight" wants its late hours checked, where one
    returned by "ají amarillo instead of Buffalo sauce" wants its sauces
    checked. The old prompt passed the snippet and dropped the angle, so both
    of those became the same request.
    """

    snippet: str
    angle: str = ""
    attempt_id: str = ""
    status: str = "unverified_lead"

    def line(self) -> str:
        where = f" [from: {self.angle}]" if self.angle else ""
        return f"{self.snippet}{where}"


@dataclass(frozen=True)
class HeldFinding:
    """Something the profile already holds, offered as a lead to verify.

    Not authoritative input. A finding from an earlier pass was produced by the
    same kind of call this one is, and several of them are exactly what this
    work exists to re-check. Discarded findings are not here at all: a person
    threw them out, and reintroducing them as context is how a rejected claim
    walks back in wearing the profile's own authority.
    """

    text: str
    version: int = 1
    curation: str = "unreviewed"
    attributed: bool = False

    def line(self) -> str:
        mark = "attributed" if self.attributed else "unattributed"
        return f"{self.text} [v{self.version}, {self.curation}, {mark}]"


@dataclass
class ResearchBrief:
    """The whole request, decided before any of it is bought."""

    # Identity, as Google holds it plus whatever else this place is called.
    name: str
    aliases: list[str] = field(default_factory=list)
    city: str = ""
    district: str = ""
    address: str = ""
    place_id: str = ""

    # The list this is for. Context, never a question to answer.
    article_title: str = ""
    topic: str = ""
    topic_label: str = ""
    standard: str = ""
    exclusions: str = ""

    mode: str = "initial"
    gap_text: str = ""

    # The words this list's own searches use for its subject -- `alitas` for a
    # chicken-wings list written about Lima. Derived from the run's stored
    # search evidence, never translated: see `review_selection`. Used to ask
    # the reviews API for the reviews about the subject rather than the
    # reviews about the bar, and to rank what comes back.
    subject_terms: list[str] = field(default_factory=list)

    priority_questions: list[str] = field(default_factory=list)
    known_source_leads: list[SourceLead] = field(default_factory=list)
    illustrative_queries: list[str] = field(default_factory=list)
    discovery_leads: list[DiscoveryLead] = field(default_factory=list)
    held: list[HeldFinding] = field(default_factory=list)
    scope_notes: list[str] = field(default_factory=list)
    completion_criteria: list[str] = field(default_factory=list)

    version: str = BRIEF_VERSION

    @property
    def published_name(self) -> str:
        """The shortest name this place is known by.

        Google's name often carries the branch in it -- "BarBarian Bonilla 108"
        -- and the press writes about "BarBarian". Searching only the long one
        finds delivery aggregators, which is how a well-known bar came back
        with three of them and no food writing.
        """
        options = [self.name, *[alias for alias in self.aliases if alias.strip()]]
        return min([option for option in options if option] or [self.name], key=len)

    def as_dict(self) -> dict:
        return {
            "version": self.version,
            # One sentence for the button, before it is pressed. A request
            # whose intent cannot be said in a sentence is one nobody can
            # authorise.
            "intent": self.intent_line(),
            "name": self.name,
            "aliases": list(self.aliases),
            "published_name": self.published_name,
            "city": self.city,
            "district": self.district,
            "address": self.address,
            "place_id": self.place_id,
            "article_title": self.article_title,
            "topic": self.topic,
            "topic_label": self.topic_label,
            "standard": self.standard,
            "exclusions": self.exclusions,
            "mode": self.mode,
            "gap_text": self.gap_text,
            "subject_terms": list(self.subject_terms),
            "priority_questions": list(self.priority_questions),
            "known_source_leads": [
                {"url": lead.url, "origin": lead.origin, "note": lead.note}
                for lead in self.known_source_leads
            ],
            "illustrative_queries": list(self.illustrative_queries),
            "discovery_leads": [
                {
                    "snippet": lead.snippet,
                    "angle": lead.angle,
                    "attempt_id": lead.attempt_id,
                    "status": lead.status,
                }
                for lead in self.discovery_leads
            ],
            "held": [
                {
                    "text": item.text,
                    "version": item.version,
                    "curation": item.curation,
                    "attributed": item.attributed,
                }
                for item in self.held
            ],
            "scope_notes": list(self.scope_notes),
            "completion_criteria": list(self.completion_criteria),
        }

    def intent_line(self) -> str:
        """One sentence for the button, before it is pressed.

        The screen shows this and nothing else until somebody expands it. A
        request whose intent cannot be said in a sentence is one nobody can
        authorise.
        """
        if self.mode == "gap" and self.gap_text.strip():
            return f"Answer one question: {self.gap_text.strip()}"
        subject = self.topic_label or self.topic or "this list's subject"
        verb = "Re-check" if self.mode == "refresh" else "Check"
        return (
            f"{verb} {self.published_name}'s {subject}: what is regularly offered, "
            f"how it is made, and what named people have said about it."
        )


def _clean(value: object, limit: int = 400) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _priority_questions(
    *, topic_label: str, mode: str, gap_text: str
) -> list[str]:
    """What this request is actually trying to settle, in order.

    A gap request has exactly one. Anything else gets the standing three, which
    are the three the list's own standard is written in terms of: is the thing
    regularly offered, what is distinctive about how it is done, and has any
    identifiable person said anything about it.

    Price is a fourth and is deliberately lower: a price supports a claim about
    value and does not on its own say a place belongs on the list. The room,
    the history and the staff are not here at all -- they are collectable, and
    the brief says separately that collecting them does not count as coverage.
    """
    subject = topic_label or "the subject"
    if mode == "gap" and gap_text.strip():
        return [_clean(gap_text)]
    return [
        f"Is {subject} a regular, current item here -- on the menu now, not a "
        "one-off special or an old listing?",
        f"What is distinctive about how {subject} is done here: the "
        "preparation, the sauces, the flavours, the portion?",
        f"Has any identifiable person -- a named reviewer, a dated customer "
        f"review, a local food writer -- said something specific about "
        f"{subject} here?",
        f"What does {subject} cost, on which channel, and as of when?",
    ][:MAX_QUESTIONS]


def _illustrative_queries(
    *, name: str, published: str, district: str, topic_label: str, mode: str,
    gap_text: str,
) -> list[str]:
    """Search strings offered as guidance, and labelled as guidance.

    Google's grounding tool chooses its own queries. Nothing in this pipeline
    executes these, and a screen that prints them as what ran would be claiming
    coverage nobody proved -- so they are called illustrative here, stored
    apart from the provider's reported queries, and shown under a heading that
    says which is which.

    Local language first, and the Google display name is not repeated into
    every string: the first real run searched the full branch name eighteen
    times and found aggregators.
    """
    subject = topic_label or "the subject"
    where = f" {district}" if district else ""
    queries = [
        f"{published} carta {subject}",
        f"{published}{where} {subject} reseña",
        f'"{name}" menú {subject}',
        f"{published}{where} opinión clientes {subject}",
        f"{published} {subject} review",
    ]
    if mode == "gap" and gap_text.strip():
        queries.insert(0, f"{published} {_clean(gap_text, 120)}")
    return queries[:6]


def _scope_notes(*, name: str, place_id: str, address: str, district: str) -> list[str]:
    return [
        f"This is one branch: {address or district or 'the address above'}. "
        f"Identity reference {place_id or '(none)'}.",
        "A price, a portion or an observation from another branch is about "
        "that branch. It never becomes a brand-wide fact by being relabelled.",
        "A delivery-platform price is a delivery price. It is not the dine-in "
        "price and the two are not averaged.",
        f"A page whose title names a different district is not rejected on the "
        f"title. Check the address on the page against {address or 'this one'}.",
        "Anything about the room, the street or the history may be collected "
        "and does not count as coverage of the subject.",
    ]


def _completion_criteria(topic_label: str) -> list[str]:
    subject = topic_label or "the subject"
    return [
        f"At least one directly read page showing {subject} as a current, "
        "regular item, with the passage that says so.",
        f"At least one attributable statement about {subject} from somebody "
        "other than the business -- a named reviewer, a dated customer review, "
        "a local food writer -- with its date.",
        "Every claim carries a source record that was actually collected, and "
        "a passage from that source that supports it.",
        "Anything that could not be reached is recorded as inaccessible rather "
        "than guessed at.",
    ]


def build_brief(
    *,
    name: str,
    aliases: list[str],
    city: str,
    district: str,
    address: str,
    place_id: str,
    article_title: str,
    topic: str,
    topic_label: str,
    standard: str,
    exclusions: str,
    mode: str,
    gap_text: str,
    discovery_leads: list[DiscoveryLead],
    held: list[HeldFinding],
    operator_links: list[str],
    audit_links: list[SourceLead] | None = None,
    subject_terms: list[str] | None = None,
) -> ResearchBrief:
    """Assemble one request from what is already written down. No model call.

    Deterministic: equal inputs produce an equal brief, which is what lets an
    unchanged question be answered from storage instead of bought twice.
    """
    clean_aliases = sorted({_clean(alias, 160) for alias in aliases if _clean(alias)})
    leads: list[SourceLead] = []
    seen: set[str] = set()
    for url in operator_links:
        trimmed = _clean(url, 500)
        if trimmed and trimmed.lower() not in seen:
            seen.add(trimmed.lower())
            leads.append(SourceLead(url=trimmed, origin="operator"))
    for lead in audit_links or []:
        trimmed = _clean(lead.url, 500)
        if trimmed and trimmed.lower() not in seen:
            seen.add(trimmed.lower())
            leads.append(SourceLead(url=trimmed, origin=lead.origin, note=lead.note))

    brief = ResearchBrief(
        name=_clean(name, 200),
        aliases=clean_aliases,
        city=_clean(city, 120),
        district=_clean(district, 120),
        address=_clean(address, 300),
        place_id=_clean(place_id, 120),
        article_title=_clean(article_title, 200),
        topic=_clean(topic, 80),
        topic_label=_clean(topic_label, 120),
        standard=_clean(standard, 600),
        exclusions=_clean(exclusions, 600),
        mode=mode if mode in {"initial", "gap", "refresh"} else "initial",
        gap_text=_clean(gap_text, 400),
        known_source_leads=leads[:MAX_SOURCE_LEADS],
        discovery_leads=list(discovery_leads)[:MAX_LEADS],
        held=list(held)[:MAX_HELD],
        subject_terms=[_clean(term, 40) for term in (subject_terms or []) if _clean(term)],
    )
    brief.priority_questions = _priority_questions(
        topic_label=brief.topic_label, mode=brief.mode, gap_text=brief.gap_text
    )
    brief.illustrative_queries = _illustrative_queries(
        name=brief.name,
        published=brief.published_name,
        district=brief.district,
        topic_label=brief.topic_label,
        mode=brief.mode,
        gap_text=brief.gap_text,
    )
    brief.scope_notes = _scope_notes(
        name=brief.name,
        place_id=brief.place_id,
        address=brief.address,
        district=brief.district,
    )
    brief.completion_criteria = _completion_criteria(brief.topic_label)
    return brief
