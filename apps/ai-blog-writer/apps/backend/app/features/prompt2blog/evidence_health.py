"""Weak input, named before confident prose is written from it.

Improvement 08. The gate already asks whether the dossier answers the
questions. It never asked whether the answers are the kind of answers this
article can stand on -- so a menu price checked eighteen months ago and a menu
price checked last week reach the writer looking identical, and the article
states both in the present tense with equal confidence.

Everything here is deterministic and free. It reads the frozen records and
reports; it fetches nothing, asks no model, and never edits a packet. New
research is a separate, deliberate act that changes the dossier and the
selection before a new packet is frozen, which is the rule this must not
quietly break.

Why there is no expiry
----------------------
The obvious version of this is "flag anything older than N months", and it is
wrong. How long a fact stays true depends entirely on what kind of fact it is:
a museum's founding date does not go stale, a tasting-menu price goes stale in
a season, and a bus timetable goes stale the day it changes. A universal
threshold would either bury the operator in false alarms or miss the price that
matters.

So the comparison is against what the *article* promises. A piece whose seed
says "right now" has promised the reader currency and is answerable for it; a
piece about what a neighbourhood was like in 2019 has promised the opposite and
must not be nagged for using historical facts. That is also why nothing here
says a fact is false: a date is evidence about how much the article is
claiming, never about whether the claim is true.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from .contracts_v4 import ArticleBrief, EvidencePackage

# Wording that makes a claim answerable for being current. Not a claim about
# the subject -- a museum can charge an entry fee for fifty years -- but about
# the *statement*: a price, an opening time, a fare, a schedule, an
# availability. These are the sentences a reader acts on today.
_TIME_SENSITIVE_CLAIM = re.compile(
    r"""
    \b(?:
        price|prices|priced|pricing|cost|costs|fare|fares|fee|fees|rate|rates|
        charge|charges|admission|ticket|tickets|
        opens?|opening|closes?|closing|hours|schedule|schedules|timetable|
        departs?|departure|departures|arrives?|frequency|
        available|availability|open|closed|currently|booking|bookings|
        menu|menus|offers?|discount|discounts|surcharge
    )\b
  | [$€£¥]\s?\d
  | \b\d[\d,.]*\s?(?:USD|EUR|GBP|PEN|COP|MXN|BRL|CLP|ARS|soles?|pesos?)\b
    """,
    re.VERBOSE | re.IGNORECASE,
)

# Wording in the brief that promises the reader the article describes how
# things are now. A promise, not a topic: "the best time to visit" is about
# timing and promises nothing about currency; "what it costs right now" does.
_CURRENCY_PROMISE = re.compile(
    r"""
    \b(?:
        right\s+now|currently|current|today|these\s+days|at\s+the\s+moment|
        this\s+year|this\s+season|latest|up[-\s]to[-\s]date|still|
        as\s+of\s+now|nowadays|these\s+prices
    )\b
    """,
    re.VERBOSE | re.IGNORECASE,
)

# The window inside which a dated fact is treated as answering a promise of
# currency. Not an expiry on facts -- it is how recently something must have
# been checked before an article may say "right now" about it, which is a
# question about the promise rather than about the fact.
#
# Twelve months, because that is a season either side of any annual price
# change, and because the alternative -- picking a number per kind of fact --
# is a taxonomy nobody would maintain and the operator can already override by
# reading the finding and deciding it does not matter.
CURRENCY_PROMISE_MONTHS = 12


def _months_between(earlier: date, later: date) -> int:
    return (later.year - earlier.year) * 12 + (later.month - earlier.month)


def is_time_sensitive(text: str) -> bool:
    return bool(_TIME_SENSITIVE_CLAIM.search(text))


def promises_currency(brief: ArticleBrief) -> bool:
    """Whether this article has told the reader it describes how things are now.

    Read off the seed, the reader's question and the outcome -- the three lines
    that are a promise to a reader. `spine` and `fails_if` are the operator
    talking to the pipeline about how to write it, and a spine that happens to
    contain the word "current" is not a promise anybody made.
    """
    return any(
        _CURRENCY_PROMISE.search(line)
        for line in (brief.seed, brief.reader_question, brief.outcome)
    )


@dataclass(frozen=True)
class HealthFinding:
    """One thing about the evidence worth an operator's attention."""

    kind: str
    # What to look at. Claim ids, source ids, or a conflict id.
    subject_ids: list[str]
    detail: str
    # True only where the article has promised something its evidence cannot
    # support. Everything else here is worth reading and worth ignoring.
    blocks_currency_promise: bool = False


@dataclass
class EvidenceHealth:
    """What the deterministic read of the dossier found."""

    findings: list[HealthFinding] = field(default_factory=list)
    promises_currency: bool = False
    checked_against: str = ""

    @property
    def unmet_promise(self) -> bool:
        return any(finding.blocks_currency_promise for finding in self.findings)

    def as_record(self) -> dict[str, Any]:
        return {
            "promises_currency": self.promises_currency,
            "checked_against": self.checked_against,
            "unmet_promise": self.unmet_promise,
            "findings": [
                {
                    "kind": finding.kind,
                    "subject_ids": list(finding.subject_ids),
                    "detail": finding.detail,
                    "blocks_currency_promise": finding.blocks_currency_promise,
                }
                for finding in self.findings
            ],
            # Said in the record rather than left to whoever reads it. A list of
            # dated facts under a heading like "evidence problems" is read as a
            # list of wrong facts by the second person who sees it.
            "means": (
                "A date says how much an article is entitled to claim, never "
                "whether a fact is true. Nothing here has been re-checked, and "
                "an article that deliberately describes an earlier moment is "
                "expected to rest on older facts."
            ),
        }


def assess_evidence_health(
    brief: ArticleBrief,
    evidence: EvidencePackage,
    *,
    today: date,
    selected_only: bool = True,
) -> EvidenceHealth:
    """Read the dossier for the trouble a date or a link can reveal.

    `today` is passed rather than read, so the same dossier assessed twice
    gives the same answer and a test does not have to travel in time.

    `selected_only` because the question is about the article being written.
    A stale price the operator already cut is not this article's problem, and
    reporting it would bury the one that is.
    """
    claims = [
        claim
        for claim in evidence.claims
        if claim.selected or not selected_only
    ]
    by_id = {claim.claim_id: claim for claim in claims}
    sources = {source.source_id: source for source in evidence.sources}
    promised = promises_currency(brief)
    findings: list[HealthFinding] = []

    # 1. A statement a reader acts on, with nothing saying when it was true.
    undated = sorted(
        claim.claim_id
        for claim in claims
        if claim.as_of is None and is_time_sensitive(claim.text)
    )
    if undated:
        findings.append(
            HealthFinding(
                kind="undated_time_sensitive",
                subject_ids=undated,
                detail=(
                    f"{len(undated)} chosen fact(s) state a price, a time or an "
                    "availability without saying when that was true. The writer "
                    "has nothing to date the sentence with, so it will read as "
                    "current."
                ),
                # A promise of currency resting on facts that carry no date at
                # all is the clearest version of this problem: there is not
                # even a date to argue about.
                blocks_currency_promise=promised,
            )
        )

    # 2. A fact nobody can go back and re-check.
    unverifiable = sorted(
        claim.claim_id
        for claim in claims
        if all(
            (source := sources.get(source_id)) is not None and source.url is None
            for source_id in claim.source_ids
        )
    )
    if unverifiable:
        findings.append(
            HealthFinding(
                kind="no_source_to_return_to",
                subject_ids=unverifiable,
                detail=(
                    f"{len(unverifiable)} chosen fact(s) rest only on sources "
                    "with no address. Nobody can go back and see whether they "
                    "still hold."
                ),
            )
        )

    # 3. Two chosen facts that disagree, with nobody having decided.
    #
    # The dossier records conflicts and a resolution when one was reached. An
    # unresolved conflict whose claims are *both still chosen* hands the writer
    # two statements that contradict each other and no instruction, and the
    # writer will pick one silently. That is the case worth interrupting for --
    # a conflict where the operator already deselected one side is settled.
    for conflict in evidence.conflicts:
        if conflict.resolution:
            continue
        still_chosen = sorted(
            claim_id for claim_id in conflict.claim_ids if claim_id in by_id
        )
        if len(still_chosen) < 2:
            continue
        findings.append(
            HealthFinding(
                kind="unsettled_conflict",
                subject_ids=still_chosen,
                detail=(
                    f"{conflict.summary} Both statements are still chosen and "
                    "nothing says which is right, so the writer will pick one "
                    "and not say that it did."
                ),
            )
        )

    # 4. The article promised currency; the evidence is older than the promise.
    #
    # Only ever asked of an article that made the promise. A piece about what a
    # neighbourhood was like in 2019 rests on 2019 facts on purpose, and
    # nagging it for that would train the operator to ignore all of this.
    checked_against = ""
    if promised:
        dated = [
            claim
            for claim in claims
            if claim.as_of is not None and is_time_sensitive(claim.text)
        ]
        if dated:
            newest = max(claim.as_of for claim in dated)
            checked_against = newest.isoformat()
            age = _months_between(newest, today)
            if age > CURRENCY_PROMISE_MONTHS:
                findings.append(
                    HealthFinding(
                        kind="currency_promise_unmet",
                        subject_ids=sorted(claim.claim_id for claim in dated),
                        detail=(
                            "This article promises the reader how things are "
                            f"now, and the most recently checked price or time "
                            f"on the desk is from {newest.isoformat()} -- "
                            f"{age} months ago. Either research it again, or "
                            "say plainly when these were true."
                        ),
                        blocks_currency_promise=True,
                    )
                )

    return EvidenceHealth(
        findings=findings,
        promises_currency=promised,
        checked_against=checked_against,
    )
