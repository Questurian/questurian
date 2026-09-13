"""Reading the pages a research request is about to cite.

The step this replaces did not read anything. A grounded call came back with a
list of `vertexaisearch.cloud.google.com/grounding-api-redirect/...` URLs, the
model told us what those pages said, and the pipeline wrote both down as if the
second were checkable against the first. It is not: the redirect names no
publisher, expires, and nobody -- not a reader, not the person curating the
profile, not a later run -- can open it and see whether the sentence is there.

So before anything is bought, and again after, the pages are fetched. What that
buys, in order of how much it matters:

1. **A real link.** Following the redirect yields the publisher's own URL. A
   claim then cites something that still resolves next year.
2. **A passage that can be checked.** The extraction step reads collected text,
   so "the source says X" is a claim about text this process actually holds.
3. **A date that is not invented.** Whatever the page itself publishes, kept
   separate from when we read it.
4. **An honest gap.** A page that is blocked, image-only or behind a login is
   recorded as unreachable. That is a different answer from "nothing is
   published", and the old path could not tell them apart.

Everything here is bounded on purpose: a page count, a byte ceiling, a per-page
timeout and a whole-attempt deadline. An unbounded reader is a way to spend an
afternoon inside one button press.

Safety
------
Fetched text is evidence about a place and is never an instruction. Redirects
are followed by hand, one hop at a time, and every hop is re-checked: a public
URL that redirects to `127.0.0.1` or to a cloud metadata address is refused at
that hop rather than after the fact. Only http and https. No cookies, no
credentials, no POST, and nothing is executed.
"""

from __future__ import annotations

import hashlib
import ipaddress
import logging
import re
import socket
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger(__name__)

# One attempt's whole reading budget. Eight pages was chosen against the real
# shape of the material: a place has one official menu, one or two delivery
# listings, one or two aggregator pages and, if it is lucky, one piece of
# writing. Past that the reader is collecting more of the same.
PAGE_BUDGET = 8
# Reserved for pages the grounded call turns up. Without this the known leads
# -- which are read first, because they are free of charge -- can eat the whole
# budget and the discovery call's own sources go unread.
DISCOVERED_RESERVE = 4
PER_PAGE_TIMEOUT_SECONDS = 20
WHOLE_READ_DEADLINE_SECONDS = 150
MAX_BYTES = 2_000_000
MAX_REDIRECTS = 5
# How much text one page contributes to the extraction prompt. A menu page is
# short; a newspaper page with its sidebars is not, and eight untrimmed pages
# is a prompt whose real content is navigation furniture.
MAX_TEXT_CHARS = 12_000

USER_AGENT = (
    "QuesturianResearchReader/1.0 (+editorial research; contact via questurian.com)"
)

# Reasons a fetch produced no text. Each is a different fact and the screen
# says which: `blocked` is a page that exists and refused us, `not_found` is one
# that is gone, `unsupported_type` is an image-only menu -- the single most
# common shape of Lima restaurant menu -- and none of them means nothing is
# published.
READ_STATES = (
    "ok",
    "empty",
    "blocked",
    "not_found",
    "timeout",
    "too_large",
    "unsupported_type",
    # A host that does not exist, kept apart from one this reader refused. The
    # first is a dead lead; the second is a URL pointing somewhere private.
    "no_such_host",
    "refused_address",
    "redirect_loop",
    "budget_exhausted",
    "error",
)

# Never a source. These come back inside grounding metadata because the model's
# own output or the pages it read contained markup; a claim about a bar cited to
# the W3C SVG namespace looks like attribution and is worse than none.
_NOT_A_SOURCE = (
    "w3.org",
    "schema.org",
    "example.com",
    "localhost",
    "googleusercontent.com/",
)

_GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com"

_HTML_TYPES = ("text/html", "application/xhtml+xml", "text/plain")


@dataclass
class PageRead:
    """One page this attempt tried to read, and what came of it."""

    requested_url: str
    # Where the redirects ended. For a grounding redirect this is the
    # publisher's own address, which is the link a citation should carry.
    final_url: str = ""
    state: str = "error"
    http_status: int | None = None
    title: str = ""
    text: str = ""
    # What the page itself says it was published on, when it says anything.
    # Never filled in from `retrieved_at`.
    published_at: str = ""
    retrieved_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    content_hash: str = ""
    byte_count: int = 0
    # `lead`, `discovered`, `operator`. Which part of the budget it came from
    # and how much weight the request placed on it before reading.
    origin: str = "lead"
    # True when the text came from a page this attempt had already read, rather
    # than from a second request. A refresh must not present cached content as
    # newly checked, so this travels with the record.
    reused: bool = False
    # True when the source is attached to this branch by identity rather than
    # by an address printed on it. Google's reviews hang off a Place ID, which
    # IS the branch -- a stronger anchor than a street name in body text, and
    # one the address check below would otherwise fail for want of the address.
    branch_anchored: bool = False
    note: str = ""

    @property
    def readable(self) -> bool:
        return self.state == "ok" and bool(self.text.strip())

    def as_dict(self) -> dict:
        return {
            "requested_url": self.requested_url,
            "final_url": self.final_url,
            "state": self.state,
            "http_status": self.http_status,
            "title": self.title,
            "published_at": self.published_at,
            "retrieved_at": self.retrieved_at.astimezone(timezone.utc).isoformat(
                timespec="seconds"
            ),
            "content_hash": self.content_hash,
            "byte_count": self.byte_count,
            "origin": self.origin,
            "reused": self.reused,
            "branch_anchored": self.branch_anchored,
            "note": self.note,
            "chars": len(self.text),
        }

    @classmethod
    def kept(cls, record: dict, text: str, *, note: str) -> "PageRead":
        """A page an earlier attempt read, handed back without a request.

        Marked `reused`, and it keeps the day it was originally retrieved: a
        recovery re-reads old text, and dating it today would present a
        month-old review page as a fresh check.
        """
        retrieved = record.get("retrieved_at") or ""
        try:
            retrieved_at = datetime.fromisoformat(retrieved)
        except ValueError:
            retrieved_at = datetime.now(timezone.utc)
        return cls(
            requested_url=record.get("requested_url", ""),
            final_url=record.get("final_url", ""),
            state=record.get("state", "ok"),
            http_status=record.get("http_status"),
            title=record.get("title", ""),
            text=text,
            published_at=record.get("published_at", ""),
            retrieved_at=retrieved_at,
            content_hash=record.get("content_hash", ""),
            byte_count=record.get("byte_count", 0),
            origin=record.get("origin", "lead"),
            reused=True,
            branch_anchored=bool(record.get("branch_anchored", False)),
            note=note,
        )


def is_worth_fetching(url: str) -> bool:
    """Whether a URL is a page at all, before anything is spent on it."""
    trimmed = (url or "").strip()
    if not trimmed.lower().startswith(("http://", "https://")):
        return False
    if any(bad in trimmed.lower() for bad in _NOT_A_SOURCE):
        return False
    parsed = urlparse(trimmed)
    return bool(parsed.hostname) and "." in parsed.hostname


def normalise(url: str) -> str:
    """One spelling per page, so the same page is not fetched twice.

    Fragments dropped, trailing slash on a bare host dropped. Query strings are
    kept: a menu page and its category filter are different pages, and guessing
    which parameters matter is how a reader silently reads the wrong one.
    """
    parsed = urlparse((url or "").strip())
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    return urlunparse(
        (parsed.scheme.lower(), parsed.netloc.lower(), path, "", parsed.query, "")
    )


def _resolves_publicly(host: str) -> tuple[bool, str]:
    """Whether a hostname resolves, and whether what it resolves to is public.

    Two different answers, returned as two, because they are two different
    facts about a lead. A host that does not exist is a dead link; a host that
    resolves to `127.0.0.1` is an attempt to make this reader fetch something
    private. The first version of this returned False for both, so BarBarian's
    official site -- which simply has no DNS record -- was recorded as an
    address this reader refused, which reads as a safety refusal and sent the
    next person looking for the wrong problem.

    Checked at every hop rather than once, because a public URL is free to
    redirect to a private one and a check that only runs on the first URL
    catches nothing.
    """
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False, "no_dns"
    if not infos:
        return False, "no_dns"
    for info in infos:
        raw = info[4][0]
        try:
            address = ipaddress.ip_address(raw)
        except ValueError:
            return False, "private"
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_reserved
            or address.is_multicast
            or address.is_unspecified
        ):
            return False, "private"
    return True, ""


_DATE_META = (
    "article:published_time",
    "datePublished",
    "date",
    "pubdate",
    "publish-date",
    "DC.date.issued",
)
_DATE_IN_TEXT = re.compile(r"\b(19\d{2}|20\d{2})(-\d{2})?(-\d{2})?\b")


def _published_date(html: str, extracted_date: str | None) -> str:
    """The page's own publication date, or nothing.

    Trafilatura's metadata first, then the handful of meta tags that carry it.
    Nothing is inferred from the URL or from a year appearing in the body: a
    2023 mentioned in a sentence is a date the article is *about*, and reading
    it as the publication date is how a menu acquires a currency it never had.

    The extractor's answer is only accepted when the date it produced is IN the
    page, character for character. It will otherwise happily build one out of a
    copyright year: McCarthy's Rappi listing carries no date at all and came
    back as 2026-01-01, which would have made a delivery menu look freshly
    published. `2026` was in the footer; `2026-01-01` was nowhere.
    """
    if extracted_date:
        trimmed = str(extracted_date)[:10]
        if re.match(r"^\d{4}(-\d{2})?(-\d{2})?$", trimmed) and trimmed in html:
            return trimmed
    for key in _DATE_META:
        match = re.search(
            rf'<meta[^>]+(?:property|name|itemprop)=["\']{re.escape(key)}["\'][^>]*'
            rf'content=["\']([^"\']{{4,40}})["\']',
            html,
            re.I,
        )
        if match:
            found = _DATE_IN_TEXT.search(match.group(1))
            if found:
                return match.group(1).strip()[:10]
    return ""


def _title(html: str, extracted_title: str | None) -> str:
    if extracted_title:
        return re.sub(r"\s+", " ", str(extracted_title)).strip()[:300]
    match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    return re.sub(r"\s+", " ", match.group(1)).strip()[:300] if match else ""


def _extract(html: str) -> tuple[str, str, str]:
    """Body text, title and publication date out of one HTML document."""
    body = ""
    title = None
    date = None
    try:
        import trafilatura
        from trafilatura.metadata import extract_metadata

        body = (
            trafilatura.extract(
                html,
                include_comments=False,
                include_tables=True,
                favor_recall=True,
            )
            or ""
        )
        meta = extract_metadata(html)
        if meta is not None:
            title = getattr(meta, "title", None)
            date = getattr(meta, "date", None)
    except Exception as error:  # pragma: no cover -- extractor is third party
        logger.info("Page extraction fell back to raw stripping: %s", error)
    if not body.strip():
        stripped = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
        stripped = re.sub(r"(?s)<[^>]+>", " ", stripped)
        body = re.sub(r"\s+", " ", stripped).strip()
    return body[:MAX_TEXT_CHARS], _title(html, title), _published_date(html, date)


def _fetch_once(client, url: str, *, deadline: float) -> PageRead:
    """One URL, its redirects followed by hand, bounded at every step."""
    page = PageRead(requested_url=url, final_url=url)
    current = url
    for _hop in range(MAX_REDIRECTS + 1):
        if time.monotonic() > deadline:
            page.state = "timeout"
            page.note = "The attempt's reading time ran out before this page."
            return page
        parsed = urlparse(current)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            page.state = "refused_address"
            page.note = f"{parsed.scheme or 'that'} is not a scheme this reads."
            return page
        public, why = _resolves_publicly(parsed.hostname)
        if not public:
            if why == "no_dns":
                page.state = "no_such_host"
                page.note = (
                    f"{parsed.hostname} has no DNS record. The address the "
                    "search gave does not exist."
                )
            else:
                page.state = "refused_address"
                page.note = (
                    f"{parsed.hostname} resolves to a private address; "
                    "refused at this hop."
                )
            return page
        try:
            response = client.get(current, follow_redirects=False)
        except Exception as error:  # noqa: BLE001 -- every network shape recorded
            page.state = (
                "timeout" if "Timeout" in type(error).__name__ else "error"
            )
            page.note = f"{type(error).__name__} while fetching."
            page.final_url = current
            return page
        page.http_status = response.status_code
        page.final_url = current
        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("location", "")
            if not location:
                page.state = "error"
                page.note = "A redirect with nowhere to go."
                return page
            current = str(response.url.join(location))
            continue
        if response.status_code in (401, 402, 403, 429):
            page.state = "blocked"
            page.note = f"The page answered {response.status_code}."
            return page
        if response.status_code == 404 or response.status_code == 410:
            page.state = "not_found"
            page.note = f"The page answered {response.status_code}."
            return page
        if response.status_code >= 400:
            page.state = "error"
            page.note = f"The page answered {response.status_code}."
            return page

        content_type = response.headers.get("content-type", "").split(";")[0].strip()
        raw = response.content or b""
        page.byte_count = len(raw)
        if page.byte_count > MAX_BYTES:
            page.state = "too_large"
            page.note = f"{page.byte_count} bytes is past this reader's ceiling."
            return page
        if content_type and not any(
            content_type.startswith(kind) for kind in _HTML_TYPES
        ):
            page.state = "unsupported_type"
            page.note = (
                f"{content_type} is not text this reads. An image-only menu is "
                "an access gap, not an absence of a menu."
            )
            return page
        page.content_hash = hashlib.sha256(raw).hexdigest()[:32]
        html = raw.decode(response.encoding or "utf-8", errors="replace")
        body, title, published = _extract(html)
        page.title = title
        page.published_at = published
        page.text = body
        page.state = "ok" if body.strip() else "empty"
        # A search result is a Google redirect, so every one of them ends
        # somewhere other than the path requested. That is the redirect doing
        # its job, not a swapped page -- and the note is read by the
        # extraction, which was told of every search page that it was "not the
        # page the search named".
        requested = urlparse(page.requested_url)
        if (
            page.state == "ok"
            and requested.hostname != _GROUNDING_REDIRECT_HOST
            and requested.path.rstrip("/") not in (parsed.path.rstrip("/"), "")
        ):
            # Rappi answers an unknown menu slug with its restaurant index, at
            # 200. The text is real and it is not the page anybody asked for,
            # and a reader that does not say so has quietly swapped the source.
            page.note = (
                f"Redirected away from the address requested, to "
                f"{parsed.path or '/'}. This is not the page the search named."
            )
        if page.state == "empty":
            page.note = (
                "The page was reachable and carried no readable text -- an "
                "image-only or script-rendered page."
            )
        return page
    page.state = "redirect_loop"
    page.note = f"More than {MAX_REDIRECTS} redirects."
    return page


def read_pages(
    urls: list[tuple[str, str]],
    *,
    budget: int,
    already_read: dict[str, PageRead] | None = None,
    client=None,
) -> list[PageRead]:
    """Read up to `budget` distinct pages, and say what happened to each.

    `urls` is (url, origin) pairs in the order they are worth reading. A URL
    this attempt has already read is returned from `already_read` marked
    `reused` rather than fetched again -- within one attempt that is obviously
    right, and the flag is what stops a later refresh presenting cached text as
    a fresh check.

    Nothing here raises. A reader that throws on a blocked page turns one
    inaccessible source into a failed research request, and the request's whole
    point is to say which sources it could not reach.
    """
    held = dict(already_read or {})
    reads: list[PageRead] = []
    seen: set[str] = set()
    spent = 0
    deadline = time.monotonic() + WHOLE_READ_DEADLINE_SECONDS

    owned = client is None
    if owned:
        try:
            import httpx

            client = httpx.Client(
                timeout=PER_PAGE_TIMEOUT_SECONDS,
                follow_redirects=False,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
                },
            )
        except Exception as error:  # pragma: no cover -- httpx is a dependency
            logger.warning("No HTTP client available for page reading: %s", error)
            return []

    try:
        for url, origin in urls:
            if not is_worth_fetching(url):
                continue
            key = normalise(url)
            if key in seen:
                continue
            seen.add(key)
            if key in held:
                reuse = held[key]
                reads.append(
                    PageRead(
                        requested_url=url,
                        final_url=reuse.final_url,
                        state=reuse.state,
                        http_status=reuse.http_status,
                        title=reuse.title,
                        text=reuse.text,
                        published_at=reuse.published_at,
                        retrieved_at=reuse.retrieved_at,
                        content_hash=reuse.content_hash,
                        byte_count=reuse.byte_count,
                        origin=origin,
                        reused=True,
                        note=reuse.note,
                    )
                )
                continue
            if spent >= budget:
                reads.append(
                    PageRead(
                        requested_url=url,
                        final_url=url,
                        state="budget_exhausted",
                        origin=origin,
                        note=(
                            # `budget` is what was left for this batch, not
                            # the attempt's whole allowance, and says so.
                            f"The reading budget was already spent ({budget} "
                            "page(s) were left for this batch). The page is an "
                            "unread lead."
                        ),
                    )
                )
                continue
            page = _fetch_once(client, url, deadline=deadline)
            page.origin = origin
            spent += 1
            held[key] = page
            reads.append(page)
    finally:
        if owned:
            try:
                client.close()
            except Exception:  # pragma: no cover
                pass
    return reads
