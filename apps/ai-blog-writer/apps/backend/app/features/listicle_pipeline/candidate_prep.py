"""What has to be true before one place is researched, and whether it is.

One function computes readiness and both the card and the research request read
its answer. A second, client-side version of the same rule is how a button
comes back enabled over a board that has moved -- and the request that follows
it spends money on a place nobody approved.

The answer is a list of blockers, not a disabled button. "Research this place"
greyed out with no reason is a screen that cannot be argued with; a list saying
"Google calls this permanently closed and nobody has resolved that" is a screen
somebody can act on.

What preparation is NOT
-----------------------
It is not approval of the place. Nothing here judges whether the venue belongs
on the list; the cut review does that, badly, and the operator does it properly.
Preparation answers a narrower question: do we know WHICH place this is, is it
still open, and has every warning standing against this card been dealt with by
a person. A research call against an unresolved identity buys material about
the wrong building.

Confirmations are bound to what they were made about
----------------------------------------------------
Ticking "still open" against a Google record is a statement about that record.
If the identity underneath changes -- a different Place ID, a different address
-- the tick is about something else and is shown as stale. Editing an optional
link does not touch it: the link is not what the tick was about.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import urlparse

from app.core.database import get_db_connection

_PREP = """
CREATE TABLE IF NOT EXISTS listicle_candidate_prep (
    run_id       TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    -- Bumped on every save. What an optimistic save checks against, and what
    -- the research request quotes back so a click made against a card that has
    -- since moved is refused rather than acted on.
    version      INTEGER NOT NULL DEFAULT 0,
    -- "This is the right place and the right branch", against the Google
    -- record it was ticked over.
    identity_confirmed_at  TEXT NOT NULL DEFAULT '',
    identity_confirmed_by  TEXT NOT NULL DEFAULT '',
    identity_fingerprint   TEXT NOT NULL DEFAULT '',
    -- "Still open." Bound to the identity AND the Google status, because both
    -- are what the person was looking at when they ticked it.
    open_confirmed_at      TEXT NOT NULL DEFAULT '',
    open_confirmed_by      TEXT NOT NULL DEFAULT '',
    open_fingerprint       TEXT NOT NULL DEFAULT '',
    -- Why research should go ahead over a temporary or missing opening status.
    -- A sentence somebody wrote, not a checkbox: a weak Google status is not
    -- something a tick can clear.
    status_note            TEXT NOT NULL DEFAULT '',
    status_note_fingerprint TEXT NOT NULL DEFAULT '',
    -- "Keep this for this list" over a cut warning, and why. It resolves the
    -- warning. It does not make the warning untrue.
    exclusion_decision     TEXT NOT NULL DEFAULT '',
    exclusion_reason       TEXT NOT NULL DEFAULT '',
    exclusion_fingerprint  TEXT NOT NULL DEFAULT '',
    exclusion_at           TEXT NOT NULL DEFAULT '',
    exclusion_by           TEXT NOT NULL DEFAULT '',
    -- "I checked this against the exclusions myself", for a card the paid cut
    -- review never reached. Absence of a flag is not a check.
    cut_confirmed_at       TEXT NOT NULL DEFAULT '',
    cut_confirmed_by       TEXT NOT NULL DEFAULT '',
    cut_fingerprint        TEXT NOT NULL DEFAULT '',
    -- Optional. Empty is valid and contributes nothing to required progress.
    tripadvisor_url        TEXT NOT NULL DEFAULT '',
    -- [{label, url}]. Saving a link never fetches it.
    source_links           TEXT NOT NULL DEFAULT '[]',
    updated_at             TEXT NOT NULL,
    PRIMARY KEY (run_id, candidate_id)
)
"""


def ensure_tables() -> None:
    with get_db_connection() as conn:
        conn.execute(_PREP)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _fingerprint(*parts: object) -> str:
    return hashlib.sha1(
        "|".join("" if part is None else str(part) for part in parts).encode("utf-8")
    ).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Links
# ---------------------------------------------------------------------------

_TRIPADVISOR_HOST = re.compile(r"(^|\.)tripadvisor\.[a-z]{2,3}(\.[a-z]{2})?$", re.I)
_TRIPADVISOR_PLACE = re.compile(r"-d\d{3,}(-|\.|$)")


def is_tripadvisor_place_link(text: str) -> bool:
    """Whether a pasted link is a TripAdvisor page for one place.

    The same rule the card applies, computed here as well rather than instead:
    the screen says so while typing, and this is what decides whether a saved
    link blocks research. Checked by shape and never by fetching -- saving a
    link must not make the server go and read it.
    """
    trimmed = (text or "").strip()
    if not trimmed:
        return False
    url = urlparse(trimmed if "://" in trimmed else f"https://{trimmed}")
    if url.scheme not in {"http", "https"} or not url.hostname:
        return False
    return bool(
        _TRIPADVISOR_HOST.search(url.hostname)
        and _TRIPADVISOR_PLACE.search(url.path or "")
    )


def is_usable_link(text: str) -> bool:
    """Whether a pasted link is a link at all. Nothing is fetched."""
    trimmed = (text or "").strip()
    if not trimmed:
        return False
    url = urlparse(trimmed if "://" in trimmed else f"https://{trimmed}")
    return url.scheme in {"http", "https"} and bool(url.hostname) and "." in url.hostname


# ---------------------------------------------------------------------------
# Stored preparation
# ---------------------------------------------------------------------------


@dataclass
class Prep:
    """What somebody has said about one card, as stored."""

    run_id: str
    candidate_id: str
    version: int = 0
    identity_confirmed_at: str = ""
    identity_confirmed_by: str = ""
    identity_fingerprint: str = ""
    open_confirmed_at: str = ""
    open_confirmed_by: str = ""
    open_fingerprint: str = ""
    status_note: str = ""
    status_note_fingerprint: str = ""
    exclusion_decision: str = ""
    exclusion_reason: str = ""
    exclusion_fingerprint: str = ""
    exclusion_at: str = ""
    exclusion_by: str = ""
    cut_confirmed_at: str = ""
    cut_confirmed_by: str = ""
    cut_fingerprint: str = ""
    tripadvisor_url: str = ""
    source_links: list[dict] = field(default_factory=list)
    updated_at: str = ""

    def as_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "candidate_id": self.candidate_id,
            "version": self.version,
            "identity_confirmed": bool(self.identity_confirmed_at),
            "identity_confirmed_at": self.identity_confirmed_at,
            "identity_confirmed_by": self.identity_confirmed_by,
            "open_confirmed": bool(self.open_confirmed_at),
            "open_confirmed_at": self.open_confirmed_at,
            "open_confirmed_by": self.open_confirmed_by,
            "status_note": self.status_note,
            "exclusion_decision": self.exclusion_decision,
            "exclusion_reason": self.exclusion_reason,
            "exclusion_at": self.exclusion_at,
            "cut_confirmed": bool(self.cut_confirmed_at),
            "cut_confirmed_at": self.cut_confirmed_at,
            "tripadvisor_url": self.tripadvisor_url,
            "source_links": list(self.source_links),
            "updated_at": self.updated_at,
        }


_FIELDS = (
    "version",
    "identity_confirmed_at",
    "identity_confirmed_by",
    "identity_fingerprint",
    "open_confirmed_at",
    "open_confirmed_by",
    "open_fingerprint",
    "status_note",
    "status_note_fingerprint",
    "exclusion_decision",
    "exclusion_reason",
    "exclusion_fingerprint",
    "exclusion_at",
    "exclusion_by",
    "cut_confirmed_at",
    "cut_confirmed_by",
    "cut_fingerprint",
    "tripadvisor_url",
    "source_links",
    "updated_at",
)


def load_prep(run_id: str) -> dict[str, Prep]:
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM listicle_candidate_prep WHERE run_id = ?", (run_id,)
        ).fetchall()
    found: dict[str, Prep] = {}
    for row in rows:
        found[row["candidate_id"]] = Prep(
            run_id=row["run_id"],
            candidate_id=row["candidate_id"],
            version=int(row["version"]),
            identity_confirmed_at=row["identity_confirmed_at"],
            identity_confirmed_by=row["identity_confirmed_by"],
            identity_fingerprint=row["identity_fingerprint"],
            open_confirmed_at=row["open_confirmed_at"],
            open_confirmed_by=row["open_confirmed_by"],
            open_fingerprint=row["open_fingerprint"],
            status_note=row["status_note"],
            status_note_fingerprint=row["status_note_fingerprint"],
            exclusion_decision=row["exclusion_decision"],
            exclusion_reason=row["exclusion_reason"],
            exclusion_fingerprint=row["exclusion_fingerprint"],
            exclusion_at=row["exclusion_at"],
            exclusion_by=row["exclusion_by"],
            cut_confirmed_at=row["cut_confirmed_at"],
            cut_confirmed_by=row["cut_confirmed_by"],
            cut_fingerprint=row["cut_fingerprint"],
            tripadvisor_url=row["tripadvisor_url"],
            source_links=json.loads(row["source_links"] or "[]"),
            updated_at=row["updated_at"],
        )
    return found


def prep_for(run_id: str, candidate_id: str) -> Prep:
    return load_prep(run_id).get(
        candidate_id, Prep(run_id=run_id, candidate_id=candidate_id)
    )


class PrepConflict(RuntimeError):
    """A save written against a version of the card that has since moved."""

    def __init__(self, current_version: int) -> None:
        super().__init__(
            "This card was saved somewhere else while you were working on it. "
            "It has been re-read; make the change again."
        )
        self.current_version = current_version


def save_prep(prep: Prep, *, expected_version: int | None = None) -> Prep:
    """Write one card's preparation, bumping its version.

    Optimistic rather than last-write-wins: two tabs on one board is ordinary,
    and a confirmation silently overwritten is a confirmation nobody made.
    """
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT version FROM listicle_candidate_prep WHERE run_id = ? "
            "AND candidate_id = ?",
            (prep.run_id, prep.candidate_id),
        ).fetchone()
        current = int(row["version"]) if row else 0
        if expected_version is not None and expected_version != current:
            raise PrepConflict(current)
        saved = Prep(**{**prep.__dict__, "version": current + 1, "updated_at": _now()})
        columns = ", ".join(_FIELDS)
        updates = ", ".join(f"{name}=excluded.{name}" for name in _FIELDS)
        values = [
            json.dumps(getattr(saved, name), ensure_ascii=False)
            if name == "source_links"
            else getattr(saved, name)
            for name in _FIELDS
        ]
        conn.execute(
            f"INSERT INTO listicle_candidate_prep (run_id, candidate_id, {columns}) "
            f"VALUES (?, ?, {', '.join(['?'] * len(_FIELDS))}) "
            f"ON CONFLICT(run_id, candidate_id) DO UPDATE SET {updates}",
            [saved.run_id, saved.candidate_id, *values],
        )
    return saved


# ---------------------------------------------------------------------------
# Readiness
# ---------------------------------------------------------------------------


@dataclass
class Blocker:
    """One reason this place cannot be researched yet, and what fixes it."""

    code: str
    message: str
    # `prep` -- the operator can clear it on the card itself.
    # `board` -- it is resolved through the duplicate or removal workflow.
    # `google` -- it needs a Google check that has not happened.
    # `execution` -- something is running; waiting clears it.
    where: str = "prep"

    def as_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "where": self.where}


@dataclass
class Readiness:
    candidate_id: str
    ready: bool
    blockers: list[Blocker]
    required_total: int
    required_done: int
    prep_version: int
    identity_fingerprint: str
    status_fingerprint: str
    exclusion_fingerprint: str
    cut_fingerprint: str
    # Said on the card beside the tick, so a confirmation is made against a
    # named place rather than against a checkbox.
    google_name: str = ""
    google_address: str = ""
    place_id: str = ""

    def as_dict(self) -> dict:
        return {
            "candidate_id": self.candidate_id,
            "ready": self.ready,
            "blockers": [blocker.as_dict() for blocker in self.blockers],
            "required_total": self.required_total,
            "required_done": self.required_done,
            "progress": (
                self.required_done / self.required_total
                if self.required_total
                else 0.0
            ),
            "prep_version": self.prep_version,
            "identity_fingerprint": self.identity_fingerprint,
            "status_fingerprint": self.status_fingerprint,
            "exclusion_fingerprint": self.exclusion_fingerprint,
            "cut_fingerprint": self.cut_fingerprint,
            "google_name": self.google_name,
            "google_address": self.google_address,
            "place_id": self.place_id,
        }


@dataclass
class BoardContext:
    """Everything readiness is computed from, read once for the whole run.

    Assembled here rather than per card because thirty-five cards asking the
    same four questions of SQLite is the difference between a screen that opens
    and one that thinks about it.
    """

    run_id: str
    order_revision: int
    exclusions: str
    place: str
    kind: str
    standard: str
    topic: str
    topic_label: str
    candidates: dict[str, dict]
    removed: dict[str, dict]
    distinct: set[tuple[str, str]]
    checks: dict[str, dict]
    preps: dict[str, Prep]
    cut_review_status: str


def context(run_id: str) -> BoardContext:
    """Read the run once: order, candidates, board decisions, Google, prep."""
    from . import store
    from .spec import topic_key_of, topic_label_of

    order = store.load_order(run_id)
    if order is None:
        raise LookupError("This run has not agreed a search order yet.")
    from . import service

    found = service.progress(run_id)
    if found is None:
        raise LookupError("This run has no search results yet.")
    board = store.load_board(run_id)
    return BoardContext(
        run_id=run_id,
        order_revision=order.revision,
        exclusions=order.exclusions or "",
        place=order.place or "",
        kind=order.kind or "",
        standard=order.standard or "",
        topic=topic_key_of(order),
        topic_label=topic_label_of(order),
        candidates={
            candidate["candidate_id"]: candidate
            for candidate in found.get("candidates", [])
        },
        removed={entry["candidate_id"]: entry for entry in board["removed"]},
        distinct={
            (min(one, other), max(one, other))
            for one, other in board["distinct_pairs"]
        },
        checks=store.load_google_checks(run_id),
        preps=load_prep(run_id),
        cut_review_status=str(found.get("cut_review_status") or "not_checked"),
    )


def identity_fingerprint(check: dict) -> str:
    """Which building this card is about, as far as Google has said."""
    return _fingerprint(
        check.get("place_id", ""),
        check.get("google_name", ""),
        check.get("address", ""),
    )


def status_fingerprint(check: dict) -> str:
    """What Google says about whether it is open and what kind of place it is,
    including the operator's own overrides of both."""
    return _fingerprint(
        check.get("status", ""),
        check.get("business_status", ""),
        check.get("is_venue", ""),
        check.get("closed_dismissed", False),
        check.get("venue_dismissed", False),
    )


def exclusion_fingerprint(candidate: dict) -> str:
    return _fingerprint(
        candidate.get("barred", ""), candidate.get("barred_confidence", "")
    )


def cut_fingerprint(ctx: BoardContext, candidate: dict) -> str:
    return _fingerprint(
        ctx.exclusions, candidate.get("cut_reviewed", False), ctx.cut_review_status
    )


def readiness_of(
    ctx: BoardContext,
    candidate_id: str,
    *,
    active_attempt=None,
) -> Readiness:
    """Whether this one place can be researched, and what is in the way.

    The single computation. The card renders its answer and the research
    request re-runs it before spending anything, so a screen that has drifted
    cannot talk the server into a call.
    """
    prep = ctx.preps.get(candidate_id) or Prep(
        run_id=ctx.run_id, candidate_id=candidate_id
    )
    candidate = ctx.candidates.get(candidate_id)
    check = ctx.checks.get(candidate_id, {})
    identity_fp = identity_fingerprint(check)
    status_fp = status_fingerprint(check)
    blockers: list[Blocker] = []

    if candidate is None:
        return Readiness(
            candidate_id=candidate_id,
            ready=False,
            blockers=[
                Blocker(
                    "not_on_board",
                    "This place is not on the current list. Research is for "
                    "places still in the running; what was already found about "
                    "it is still readable.",
                    "board",
                )
            ],
            required_total=0,
            required_done=0,
            prep_version=prep.version,
            identity_fingerprint=identity_fp,
            status_fingerprint=status_fp,
            exclusion_fingerprint="",
            cut_fingerprint="",
        )
    if candidate_id in ctx.removed:
        entry = ctx.removed[candidate_id]
        blockers.append(
            Blocker(
                "removed",
                "This place is off the list ("
                + str(entry.get("reason") or "duplicate")
                + "). Put it back first if it should be researched.",
                "board",
            )
        )

    exclusion_fp = exclusion_fingerprint(candidate)
    cut_fp = cut_fingerprint(ctx, candidate)

    # --- required: which place is this -------------------------------------
    required_done = 0
    required_total = 2  # identity, still open. Everything else is conditional.

    resolved = (
        check.get("status") == "found"
        and bool(check.get("place_id"))
        and bool(check.get("address"))
    )
    if not resolved:
        blockers.append(
            Blocker(
                "identity_unresolved",
                "Google has not resolved this name to a place with an address. "
                "Check it on Google first — research without an address finds "
                "the wrong branch.",
                "google",
            )
        )
    elif not prep.identity_confirmed_at:
        blockers.append(
            Blocker(
                "identity_unconfirmed",
                "Confirm this is the right place and the right branch.",
            )
        )
    elif prep.identity_fingerprint != identity_fp:
        blockers.append(
            Blocker(
                "identity_stale",
                "The Google match changed after this was confirmed. Look at it "
                "again and confirm the place that is there now.",
            )
        )
    else:
        required_done += 1

    # --- required: is it still open ----------------------------------------
    open_fp = _fingerprint(identity_fp, status_fp)
    if not prep.open_confirmed_at:
        blockers.append(
            Blocker(
                "open_unconfirmed",
                "Confirm the place is still open. Google saying OPERATIONAL is "
                "evidence, not the confirmation.",
            )
        )
    elif prep.open_fingerprint != open_fp:
        blockers.append(
            Blocker(
                "open_stale",
                "What Google says about this place changed after you confirmed "
                "it was open. Confirm it again.",
            )
        )
    else:
        required_done += 1

    # --- conditional: Google's own warnings --------------------------------
    if (
        check.get("business_status") == "CLOSED_PERMANENTLY"
        and not check.get("closed_dismissed")
    ):
        required_total += 1
        blockers.append(
            Blocker(
                "google_closed",
                "Google calls this permanently closed. Settle that through "
                "Remove or Put back before researching it.",
                "board",
            )
        )
    if check.get("is_venue") is False and not check.get("venue_dismissed"):
        required_total += 1
        blockers.append(
            Blocker(
                "not_a_venue",
                "Google lists this as something other than a restaurant or "
                "bar. Settle that before researching it.",
                "board",
            )
        )
    weak_status = check.get("business_status") in {"CLOSED_TEMPORARILY", "", None}
    if resolved and weak_status:
        required_total += 1
        note_fp = _fingerprint(identity_fp, status_fp)
        if not prep.status_note.strip():
            blockers.append(
                Blocker(
                    "status_note_missing",
                    "Google does not say this place is open right now. Write a "
                    "line saying why research should go ahead anyway.",
                )
            )
        elif prep.status_note_fingerprint != note_fp:
            blockers.append(
                Blocker(
                    "status_note_stale",
                    "Google's opening status changed after that note was "
                    "written. Read it again and say whether it still holds.",
                )
            )
        else:
            required_done += 1

    # --- conditional: duplicates -------------------------------------------
    open_pairs = [
        other
        for other in (candidate.get("possible_duplicate_ids") or [])
        if other not in ctx.removed
        and (min(candidate_id, other), max(candidate_id, other)) not in ctx.distinct
        and other in ctx.candidates
    ]
    if open_pairs:
        required_total += 1
        names = ", ".join(
            ctx.candidates[other].get("name", other) for other in open_pairs
        )
        blockers.append(
            Blocker(
                "duplicates_open",
                f"Settle whether this is the same place as {names} before "
                "researching either of them.",
                "board",
            )
        )
    else:
        if candidate.get("possible_duplicate_ids"):
            required_done += 1

    # Two cards on the board resolved to ONE Google Place ID. Name-based
    # duplicate detection cannot see this -- "Tradición Chalaca Rovira 1907"
    # and "Bar Rovira del Callao" share no words -- and researching both buys
    # the same building twice and files it as two places.
    place_id = str(check.get("place_id") or "")
    if place_id:
        twins = [
            other_id
            for other_id, other in ctx.checks.items()
            if other_id != candidate_id
            and other.get("place_id") == place_id
            and other_id in ctx.candidates
            and other_id not in ctx.removed
        ]
        if twins and candidate_id not in ctx.removed:
            required_total += 1
            names = ", ".join(
                ctx.candidates[other].get("name", other) for other in twins
            )
            blockers.append(
                Blocker(
                    "identity_conflict",
                    f"Google resolves this and {names} to the same place. Two "
                    "cards cannot be one building; settle that first.",
                    "board",
                )
            )

    # --- conditional: the cut ----------------------------------------------
    if candidate.get("barred"):
        required_total += 1
        if prep.exclusion_decision != "keep":
            blockers.append(
                Blocker(
                    "exclusion_undecided",
                    "This looks like something you left out: "
                    f"{candidate['barred']} Keep it for this list and say why, "
                    "or take it off.",
                )
            )
        elif prep.exclusion_fingerprint != exclusion_fp:
            blockers.append(
                Blocker(
                    "exclusion_stale",
                    "The warning about this place changed after you decided to "
                    "keep it. Read the new one.",
                )
            )
        elif not prep.exclusion_reason.strip():
            blockers.append(
                Blocker(
                    "exclusion_reason_missing",
                    "Say why this one is kept despite the warning.",
                )
            )
        else:
            required_done += 1
    elif ctx.exclusions and not candidate.get("cut_reviewed"):
        # Nothing flagged this card, and nothing looked at it either. Absence
        # of a flag is not a check, and this is exactly the row that reads as
        # clean when it was never judged.
        required_total += 1
        if not prep.cut_confirmed_at:
            blockers.append(
                Blocker(
                    "cut_unchecked",
                    "Nothing has checked this place against what you left out. "
                    "Run the cut check, or say you have checked it yourself.",
                )
            )
        elif prep.cut_fingerprint != cut_fp:
            blockers.append(
                Blocker(
                    "cut_stale",
                    "What you left out changed after you checked this place "
                    "against it. Check it again.",
                )
            )
        else:
            required_done += 1

    # --- optional sources, which are optional -------------------------------
    if prep.tripadvisor_url.strip() and not is_tripadvisor_place_link(
        prep.tripadvisor_url
    ):
        blockers.append(
            Blocker(
                "tripadvisor_invalid",
                "That is not a TripAdvisor page for a place. Fix it or clear "
                "the box — the link is optional.",
            )
        )
    for link in prep.source_links:
        url = str(link.get("url", ""))
        if url.strip() and not is_usable_link(url):
            blockers.append(
                Blocker(
                    "source_link_invalid",
                    f"{link.get('label') or 'A source link'} is not a usable "
                    "web address. Fix it or remove it.",
                )
            )
            break

    # --- execution ----------------------------------------------------------
    if active_attempt is not None:
        if active_attempt.candidate_id == candidate_id:
            blockers.append(
                Blocker(
                    "research_running",
                    "This place is being researched right now.",
                    "execution",
                )
            )
        else:
            blockers.append(
                Blocker(
                    "another_running",
                    "Another place is being researched right now. One at a "
                    "time, so a mis-click cannot buy two calls.",
                    "execution",
                )
            )

    return Readiness(
        candidate_id=candidate_id,
        ready=not blockers,
        blockers=blockers,
        required_total=required_total,
        required_done=min(required_done, required_total),
        prep_version=prep.version,
        identity_fingerprint=identity_fp,
        status_fingerprint=status_fp,
        exclusion_fingerprint=exclusion_fp,
        cut_fingerprint=cut_fp,
        google_name=str(check.get("google_name") or ""),
        google_address=str(check.get("address") or ""),
        place_id=place_id,
    )
