"""Finding out what has been said about one place.

This is the step that decides whether a place can carry a blurb, and it is the
same step that gathers the material to write one. Doing it twice -- once to
judge and once to write -- would pay for the same search twice, and the second
pass would be judged against material the first pass never saw.

So it gathers, and what it gathers is what the gate counts and what the blurb
is written from.

What it does not gather
-----------------------
Address, hours, cuisine, price level, photographs. Those belong to Location
Manager, which already collects them, and a place's opening hours have never
made a blurb better. This asks only for what has been *said*: awards, reviews,
history, the people, the one thing it is known for.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Callable

from .profiles import Claim, ClaimKind

logger = logging.getLogger(__name__)

RESEARCH_MAX_TOKENS = 3_072
RESEARCH_TIMEOUT_SECONDS = 120
RESEARCH_MODEL = "gemini-2.5-flash"

# Offered to the model as a closed vocabulary. An open one produces a different
# taxonomy for every place, and a taxonomy nobody applies consistently cannot
# be counted -- which is the only thing the gate does with it.
_KINDS: tuple[tuple[str, str], ...] = (
    ("award", "a named prize, guide listing or ranking, with its year"),
    ("recognition", "a standing reputation with no single award behind it"),
    ("review", "a critic or publication writing about it"),
    ("history", "when it opened, who founded it, what changed"),
    ("person", "a named chef, bartender or owner"),
    ("signature", "the one dish or drink it is known for"),
    ("setting", "the room, the building, the view"),
    ("practice", "how it works: lunch only, no reservations, cash only"),
)

_VALID_KINDS = {key for key, _ in _KINDS}


def build_research_prompt(name: str, city: str, angles: list[str]) -> str:
    """What one place is looked up with.

    The angles are included because they are why this place is on this list,
    and they tell the search where to dig -- a bar returned by "open for
    decades" wants its history found, where one returned by "just opened"
    plainly has none and should not be marked short for lacking it.
    """
    kinds = "\n".join(f"  {key} -- {description}" for key, description in _KINDS)
    reasons = "\n".join(f"  - {angle}" for angle in angles) or "  - (none recorded)"
    return f"""Find what has been published about this place:

  {name}, {city}

It came up in a search for a list because of these:
{reasons}

Search in the local language of {city} as well as in English. Local press and
local food and drink writing is where most of this lives, and an English-only
search finds only what was written for visitors.

Report only what has been SAID about it -- awards, reviews, history, the people,
what it is known for. Do NOT report its address, opening hours, phone number,
price level or menu; those are held elsewhere and are not what this is for.

Every line must be something you actually found published, attributed to where
you found it. If little has been written about this place, say so by returning
few lines. Do not pad, do not guess, and do not describe what a place like this
is usually like -- an invented sentence here is one that reaches a reader as a
fact.

Use only these kinds:
{kinds}

Write ONLY the list. One finding per line, in exactly this format:
KIND | what was said, in one sentence | year or blank | source url

No preamble, no numbering, no closing line."""


def parse_claims(text: str) -> list[Claim]:
    """The findings in a reply, dropping anything that is not one.

    A line whose kind is not in the vocabulary is kept as `other` rather than
    thrown away: the model invented a label, but the sentence it labelled is
    still something somebody published.
    """
    claims: list[Claim] = []
    for line in text.splitlines():
        if line.count("|") < 2:
            continue
        parts = [part.strip() for part in line.split("|")]
        kind = re.sub(r"^[\-\*•\d\.\)\s]+", "", parts[0]).strip().strip("*_ ").lower()
        body = parts[1]
        if not body or body.lower() in {"what was said", "claim"}:
            continue
        year_text = parts[2] if len(parts) > 2 else ""
        source = parts[3] if len(parts) > 3 else ""
        years = re.findall(r"\b(1[6-9]\d{2}|20\d{2})\b", year_text)
        resolved: ClaimKind = kind if kind in _VALID_KINDS else "other"  # type: ignore[assignment]
        claims.append(
            Claim(
                kind=resolved,
                text=body[:600],
                source_url=source if source.startswith("http") else "",
                about_year=int(years[0]) if years else None,
            )
        )
    return claims


# URLs that come back in grounding metadata and are not sources. XML and SVG
# namespaces appear because the model's output or the pages it read contained
# markup; attributing a claim about a bar to w3.org is worse than attributing
# it to nothing, because it looks like a citation.
_NOT_A_SOURCE = ("w3.org", "schema.org", "example.com", "localhost")


def usable_sources(urls: list[str]) -> list[str]:
    return [
        url
        for url in urls
        if url.startswith("http") and not any(bad in url for bad in _NOT_A_SOURCE)
    ]


@dataclass
class ResearchResult:
    """What a lookup found, and what kind of nothing it found if it found none.

    Three different things reach a caller as an empty list, and only one of
    them means the place has nothing written about it:

      the lookup never ran     -> a fact about the network
      it ran and said nothing  -> a fact about the model
      it answered with no rows -> a fact about the place

    Conflating them cost a real profile: Antigua Taberna Queirolo -- founded
    1880, UNESCO Blue Shield, Premios Summum 2023 -- was recorded as having
    nothing written about it, because the call had failed and a failure was
    returned as an empty result. The same conflation was already fixed once in
    the search step and was reintroduced here.
    """

    claims: list[Claim]
    sources: list[str]
    failed: bool = False
    reason: str = ""


# How many times one place is looked up. Not a retry for failure -- this is a
# retry for a successful call that answered thinly.
#
# The same prompt for Antigua Taberna Queirolo returned nineteen claims, then
# one, then none, with nothing changed between the calls. A grounded search
# reaches whatever the web handed back that second, and a single attempt makes
# the difference between a rich profile and a place the gate drops for having
# nothing written about it. Attempts are merged rather than replaced, because
# each one finds slightly different material and the store deduplicates
# anyway.
RESEARCH_ATTEMPTS = 3
# Below this, another attempt is worth its cost. Above it, the place is
# adequately covered and a further call mostly repeats itself.
RESEARCH_ENOUGH = 6


def research_place(
    name: str,
    city: str,
    angles: list[str],
    research: Callable[[str], tuple[str, list[str], int | None]],
) -> ResearchResult:
    """Look one place up, more than once if the first answer was thin."""
    prompt = build_research_prompt(name, city, angles)
    claims: list[Claim] = []
    urls: list[str] = []
    seen: set[str] = set()
    failure = ""

    for attempt in range(RESEARCH_ATTEMPTS):
        try:
            text, found_urls, _tokens = research(prompt)
            failure = ""
        except Exception as exc:  # pragma: no cover -- network dependent
            failure = f"{type(exc).__name__}"
            logger.warning(
                "Profile research call failed for %r (attempt %s): %s",
                name, attempt + 1, exc,
            )
            continue

        urls.extend(url for url in found_urls if url not in urls)
        for claim in parse_claims(text):
            key = " ".join(re.findall(r"[a-z0-9]+", claim.text.lower()))
            if key in seen:
                continue
            seen.add(key)
            claims.append(claim)

        logger.info(
            "Profile research for %r: attempt %s brought the total to %s claims",
            name, attempt + 1, len(claims),
        )
        if len(claims) >= RESEARCH_ENOUGH:
            break

    if failure and not claims:
        return ResearchResult([], [], failed=True, reason=failure)

    sources = usable_sources(urls)
    # A claim with no source of its own is still evidence, and the lookup's own
    # source list is the honest attribution: something was read to write that
    # sentence, we just do not know which of them.
    fallback = sources[0] if sources else ""
    for claim in claims:
        if not claim.source_url and fallback:
            claim.source_url = fallback

    if claims:
        return ResearchResult(claims, sources)
    return ResearchResult(
        [],
        sources,
        reason=(
            f"{RESEARCH_ATTEMPTS} lookups found nothing published about this place"
        ),
    )
