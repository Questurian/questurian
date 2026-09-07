"""Section-plan normalization and scope guards for the v3 outline stage.

Everything here is pure. The plan is checked against the approved work order
and the exact evidence records before any prose exists, so scope drift and
unsupported sections are caught while they are still cheap to reject.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from ..support import _safe_dict, _safe_int, _safe_str

# The shape every article used to be planned into, whatever form was
# approved. Both are now the default only -- what a run actually uses comes
# from its frozen structure policy (finding 07) -- and they stay here as the
# fallback for a run that has none.
MIN_OUTLINE_SECTIONS = 3
MAX_OUTLINE_SECTIONS = 12


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_safe_str(item) for item in value if _safe_str(item)]


def _sanitize_section(raw: Any) -> dict[str, Any] | None:
    record = _safe_dict(raw)
    heading = _safe_str(record.get("heading"))
    if not heading:
        return None
    return {
        "heading": heading,
        # Empty when the planner did not say, and left empty on purpose. The
        # old field filled itself in with "Purpose not stated.", which is a
        # sentence, so every downstream check saw a section that had stated
        # its purpose. `validate_v3_outline` can only catch a missing payoff
        # if a missing payoff still looks missing here.
        "reader_payoff": _safe_str(record.get("reader_payoff")),
        "claim_ids": _string_list(record.get("claim_ids")),
        "target_words": max(0, _safe_int(record.get("target_words"), default=0)),
    }


def sanitize_v3_outline(
    parsed: dict[str, Any],
    *,
    max_sections: int = MAX_OUTLINE_SECTIONS,
) -> dict[str, Any]:
    sections_raw = parsed.get("sections")
    sections: list[dict[str, Any]] = []
    if isinstance(sections_raw, list):
        for item in sections_raw[:max_sections]:
            section = _sanitize_section(item)
            if section:
                sections.append(section)

    return {
        "working_title": _safe_str(parsed.get("working_title")),
        "direct_answer_focus": _safe_str(parsed.get("direct_answer_focus")),
        "sections": sections,
        "takeaway_focus": _safe_str(parsed.get("takeaway_focus")),
        "brief_alignment": _safe_str(parsed.get("brief_alignment"))
        or "Brief alignment not stated.",
        "unsupported_requirements": _string_list(
            parsed.get("unsupported_requirements")
        ),
    }


def _mentions(text: str, name: str) -> bool:
    def normalize(value: str) -> str:
        decomposed = unicodedata.normalize("NFKD", value)
        unaccented = "".join(
            character
            for character in decomposed
            if not unicodedata.combining(character)
        )
        return " ".join(unaccented.casefold().split())

    normalized_text = normalize(text)
    # A work order stores geography canonically (for example, "Medellín,
    # Colombia") while natural headings use the locality alone. The leading
    # comma-delimited name is a valid shorthand; country alone is not.
    full_name = normalize(name)
    locality = normalize(name.split(",", maxsplit=1)[0])
    candidates = {candidate for candidate in (full_name, locality) if candidate}
    return any(
        re.search(rf"(?<!\w){re.escape(candidate)}(?!\w)", normalized_text)
        for candidate in candidates
    )


_SUBJECT_LEAD_SKIP = {"the", "a", "an"}


_SUBJECT_FILLER = {"the", "a", "an", "el", "la", "los", "las", "international"}
_DESCRIPTIVE_SUFFIX = re.compile(
    r"\s+(?:(?:international\s+)?airport|cuisine)$", re.IGNORECASE
)
# A subject written as a description rather than as a name: "Hill elevators of
# Valparaiso", "The old town in Quito". Both halves name the same subject.
_SUBJECT_QUALIFIER = re.compile(r"\s+(?:of|in)\s+", re.IGNORECASE)


def _has_meaning(name: str) -> bool:
    """Whether anything is left of a name once the filler words are removed."""
    return bool(set(name.casefold().split()) - _SUBJECT_FILLER)


def _subject_aliases(primary_subject: str) -> list[str]:
    """What a plan may call this subject and still be about it.

    Every alias is a complete part of the subject's own name, never a fragment
    of one: El Dorado International Airport yields El Dorado, never El, Dorado
    or International Airport.

    A subject is not always a proper name. `primary_subject` is written by the
    planning model, and it writes a description as readily as a name -- run
    e001d48c was commissioned on "Hill elevators of Valparaiso", whose plan
    said Valparaiso and ascensores in every heading and was rejected for never
    saying the phrase itself. The article was then structured with no section
    plan at all. So a description splits at its qualifier and either half
    counts, because neither half is a different subject.

    Deliberately asymmetric. A plan that drifts is caught by the claims it
    cites -- they come from this run's own dossier -- and by the context-only
    guard; a plan wrongly rejected here costs the article its whole structure.
    """
    locality = primary_subject.split(",", maxsplit=1)[0].strip()
    aliases = [primary_subject, locality]
    short_name = _DESCRIPTIVE_SUFFIX.sub("", locality).strip()
    if short_name != locality:
        aliases.append(short_name)
    halves = _SUBJECT_QUALIFIER.split(short_name or locality)
    if len(halves) > 1:
        aliases.extend(half.strip() for half in halves)
    return [alias for alias in aliases if alias and _has_meaning(alias)]


def _covers_subject(text: str, primary_subject: str) -> bool:
    """Whether this line names the article's subject, under any of its names."""
    return any(_mentions(text, alias) for alias in _subject_aliases(primary_subject))


def _names_subject(heading: str, primary_subject: str) -> bool:
    """Whether a heading names the article's own subject.

    `_mentions` wants the whole phrase, with a comma shorthand for geography
    ("Medellin, Colombia" matches a heading saying "Medellin"). A subject that
    is not a place does not decompose that way: `primary_subject` was "Chifa
    cuisine" and every heading said "Chifa", so nothing matched and headings
    that plainly named the subject read as drift.

    So the leading word counts too. "Chifa cuisine" is named by "Chifa";
    "The Malecon" by "Malecon". An article is a poor fit for this check if its
    subject's first word is a bare category noun, which is why it is only ever
    used to *permit* a heading, never to condemn one.
    """
    if _mentions(heading, primary_subject):
        return True
    locality = primary_subject.split(",", maxsplit=1)[0]
    words = [word for word in locality.split() if word.casefold() not in _SUBJECT_LEAD_SKIP]
    return bool(words) and _mentions(heading, words[0])


# Words that carry no promise on their own. A payoff built only out of these
# and the heading's own words has restated the heading, which is the exact
# thing improvement 01 is about: the plan says a section exists and never says
# what a reader leaves it with.
_PAYOFF_FILLER = frozenset(
    {
        "a", "an", "and", "the", "this", "that", "these", "those", "of", "for",
        "to", "in", "on", "at", "by", "with", "about", "from", "it", "its",
        "is", "are", "be", "will", "can", "reader", "readers", "section",
        "article", "piece", "explains", "explain", "covers", "cover", "covered",
        "describes", "describe", "outlines", "outline", "gives", "give",
        "provides", "provide", "shows", "show", "details", "detail",
        "discusses", "discuss", "introduces", "introduce", "presents",
        "present", "what", "which", "how", "why", "where", "when", "who",
    }
)


def _payoff_words(text: str) -> set[str]:
    return {
        word
        for word in re.findall(r"[\w']+", text.casefold())
        if word not in _PAYOFF_FILLER
    }


def _restates_heading(heading: str, payoff: str) -> bool:
    """Whether a payoff says only what its heading already said.

    Deliberately generous to the planner. A payoff is only called a
    restatement when, after filler and the heading's own words are removed,
    it has nothing of its own left. "Covers the transport options" under
    "Transport options" is caught; "Which transfer to book before 6am, and
    what it costs" is not, and neither is a payoff that merely happens to
    reuse the heading's nouns while going on to say something.
    """
    remaining = _payoff_words(payoff) - _payoff_words(heading)
    return not remaining


# Facts per hundred words above which a section stops being prose.
#
# Run 9e66bf84 gave one 200-word section 56 claims -- three and a half words
# each, at which density there is no sentence you can write except a list.
# Reported, never enforced: how many facts a paragraph can carry depends on
# what they are, and a plan rejected for this would be a plan thrown away over
# an estimate. The operator and the run record see it; the run continues.
CROWDED_CLAIMS_PER_HUNDRED_WORDS = 4.0


def validate_v3_outline(
    outline: dict[str, Any],
    *,
    work_order: dict[str, Any],
    claim_ids: set[str],
    target_word_count: int,
    min_sections: int = MIN_OUTLINE_SECTIONS,
    fact_roles: dict[str, str] | None = None,
) -> tuple[bool, dict[str, Any]]:
    """Check a plan against the work order's scope and the writer's packet.

    A plan that drifts is discarded rather than fed to compose: an outline that
    organizes the article around a context-only place, or that cites a claim
    the writer will never see, would put the drift into the prose.

    `claim_ids` is the packet, not the dossier. A plan that cites a fact a
    person deliberately cut is structurally valid against the research and
    wrong against this article -- and it would hand compose a section built on
    a claim that is not in its context, which is how a writer ends up
    inventing one.

    `fact_roles` is the packet's own labelling of what each fact is for, and it
    is what turns a crowded section from a number into advice: eight facts in a
    hundred and forty words is a different problem when five of them are colour
    the writer may simply leave out (improvement 04). Optional, because the
    density reporting has to keep working for a selection made before roles
    existed.
    """
    sections = outline.get("sections") or []
    planned_words = sum(_safe_int(s.get("target_words"), default=0) for s in sections)

    within_budget = True
    if target_word_count > 0 and planned_words > 0:
        tolerance = max(200, int(target_word_count * 0.35))
        within_budget = abs(planned_words - target_word_count) <= tolerance

    unknown_claim_ids = sorted(
        {
            claim_id
            for section in sections
            for claim_id in section["claim_ids"]
            if claim_id not in claim_ids
        }
    )
    roles = fact_roles or {}

    def _spare(section: dict[str, Any]) -> list[str]:
        """The facts in this section whose job is colour.

        The one thing that makes a crowded section actionable. `texture` is the
        packet's own word for a fact chosen to carry the place rather than to
        prove anything, so it is the one a writer can drop without losing an
        obligation or a qualification.
        """
        return [
            claim_id
            for claim_id in section["claim_ids"]
            if roles.get(claim_id) == "texture"
        ]

    crowded_sections = [
        {
            "heading": section["heading"],
            "claims": len(section["claim_ids"]),
            "target_words": words,
            "claims_per_hundred_words": round(
                len(section["claim_ids"]) * 100 / words, 1
            ),
            # How much of the crowding the writer is allowed to relieve. A
            # section carrying eight facts of which five are colour has room in
            # it; one carrying eight load-bearing facts is over-planned, and
            # needs a different plan rather than a lighter hand.
            "spare_claims": _spare(section),
        }
        for section in sections
        if (words := _safe_int(section.get("target_words"), default=0)) > 0
        and len(section["claim_ids"]) * 100 / words
        > CROWDED_CLAIMS_PER_HUNDRED_WORDS
    ]

    # The same fact planned into two sections. Not a scope error and never a
    # reason to fail a plan -- a price can legitimately be recalled where it
    # matters again -- but it is the cheapest repetition there is, and it was
    # invisible: the article said the same thing twice and nothing in the run
    # record said where it came from.
    repeated_claims = [
        {"claim_id": claim_id, "headings": headings}
        for claim_id, headings in _repeated_placements(sections)
    ]
    placed = {
        claim_id for section in sections for claim_id in section["claim_ids"]
    }

    scope = _safe_dict(work_order.get("scope"))
    references = scope.get("references") or []
    context_only = [
        _safe_str(reference.get("name"))
        for reference in references
        if reference.get("role") == "context_only"
    ]
    primary_subject = _safe_str(work_order.get("primary_subject"))
    # A context-only place may be discussed inside a section and may not be
    # what the section is about. Mentioning it is not being about it: a heading
    # that names the subject as well is contrasting, not drifting.
    #
    # Run 90f348df was commissioned on the spine "the chifa worth eating is not
    # in Barrio Chino", and the heading that states exactly that -- "Beyond
    # Barrio Chino: Where Lima's Best Chifa Resides" -- was struck for naming
    # Barrio Chino, along with three more. Four sections deleted and an article
    # written round the holes. The rule was reading any mention as ownership.
    context_only_headings = sorted(
        {
            section["heading"]
            for section in sections
            for name in context_only
            if name
            and _mentions(section["heading"], name)
            and not _names_subject(section["heading"], primary_subject)
        }
    )
    # A well-built outline often names the subject once in its framing and then
    # relies on subject-specific detail in the sections ("El Poblado", "Museo de
    # Antioquia") rather than repeating the city in every heading. Genuine drift
    # still fails this, because a plan about another subject names that subject
    # in its framing too.
    subject_fields = [
        _safe_str(outline.get("working_title")),
        _safe_str(outline.get("direct_answer_focus")),
        _safe_str(outline.get("takeaway_focus")),
        _safe_str(outline.get("brief_alignment")),
        *(
            value
            for section in sections
            for value in (section["heading"], section["reader_payoff"])
        ),
    ]
    covers_primary_subject = not primary_subject or any(
        _covers_subject(value, primary_subject) for value in subject_fields
    )

    # What each section promises the reader, and whether it promised anything
    # (improvement 01). A section with no payoff is a heading with facts under
    # it, and two sections promising the same thing is one section.
    missing_payoffs = sorted(
        section["heading"] for section in sections if not section["reader_payoff"]
    )
    payoff_keys = [
        " ".join(sorted(_payoff_words(section["reader_payoff"])))
        for section in sections
        if section["reader_payoff"]
    ]
    duplicate_payoffs = sorted(
        {key for key in payoff_keys if payoff_keys.count(key) > 1 and key}
    )
    # Read, not enforced -- the same treatment `crowded_sections` gets, and for
    # the same reason. Whether a sentence adds something to its heading is a
    # judgement, and a plan thrown away over this one would cost an article its
    # whole structure to fix a line of prose.
    restated_payoffs = sorted(
        section["heading"]
        for section in sections
        if section["reader_payoff"]
        and _restates_heading(section["heading"], section["reader_payoff"])
    )

    checks = {
        # From the approved form, not from a constant. A Q&A or a column that
        # divides into two sections is that form working, and failing the plan
        # for it sent compose in with no plan at all.
        "enough_sections": len(sections) >= min_sections,
        "payoffs_stated": not missing_payoffs,
        "payoffs_distinct": not duplicate_payoffs,
        "headings_unique": len({s["heading"].casefold() for s in sections})
        == len(sections),
        "within_word_budget": within_budget,
        "claims_resolve": not unknown_claim_ids,
        # A context-only place may be discussed inside a section; it may never
        # be what a section is about.
        "no_context_only_sections": not context_only_headings,
        "covers_primary_subject": covers_primary_subject,
    }
    diagnostics = {
        **checks,
        "section_count": len(sections),
        "min_sections": min_sections,
        "planned_word_count": planned_words,
        "target_word_count": target_word_count,
        "unknown_claim_ids": unknown_claim_ids,
        # Read, not enforced. A section at this density is the failure mode
        # this redesign exists for, and seeing it in the run record is how we
        # find out whether narrowing the packet actually fixed it.
        "crowded_sections": crowded_sections,
        "repeated_claims": repeated_claims,
        # Chosen for this article and placed nowhere. Reported so the distance
        # between what an operator picked and what the plan uses is visible;
        # never a failure, because "leave out what the piece is better without"
        # is what the outline prompt asks for.
        "unplaced_claims": sorted(claim_ids - placed),
        "context_only_headings": context_only_headings,
        "missing_payoffs": missing_payoffs,
        "duplicate_payoffs": duplicate_payoffs,
        "restated_payoffs": restated_payoffs,
    }
    return all(checks.values()), diagnostics


def drop_context_only_sections(
    outline: dict[str, Any], headings: list[str]
) -> dict[str, Any]:
    """Remove the sections a context-only place was organising, keep the rest.

    Rejecting the whole plan for one bad heading was throwing away six good
    sections to stop one, and it did not even stop it: run b29d66b4 lost its
    entire outline over a single heading about a ranking that does not exist,
    wrote its article with no plan, and discussed the ranking anyway. Dropping
    the section is what the check actually wanted -- that section never reaches
    compose -- and it costs nothing and asks no model.

    The dropped word budget is spread across what remains, or the repaired plan
    would fail `within_word_budget` for the crime of being repaired.
    """
    unwanted = {heading.casefold() for heading in headings}
    kept = [
        section
        for section in outline.get("sections") or []
        if section["heading"].casefold() not in unwanted
    ]
    if not kept:
        return {**outline, "sections": []}

    dropped_words = sum(
        _safe_int(section.get("target_words"), default=0)
        for section in outline.get("sections") or []
        if section["heading"].casefold() in unwanted
    )
    share, remainder = divmod(dropped_words, len(kept))
    repaired = []
    for index, section in enumerate(kept):
        extra = share + (1 if index < remainder else 0)
        repaired.append(
            {
                **section,
                "target_words": _safe_int(section.get("target_words"), default=0)
                + extra,
            }
        )
    return {**outline, "sections": repaired}


def outline_focus_only(outline: dict[str, Any]) -> dict[str, Any]:
    """What survives when the sections cannot be used.

    `direct_answer_focus` and `takeaway_focus` are separately valid and are the
    most valuable lines the outline produces -- b29d66b4's named the one stall
    to send the reader to, with its survival caveat, and it was deleted along
    with the sections over an unrelated heading. A bad heading is not a reason
    to throw away the answer.
    """
    return {
        "working_title": _safe_str(outline.get("working_title")),
        "direct_answer_focus": _safe_str(outline.get("direct_answer_focus")),
        "sections": [],
        "takeaway_focus": _safe_str(outline.get("takeaway_focus")),
        "brief_alignment": "Brief alignment not stated.",
        "unsupported_requirements": [],
    }


# Facts per hundred words below which a section has room to explain rather
# than merely to list. Deliberately lower than the crowding threshold: between
# the two is the ordinary middle, where nothing needs saying either way.
ROOMY_CLAIMS_PER_HUNDRED_WORDS = 2.0


def _repeated_placements(
    sections: list[dict[str, Any]],
) -> list[tuple[str, list[str]]]:
    """Facts the plan put in more than one section.

    Shared by the diagnostics and by the section brief so the run record and
    the writer cannot disagree about which facts are doubled.
    """
    placements: dict[str, list[str]] = {}
    for section in sections:
        for claim_id in section["claim_ids"]:
            placements.setdefault(claim_id, []).append(section["heading"])
    return [
        (claim_id, headings)
        for claim_id, headings in sorted(placements.items())
        if len(headings) > 1
    ]


def _room_to_work(section: dict[str, Any], roles: dict[str, str]) -> str | None:
    """One line telling the writer how much room this section actually has.

    Improvement 04. The writer was handed a list of facts and a word budget and
    left to reconcile them, and when they do not reconcile the only prose that
    satisfies both is a catalogue: run 9e66bf84 planned 56 claims into 200
    words, which is three and a half words each.

    Advice, never a maximum. One complex fact can need more explanation than
    five simple ones, so a number here cannot decide anything -- what it can do
    is say which facts are droppable, which is the part the writer could not
    know.
    """
    claims = section["claim_ids"]
    words = _safe_int(section.get("target_words"), default=0)
    if not claims or words <= 0:
        return None

    spare = [claim_id for claim_id in claims if roles.get(claim_id) == "texture"]
    density = len(claims) * 100 / words
    crowded = density > CROWDED_CLAIMS_PER_HUNDRED_WORDS

    if crowded:
        opening = (
            f"{len(claims)} facts in ~{words} words is a list, not a section. "
            "Explain the two or three that carry the point."
        )
    elif density <= ROOMY_CLAIMS_PER_HUNDRED_WORDS:
        opening = (
            f"{len(claims)} facts in ~{words} words. There is room here to say "
            "what they mean, not only what they are."
        )
    else:
        opening = f"{len(claims)} facts in ~{words} words."

    if spare:
        tail = f" Colour, droppable: {', '.join(spare)}."
    elif crowded:
        # Only worth saying where the writer would otherwise be looking for
        # something to cut. On a section with room, "nothing is spare" is an
        # answer to a question nobody asked.
        tail = " Every fact here is load-bearing, so the room has to come from the prose."
    else:
        tail = ""
    return f"   Room to work: {opening}{tail}"


def format_v3_outline_for_prompt(
    outline: dict[str, Any], *, fact_roles: dict[str, str] | None = None
) -> str:
    """Render a validated plan as the section brief compose writes against."""
    sections = outline.get("sections") or []
    if not sections:
        # A plan whose sections were unusable can still carry the answer and
        # the takeaway. Handing compose nothing at all is how b29d66b4 came
        # back at 502 words against an 800 floor.
        focus = _safe_str(outline.get("direct_answer_focus"))
        takeaway = _safe_str(outline.get("takeaway_focus"))
        salvaged = []
        if focus:
            salvaged.append(f"Direct answer near the top should cover: {focus}")
        if takeaway:
            salvaged.append(f"The takeaways should land: {takeaway}")
        opening = (
            "No usable section plan was produced. Structure the article from "
            "the approved brief and the evidence records only."
        )
        return "\n\n".join([opening, *salvaged])

    lines: list[str] = []
    direct_answer = _safe_str(outline.get("direct_answer_focus"))
    if direct_answer:
        lines.append(f"Direct answer near the top should cover: {direct_answer}")
        lines.append("")

    lines.append("Planned sections (use these as the `##` headings, in order):")
    for index, section in enumerate(sections, start=1):
        target = section.get("target_words") or 0
        budget = f" (~{target} words)" if target else ""
        claims = ", ".join(section["claim_ids"]) or "none"
        lines.append(f"{index}. {section['heading']}{budget}")
        lines.append(f"   What the reader gets: {section['reader_payoff']}")
        lines.append(f"   Evidence claims: {claims}")
        room = _room_to_work(section, fact_roles or {})
        if room:
            lines.append(room)

    repeated = _repeated_placements(sections)
    if repeated:
        lines.append("")
        lines.append(
            "The same fact is planned into more than one section. State it "
            "once, in the section that needs it most, unless the second use "
            "genuinely does new work:"
        )
        lines.extend(
            f"- {claim_id}: {' / '.join(headings)}"
            for claim_id, headings in repeated
        )

    takeaway = _safe_str(outline.get("takeaway_focus"))
    if takeaway:
        lines.append("")
        lines.append(f"Closing takeaways should land on: {takeaway}")

    unsupported = outline.get("unsupported_requirements") or []
    if unsupported:
        lines.append("")
        lines.append(
            "The evidence does not support the following. Say so plainly "
            "rather than inventing detail:"
        )
        lines.extend(f"- {item}" for item in unsupported)

    return "\n".join(lines)


def format_payoff_promises(outline: dict[str, Any]) -> str:
    """The promises the plan made, for the stage that checks they were kept.

    The auditor used to be asked to work out for itself what each section
    should have done for the reader, which is a second opinion about the plan
    rather than a check on the draft. The plan already said. Handing it over
    turns "does this section do its job" from a judgement about what the job
    might have been into a comparison against a written promise.
    """
    sections = outline.get("sections") or []
    promises = [
        f"{index}. {section['heading']} -> {section['reader_payoff']}"
        for index, section in enumerate(sections, start=1)
        if section.get("reader_payoff")
    ]
    if not promises:
        # An honest absence. A run whose plan was rejected has no promises to
        # check, and inventing some here would put the auditor back to guessing
        # with an air of authority.
        return "No section promises were recorded for this run."
    return "\n".join(promises)
