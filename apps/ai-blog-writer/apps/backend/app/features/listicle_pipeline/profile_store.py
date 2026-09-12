"""Where place profiles are kept.

Three tables in the app's own SQLite file, every name prefixed `listicle_` like
the interview's and the search's, so this feature's storage is legible as one
group and cannot collide with another's.

Rows rather than a JSON blob, which is the opposite of what `store.py` does for
the interview and deliberately so. A grill state is one object read whole and
written whole; profiles are queried across places -- everything sighted by this
angle, everything with no award claim, everything not yet resolved to a Place
ID -- and none of that is answerable against a blob.

Writing is idempotent. Researching a place twice must not double its claims,
and the same listicle run re-run must not double its sightings, because both
will happen: a run gets resumed, a profile gets refreshed, and a place turns up
in three listicles a year apart.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import unicodedata
import uuid
from datetime import datetime, timezone

from app.core.database import get_db_connection

from .profiles import (
    Claim,
    FindingEvidence,
    PastBlurb,
    PlaceProfile,
    PossibleAngle,
    ResearchFinding,
    ResearchSource,
    Sighting,
)

_PROFILES = """
CREATE TABLE IF NOT EXISTS listicle_place_profiles (
    profile_id     TEXT PRIMARY KEY,
    -- Google Place ID. Unique when set; many rows may have none yet, and
    -- SQLite treats each NULL as distinct in a UNIQUE index, which is exactly
    -- the behaviour wanted: one resolved place cannot exist twice, and any
    -- number of unresolved ones can.
    place_id       TEXT,
    lm_location_id INTEGER,
    -- The identity used before a Place ID exists: normalised name plus city.
    -- Weak on purpose -- it is a placeholder, not the anchor -- but unique, so
    -- two searches returning the same name in the same city meet the same row.
    provisional_key TEXT NOT NULL,
    name           TEXT NOT NULL,
    city           TEXT NOT NULL DEFAULT '',
    district       TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
)
"""

_CLAIMS = """
CREATE TABLE IF NOT EXISTS listicle_profile_claims (
    claim_id   TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    kind       TEXT NOT NULL,
    text       TEXT NOT NULL,
    -- Who published it. Kept beside the URL rather than instead of it: the
    -- URL is a grounding redirect that names nobody and will not outlive the
    -- claim, and the name is what still means something in two years.
    source_name TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    found_at   TEXT NOT NULL,
    about_year INTEGER,
    -- A hash of the claim's normalised text, so researching a place twice
    -- recognises what it already has. Claims arrive worded slightly
    -- differently each time; the hash is over the words, not the punctuation.
    text_key   TEXT NOT NULL,
    UNIQUE (profile_id, text_key)
)
"""

_SIGHTINGS = """
CREATE TABLE IF NOT EXISTS listicle_profile_sightings (
    profile_id TEXT NOT NULL,
    run_id     TEXT NOT NULL,
    angle      TEXT NOT NULL,
    seen_at    TEXT NOT NULL,
    -- One row per (place, run, angle). A resumed or repeated run records the
    -- same sighting, and a sighting counted twice inflates the one signal this
    -- pipeline gets for free.
    PRIMARY KEY (profile_id, run_id, angle)
)
"""

_BLURBS = """
CREATE TABLE IF NOT EXISTS listicle_profile_blurbs (
    blurb_id   TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    run_id     TEXT NOT NULL DEFAULT '',
    angle      TEXT NOT NULL DEFAULT '',
    text       TEXT NOT NULL,
    written_at TEXT NOT NULL,
    -- Hash of the words. Writing the same sentence twice is the thing this
    -- table exists to prevent, so storing it twice would be absurd.
    text_key   TEXT NOT NULL,
    UNIQUE (profile_id, text_key)
)
"""

_INDEXES = (
    "CREATE UNIQUE INDEX IF NOT EXISTS listicle_profiles_place_id "
    "ON listicle_place_profiles (place_id) WHERE place_id IS NOT NULL",
    # Unique only among profiles that have NOT been anchored.
    #
    # It used to be unique across every row, which is what made two Place IDs
    # collide: "Azul" in Centro and "Azul" in Barranco resolve to different
    # real bars, and the second one could not be inserted because a row with
    # its provisional key already existed. The lookup fell through to that row
    # and handed back a profile anchored to the other bar's Place ID.
    #
    # Two resolved profiles are allowed to share a name. That is what having a
    # Place ID means: they are identified by something better than the name.
    "CREATE UNIQUE INDEX IF NOT EXISTS listicle_profiles_provisional "
    "ON listicle_place_profiles (provisional_key) WHERE place_id IS NULL",
    "CREATE INDEX IF NOT EXISTS listicle_profiles_provisional_lookup "
    "ON listicle_place_profiles (provisional_key)",
    "CREATE INDEX IF NOT EXISTS listicle_sightings_angle "
    "ON listicle_profile_sightings (angle)",
)


# Words that do not distinguish one business from another. Shared in spirit
# with the search runner's list, kept separate because that one is tuned for
# collapsing rows inside a single run and this one for recognising a place a
# year later.
_NOISE = {
    "restaurant", "restaurante", "cevicheria", "cebicheria", "bar", "cafe",
    "the", "el", "la", "los", "las", "de", "del", "and", "y",
}


def _tokens(value: str) -> list[str]:
    without_aside = re.sub(r"\([^)]*\)", " ", value)
    folded = unicodedata.normalize("NFKD", without_aside.lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return [w for w in re.findall(r"[a-z0-9]+", folded) if w not in _NOISE]


def provisional_key(name: str, city: str, district: str = "") -> str:
    """The identity a profile has before it is resolved to a Place ID.

    Explicitly a placeholder. Name matching is what splits "Bar Inglés" from
    "Bar Inglés del Country Club", and no amount of normalising fixes that --
    which is why the Place ID is the anchor and this is only what holds a
    profile together until resolution runs.

    The district and the bracketed qualifier are part of it. Without them two
    unresolved branches of one chain were one profile: "Azul" in Centro and
    "Azul" in Barranco met the same row and their claims were merged into one
    place that does not exist. A key that knows about branches is still a
    placeholder -- it just stops being one that actively destroys evidence.
    """
    words = _tokens(name) or [re.sub(r"[^a-z0-9]+", "", name.lower())]
    place = "".join(_tokens(city))
    where = "".join(_tokens(district))
    qualifier = "".join(sorted(_qualifier_tokens(name)))
    return f"{''.join(words)}@{place}#{where}~{qualifier}"


def _qualifier_tokens(value: str) -> set[str]:
    """What a name says about itself in brackets.

    "Gran Hotel Bolívar (Bar Catedral)" and "Gran Hotel Bolívar (Bar Maury)"
    are two bars sharing every word of the building's name. This is the only
    thing that tells them apart before either is anchored.
    """
    asides = " ".join(re.findall(r"\(([^)]*)\)", value))
    folded = unicodedata.normalize("NFKD", asides.lower())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return {w for w in re.findall(r"[a-z0-9]+", folded) if w not in _NOISE}


def claim_text_key(text: str) -> str:
    """A claim's identity: its words, ignoring how they were punctuated."""
    words = re.findall(r"[a-z0-9]+", unicodedata.normalize("NFKD", text.lower()))
    return hashlib.sha1(" ".join(words).encode("utf-8")).hexdigest()


def _iso(moment: datetime) -> str:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).isoformat()


def _parse(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def ensure_tables() -> None:
    with get_db_connection() as conn:
        conn.execute(_PROFILES)
        conn.execute(_CLAIMS)
        conn.execute(_SIGHTINGS)
        conn.execute(_BLURBS)
        _widen_provisional_index(conn)
        for statement in _INDEXES:
            conn.execute(statement)


def _widen_provisional_index(conn) -> None:
    """Replace the index that made two Place IDs collide.

    The old one was unique across every row, so a second real business with the
    same name in the same city could not be inserted -- and the lookup fell
    through to the first one's profile. Two resolved profiles are allowed to
    share a name; that is what having a Place ID means.

    Dropped and recreated rather than migrated around, because an index is not
    data: the rows are untouched, and the old definition is what the new one
    replaces. Existing profiles whose provisional keys now differ (the key
    gained the district) keep the keys they were stored with -- they are
    placeholders, they are only read for unanchored rows, and rewriting them
    would move identities under claims already attached to them.
    """
    existing = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
        ("listicle_profiles_provisional",),
    ).fetchone()
    if existing is None:
        return
    if existing["sql"] and "place_id IS NULL" in existing["sql"]:
        return
    conn.execute("DROP INDEX IF EXISTS listicle_profiles_provisional")


class AmbiguousProfile(LookupError):
    """More than one anchored profile answers to this name in this city.

    Raised rather than resolved. Two bars called Azul in two districts are two
    real businesses, and returning whichever row the database listed first is
    how one of them ends up wearing the other's claims. The caller is told
    which profiles matched and asked to say which it means.
    """

    def __init__(self, name: str, profile_ids: list[str]) -> None:
        super().__init__(
            f"{name!r} matches {len(profile_ids)} anchored profiles; say which "
            "one is meant rather than taking the first."
        )
        self.profile_ids = profile_ids


def find(
    *,
    place_id: str = "",
    name: str = "",
    city: str = "",
    district: str = "",
) -> PlaceProfile | None:
    """The profile for this place, by Place ID if we have one, else by name.

    **A supplied Place ID is the answer.** If it matches nothing, the answer is
    that there is no profile yet -- not "here is a profile with a different
    Place ID". Falling through to the name was the whole of R9: opening "Azul"
    with Place ID B found the Azul anchored to Place ID A and handed it back,
    so a second real bar silently became the first one.

    **A name-only lookup that matches several anchored profiles refuses.**
    Place ID is what makes two same-named places distinguishable; a name is
    not, and picking the first row is picking arbitrarily.
    """
    ensure_tables()
    with get_db_connection() as conn:
        if place_id:
            row = conn.execute(
                "SELECT * FROM listicle_place_profiles WHERE place_id = ?", (place_id,)
            ).fetchone()
            return None if row is None else _hydrate(conn, row)
        if not name:
            return None
        rows = conn.execute(
            "SELECT * FROM listicle_place_profiles WHERE provisional_key = ?",
            (provisional_key(name, city, district),),
        ).fetchall()
        if not rows:
            return None
        anchored = [row for row in rows if row["place_id"]]
        if len(anchored) > 1:
            raise AmbiguousProfile(name, [row["profile_id"] for row in anchored])
        # An unresolved profile is unique by construction, and one anchored
        # profile answering to this exact branch identity is an answer.
        return _hydrate(conn, anchored[0] if anchored else rows[0])


def _hydrate(conn: sqlite3.Connection, row: sqlite3.Row) -> PlaceProfile:
    profile_id = row["profile_id"]
    claims = [
        Claim(
            kind=c["kind"],
            text=c["text"],
            source_name=c["source_name"],
            source_url=c["source_url"],
            found_at=_parse(c["found_at"]),
            about_year=c["about_year"],
        )
        for c in conn.execute(
            "SELECT * FROM listicle_profile_claims WHERE profile_id = ? "
            "ORDER BY found_at",
            (profile_id,),
        )
    ]
    sightings = [
        Sighting(angle=s["angle"], run_id=s["run_id"], seen_at=_parse(s["seen_at"]))
        for s in conn.execute(
            "SELECT * FROM listicle_profile_sightings WHERE profile_id = ? "
            "ORDER BY seen_at",
            (profile_id,),
        )
    ]
    past_blurbs = [
        PastBlurb(
            text=b["text"],
            run_id=b["run_id"],
            angle=b["angle"],
            written_at=_parse(b["written_at"]),
        )
        for b in conn.execute(
            "SELECT * FROM listicle_profile_blurbs WHERE profile_id = ? "
            "ORDER BY written_at",
            (profile_id,),
        )
    ]
    return PlaceProfile(
        profile_id=profile_id,
        place_id=row["place_id"] or "",
        lm_location_id=row["lm_location_id"],
        name=row["name"],
        city=row["city"],
        district=row["district"],
        claims=claims,
        sightings=sightings,
        past_blurbs=past_blurbs,
        created_at=_parse(row["created_at"]),
        updated_at=_parse(row["updated_at"]),
    )


def find_unresolved(
    *, name: str, city: str = "", district: str = ""
) -> PlaceProfile | None:
    """A profile with no Place ID yet, matching this exact branch identity.

    The one thing a supplied Place ID may be attached to. A profile opened
    before resolution ran -- which is the normal case, since there may be no
    API key at all -- gains its anchor here rather than being left behind while
    a second, empty profile is created beside it.

    Unique by construction: the provisional index is unique among unanchored
    rows, and the key now carries the district and the bracketed qualifier, so
    two branches are two rows.
    """
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM listicle_place_profiles "
            "WHERE provisional_key = ? AND place_id IS NULL",
            (provisional_key(name, city, district),),
        ).fetchone()
        return None if row is None else _hydrate(conn, row)


def open_profile(
    *, name: str, city: str = "", district: str = "", place_id: str = ""
) -> PlaceProfile:
    """Find this place's profile, or start one.

    Called the moment a search returns a name, before anything is known about
    whether the place is worth writing about -- because deciding that is what
    the profile is for.
    """
    existing = find(place_id=place_id, name=name, city=city, district=district)
    if existing is None and place_id:
        # No profile carries this Place ID yet. One that carries no Place ID at
        # all and matches this exact branch identity may be promoted to it --
        # that is the profile opened before resolution ran, and losing it would
        # mean losing everything gathered while it was unanchored.
        #
        # A profile carrying a DIFFERENT Place ID is never promoted and never
        # returned. That was R9: opening "Azul" with Place ID B found the Azul
        # anchored to Place ID A and handed it back, so a second real bar
        # silently became the first one.
        existing = find_unresolved(name=name, city=city, district=district)
    if existing is not None:
        if place_id and not existing.place_id:
            set_place_id(existing.profile_id, place_id)
            existing = existing.model_copy(update={"place_id": place_id})
        elif place_id and existing.place_id != place_id:  # pragma: no cover
            raise ValueError(
                f"{name!r} resolves to {place_id}, and the profile found for it "
                f"is anchored to {existing.place_id}."
            )
        if district and not existing.district:
            _touch(existing.profile_id, district=district)
            existing = existing.model_copy(update={"district": district})
        return existing

    now = datetime.now(timezone.utc)
    profile = PlaceProfile(
        profile_id=uuid.uuid4().hex[:12],
        place_id=place_id,
        name=name,
        city=city,
        district=district,
        created_at=now,
        updated_at=now,
    )
    ensure_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_place_profiles (profile_id, place_id, "
            "provisional_key, name, city, district, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                profile.profile_id,
                place_id or None,
                provisional_key(name, city, district),
                name,
                city,
                district,
                _iso(now),
                _iso(now),
            ),
        )
    return profile


def _touch(profile_id: str, **fields: object) -> None:
    """Update named columns, and always `updated_at`.

    Called with no fields to mean "nothing changed on the row itself, but the
    profile did" -- adding a claim ages the profile even though every column
    stays as it was. That case has to build a valid statement rather than an
    empty SET clause.
    """
    assignments = [f"{key} = ?" for key in fields]
    assignments.append("updated_at = ?")
    values = [*fields.values(), _iso(datetime.now(timezone.utc)), profile_id]
    with get_db_connection() as conn:
        conn.execute(
            f"UPDATE listicle_place_profiles SET {', '.join(assignments)} "
            "WHERE profile_id = ?",
            values,
        )


def set_place_id(profile_id: str, place_id: str) -> None:
    """Anchor a profile once resolution has found its Place ID."""
    ensure_tables()
    _touch(profile_id, place_id=place_id)


def set_lm_location_id(profile_id: str, lm_location_id: int) -> None:
    """Record that this place now has a Location Manager record.

    Written back after the LM job, so a later listicle finding the same place
    knows there is nothing to send.
    """
    ensure_tables()
    _touch(profile_id, lm_location_id=lm_location_id)


def add_claims(profile_id: str, claims: list[Claim]) -> int:
    """Add what is new and leave what is already there. Returns how many landed."""
    if not claims:
        return 0
    ensure_tables()
    added = 0
    with get_db_connection() as conn:
        for claim in claims:
            cursor = conn.execute(
                "INSERT OR IGNORE INTO listicle_profile_claims (claim_id, "
                "profile_id, kind, text, source_name, source_url, found_at, "
                "about_year, text_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    uuid.uuid4().hex[:12],
                    profile_id,
                    claim.kind,
                    claim.text,
                    claim.source_name,
                    claim.source_url,
                    _iso(claim.found_at),
                    claim.about_year,
                    claim_text_key(claim.text),
                ),
            )
            added += cursor.rowcount or 0
    _touch(profile_id)
    return added


def add_sighting(profile_id: str, sighting: Sighting) -> bool:
    """Record that a run's angle returned this place. False if already known."""
    ensure_tables()
    with get_db_connection() as conn:
        cursor = conn.execute(
            "INSERT OR IGNORE INTO listicle_profile_sightings (profile_id, "
            "run_id, angle, seen_at) VALUES (?, ?, ?, ?)",
            (profile_id, sighting.run_id, sighting.angle, _iso(sighting.seen_at)),
        )
    return bool(cursor.rowcount)


def unresolved(limit: int = 100) -> list[PlaceProfile]:
    """Profiles with no Place ID yet -- what a resolution pass works through."""
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM listicle_place_profiles WHERE place_id IS NULL "
            "ORDER BY created_at LIMIT ?",
            (limit,),
        ).fetchall()
        return [_hydrate(conn, row) for row in rows]


def add_blurb(profile_id: str, blurb: PastBlurb) -> bool:
    """Record what was written about this place, so it is not written again.

    False when this exact text is already on the profile. Returning that rather
    than silently succeeding matters: a writer handed the same sentence back
    twice has not written a second blurb.
    """
    ensure_tables()
    with get_db_connection() as conn:
        cursor = conn.execute(
            "INSERT OR IGNORE INTO listicle_profile_blurbs (blurb_id, "
            "profile_id, run_id, angle, text, written_at, text_key) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                uuid.uuid4().hex[:12],
                profile_id,
                blurb.run_id,
                blurb.angle,
                blurb.text,
                _iso(blurb.written_at),
                claim_text_key(blurb.text),
            ),
        )
    _touch(profile_id)
    return bool(cursor.rowcount)


# ---------------------------------------------------------------------------
# Per-place research storage.
#
# Four new tables and a widened claims table. The claims table is widened
# rather than replaced: a finding IS a claim with more said about it, and a
# second table for the same kind of sentence would mean every reader has to
# know which one to look in.
#
# Everything here is additive. A database that already holds claims keeps them,
# unclassified and unreviewed, which is the truthful reading of a row nobody
# has judged.
# ---------------------------------------------------------------------------

# Columns the research pass needs, added to the existing claims table. Name,
# type and default, applied only when absent.
_FINDING_COLUMNS: tuple[tuple[str, str], ...] = (
    ("categories", "TEXT NOT NULL DEFAULT '[]'"),
    ("topics", "TEXT NOT NULL DEFAULT '[]'"),
    ("scope", "TEXT NOT NULL DEFAULT 'unknown'"),
    ("temporal_type", "TEXT NOT NULL DEFAULT 'unknown'"),
    ("event_date", "TEXT NOT NULL DEFAULT ''"),
    ("source_published_at", "TEXT NOT NULL DEFAULT ''"),
    ("valid_until", "TEXT NOT NULL DEFAULT ''"),
    # Unreviewed, not kept. A row nobody has looked at must never read as one
    # somebody accepted -- that is the same mistake as an unchecked place
    # reading as one that came back clean.
    ("curation", "TEXT NOT NULL DEFAULT 'unreviewed'"),
    ("origin", "TEXT NOT NULL DEFAULT 'unknown'"),
    ("version", "INTEGER NOT NULL DEFAULT 1"),
    ("attempt_id", "TEXT NOT NULL DEFAULT ''"),
    ("author", "TEXT NOT NULL DEFAULT ''"),
    ("observed_at", "TEXT NOT NULL DEFAULT ''"),
    ("updated_at", "TEXT NOT NULL DEFAULT ''"),
)

# Something published, once per profile. Kept apart from the finding because
# one article supports several findings and one finding may rest on several
# articles -- and because a source has dates of its own that a finding must not
# be allowed to invent.
_SOURCES = """
CREATE TABLE IF NOT EXISTS listicle_research_sources (
    source_id    TEXT PRIMARY KEY,
    profile_id   TEXT NOT NULL,
    url          TEXT NOT NULL DEFAULT '',
    publisher    TEXT NOT NULL DEFAULT '',
    source_type  TEXT NOT NULL DEFAULT '',
    title        TEXT NOT NULL DEFAULT '',
    -- When it was published, as far as it says. A bare year is a real answer.
    published_at TEXT NOT NULL DEFAULT '',
    -- When we read it. Never used to fill in the line above: re-reading a 2024
    -- review today does not make it current.
    retrieved_at TEXT NOT NULL,
    -- One row per (profile, url). The same newspaper article found twice is
    -- one source with two findings hanging off it.
    url_key      TEXT NOT NULL,
    UNIQUE (profile_id, url_key)
)
"""

_FINDING_SOURCES = """
CREATE TABLE IF NOT EXISTS listicle_finding_sources (
    finding_id        TEXT NOT NULL,
    source_id         TEXT NOT NULL,
    supporting_excerpt TEXT NOT NULL DEFAULT '',
    evidence_scope    TEXT NOT NULL DEFAULT 'unknown',
    attached_at       TEXT NOT NULL,
    PRIMARY KEY (finding_id, source_id)
)
"""

# What a finding used to say. Written on every edit, so a later research pass
# cannot quietly overwrite something a person corrected -- and so "who changed
# this and when" has an answer that is not "read the raw model output".
_FINDING_REVISIONS = """
CREATE TABLE IF NOT EXISTS listicle_finding_revisions (
    revision_id TEXT PRIMARY KEY,
    finding_id  TEXT NOT NULL,
    profile_id  TEXT NOT NULL,
    version     INTEGER NOT NULL,
    editor      TEXT NOT NULL DEFAULT '',
    origin      TEXT NOT NULL DEFAULT '',
    changed_at  TEXT NOT NULL,
    before      TEXT NOT NULL DEFAULT '{}',
    after       TEXT NOT NULL DEFAULT '{}'
)
"""

# An editorial idea, kept where it cannot be mistaken for a fact.
_POSSIBLE_ANGLES = """
CREATE TABLE IF NOT EXISTS listicle_possible_angles (
    angle_id     TEXT PRIMARY KEY,
    profile_id   TEXT NOT NULL,
    label        TEXT NOT NULL,
    topic        TEXT NOT NULL DEFAULT '',
    finding_ids  TEXT NOT NULL DEFAULT '[]',
    author       TEXT NOT NULL DEFAULT '',
    archived     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
)
"""

# Which profile a run's candidate is. Stored rather than looked up by name
# every time: a candidate id is stable within a run, spelling is not, and the
# viewer must be able to reopen the same profile after the name on the card has
# been corrected.
_CANDIDATE_PROFILES = """
CREATE TABLE IF NOT EXISTS listicle_candidate_profiles (
    run_id       TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    profile_id   TEXT NOT NULL,
    -- What the place was called and where it was when the link was made. A
    -- record of the identity the link was based on, not a second source of
    -- truth about the place.
    name         TEXT NOT NULL DEFAULT '',
    district     TEXT NOT NULL DEFAULT '',
    place_id     TEXT NOT NULL DEFAULT '',
    address      TEXT NOT NULL DEFAULT '',
    linked_at    TEXT NOT NULL,
    PRIMARY KEY (run_id, candidate_id)
)
"""

_RESEARCH_INDEXES = (
    "CREATE INDEX IF NOT EXISTS listicle_finding_sources_source "
    "ON listicle_finding_sources (source_id)",
    "CREATE INDEX IF NOT EXISTS listicle_finding_revisions_finding "
    "ON listicle_finding_revisions (finding_id)",
    "CREATE INDEX IF NOT EXISTS listicle_possible_angles_profile "
    "ON listicle_possible_angles (profile_id)",
    "CREATE INDEX IF NOT EXISTS listicle_candidate_profiles_profile "
    "ON listicle_candidate_profiles (profile_id)",
)


def ensure_research_tables() -> None:
    """Create what per-place research needs, and widen what it extends.

    Safe to call on a database that has none of it, on one that has all of it,
    and on one that already holds claims from the earlier whole-run pass. The
    last of those is the case that matters: those rows survive, keep their ids,
    and read as unclassified and unreviewed, which is what they are.
    """
    ensure_tables()
    with get_db_connection() as conn:
        existing = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(listicle_profile_claims)")
        }
        for column, definition in _FINDING_COLUMNS:
            if column not in existing:
                conn.execute(
                    f"ALTER TABLE listicle_profile_claims ADD COLUMN {column} "
                    f"{definition}"
                )
        conn.execute(_SOURCES)
        conn.execute(_FINDING_SOURCES)
        conn.execute(_FINDING_REVISIONS)
        conn.execute(_POSSIBLE_ANGLES)
        conn.execute(_CANDIDATE_PROFILES)
        for statement in _RESEARCH_INDEXES:
            conn.execute(statement)


def finding_text_key(text: str, scope: str = "unknown") -> str:
    """A finding's identity: its words and whose place they are about.

    The scope is part of it because "won Summum 2023" about the brand and the
    same sentence about one branch are two different assertions, and merging
    them is how a branch ends up wearing an award it never won.

    Topics are deliberately NOT part of it. The same sentence found while
    researching wings and again while researching cocktails is one thing
    somebody said; the second pass adds its topic to the row it already has
    rather than storing the sentence twice.
    """
    words = re.findall(r"[a-z0-9]+", unicodedata.normalize("NFKD", text.lower()))
    return hashlib.sha1(
        (" ".join(words) + "|" + (scope or "unknown")).encode("utf-8")
    ).hexdigest()


def _url_key(url: str) -> str:
    return hashlib.sha1(url.strip().lower().encode("utf-8")).hexdigest()


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def _list(value: object) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(str(value))
    except (TypeError, ValueError):
        return []
    return [str(item) for item in parsed] if isinstance(parsed, list) else []


def _hydrate_finding(conn: sqlite3.Connection, row: sqlite3.Row) -> ResearchFinding:
    evidence = [
        FindingEvidence(
            source_id=link["source_id"],
            supporting_excerpt=link["supporting_excerpt"],
            evidence_scope=link["evidence_scope"] or "unknown",
        )
        for link in conn.execute(
            "SELECT * FROM listicle_finding_sources WHERE finding_id = ? "
            "ORDER BY attached_at",
            (row["claim_id"],),
        )
    ]
    updated = row["updated_at"] or row["found_at"]
    return ResearchFinding(
        finding_id=row["claim_id"],
        profile_id=row["profile_id"],
        text=row["text"],
        kind=row["kind"],
        categories=_list(row["categories"]),
        topics=_list(row["topics"]),
        scope=row["scope"] or "unknown",
        temporal_type=row["temporal_type"] or "unknown",
        event_date=row["event_date"] or "",
        source_published_at=row["source_published_at"] or "",
        valid_until=row["valid_until"] or "",
        curation=row["curation"] or "unreviewed",
        origin=row["origin"] or "unknown",
        version=int(row["version"] or 1),
        attempt_id=row["attempt_id"] or "",
        author=row["author"] or "",
        observed_at=row["observed_at"] or "",
        evidence=evidence,
        created_at=_parse(row["found_at"]),
        updated_at=_parse(updated),
    )


def findings(profile_id: str, *, topic: str = "") -> list[ResearchFinding]:
    """Everything said about this place, oldest first.

    `topic` filters to one list's material. Empty means every topic, which is
    what makes a profile reusable: the cocktail list can read what the wings
    list paid to find out.

    Discarded findings come back too. Curation is a view, not a deletion, and a
    caller that wants only the kept ones filters for them -- so that nothing can
    quietly lose evidence by forgetting to ask for it.
    """
    ensure_research_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM listicle_profile_claims WHERE profile_id = ? "
            "ORDER BY found_at, claim_id",
            (profile_id,),
        ).fetchall()
        found = [_hydrate_finding(conn, row) for row in rows]
    if not topic:
        return found
    return [item for item in found if topic in item.topics]


def finding(finding_id: str) -> ResearchFinding | None:
    ensure_research_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM listicle_profile_claims WHERE claim_id = ?",
            (finding_id,),
        ).fetchone()
        return None if row is None else _hydrate_finding(conn, row)


def sources(profile_id: str) -> list[ResearchSource]:
    ensure_research_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM listicle_research_sources WHERE profile_id = ? "
            "ORDER BY retrieved_at, source_id",
            (profile_id,),
        ).fetchall()
    return [
        ResearchSource(
            source_id=row["source_id"],
            url=row["url"],
            publisher=row["publisher"],
            source_type=row["source_type"],
            title=row["title"],
            published_at=row["published_at"],
            retrieved_at=_parse(row["retrieved_at"]),
        )
        for row in rows
    ]


def save_source(profile_id: str, source: ResearchSource) -> str:
    """Record one publication, or find the one already recorded.

    Returns the id it is stored under, which may not be the id handed in: the
    same article found by two requests is one source, and the second request's
    findings hang off the first request's row.
    """
    ensure_research_tables()
    key = _url_key(source.url) if source.url else f"noturl:{source.source_id}"
    with get_db_connection() as conn:
        existing = conn.execute(
            "SELECT source_id FROM listicle_research_sources WHERE profile_id = ? "
            "AND url_key = ?",
            (profile_id, key),
        ).fetchone()
        if existing is not None:
            # The publisher and the date can arrive on the second sighting of a
            # source that was anonymous on the first. Filled in, never
            # overwritten with an emptier answer.
            conn.execute(
                "UPDATE listicle_research_sources SET "
                "publisher = CASE WHEN publisher = '' THEN ? ELSE publisher END, "
                "title = CASE WHEN title = '' THEN ? ELSE title END, "
                "source_type = CASE WHEN source_type = '' THEN ? ELSE source_type END, "
                "published_at = CASE WHEN published_at = '' THEN ? ELSE published_at END "
                "WHERE source_id = ?",
                (
                    source.publisher,
                    source.title,
                    source.source_type,
                    source.published_at,
                    existing["source_id"],
                ),
            )
            return str(existing["source_id"])
        conn.execute(
            "INSERT INTO listicle_research_sources (source_id, profile_id, url, "
            "publisher, source_type, title, published_at, retrieved_at, url_key) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                source.source_id,
                profile_id,
                source.url,
                source.publisher,
                source.source_type,
                source.title,
                source.published_at,
                _iso(source.retrieved_at),
                key,
            ),
        )
    return source.source_id


def attach_evidence(finding_id: str, evidence: FindingEvidence) -> bool:
    """Hang one source under one finding. False when it was already there."""
    ensure_research_tables()
    with get_db_connection() as conn:
        cursor = conn.execute(
            "INSERT OR IGNORE INTO listicle_finding_sources (finding_id, "
            "source_id, supporting_excerpt, evidence_scope, attached_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                finding_id,
                evidence.source_id,
                evidence.supporting_excerpt,
                evidence.evidence_scope,
                _iso(datetime.now(timezone.utc)),
            ),
        )
    return bool(cursor.rowcount)


def save_finding(finding_to_save: ResearchFinding) -> tuple[str, bool]:
    """Write one finding, or recognise the one already held.

    Returns (id, is_new). A finding whose words and scope match one already on
    the profile is not stored twice: the existing row gains this pass's topics,
    categories and provenance, and keeps the date it was first found. Two
    requests finding the same sentence is not two pieces of evidence.

    A manual edit is never overwritten this way. The merge only ever ADDS
    topics, categories and sources -- it cannot change the text, the dates or
    the curation state of a row somebody has already worked on.
    """
    ensure_research_tables()
    key = finding_text_key(finding_to_save.text, finding_to_save.scope)
    now = _iso(datetime.now(timezone.utc))
    with get_db_connection() as conn:
        existing = conn.execute(
            "SELECT * FROM listicle_profile_claims WHERE profile_id = ? "
            "AND text_key = ?",
            (finding_to_save.profile_id, key),
        ).fetchone()
        if existing is not None:
            topics = sorted(
                {*_list(existing["topics"]), *finding_to_save.topics}
            )
            categories = sorted(
                {*_list(existing["categories"]), *finding_to_save.categories}
            )
            conn.execute(
                "UPDATE listicle_profile_claims SET topics = ?, categories = ?, "
                "updated_at = ? WHERE claim_id = ?",
                (_json(topics), _json(categories), now, existing["claim_id"]),
            )
            found_id = str(existing["claim_id"])
        else:
            found_id = finding_to_save.finding_id
            conn.execute(
                "INSERT INTO listicle_profile_claims (claim_id, profile_id, kind, "
                "text, source_name, source_url, found_at, about_year, text_key, "
                "categories, topics, scope, temporal_type, event_date, "
                "source_published_at, valid_until, curation, origin, version, "
                "attempt_id, author, observed_at, updated_at) VALUES "
                "(?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    found_id,
                    finding_to_save.profile_id,
                    finding_to_save.kind,
                    finding_to_save.text,
                    _iso(finding_to_save.created_at),
                    _year_of(finding_to_save.event_date),
                    key,
                    _json(finding_to_save.categories),
                    _json(finding_to_save.topics),
                    finding_to_save.scope,
                    finding_to_save.temporal_type,
                    finding_to_save.event_date,
                    finding_to_save.source_published_at,
                    finding_to_save.valid_until,
                    finding_to_save.curation,
                    finding_to_save.origin,
                    finding_to_save.version,
                    finding_to_save.attempt_id,
                    finding_to_save.author,
                    finding_to_save.observed_at,
                    now,
                ),
            )
    for item in finding_to_save.evidence:
        attach_evidence(found_id, item)
    _touch(finding_to_save.profile_id)
    return found_id, existing is None


def _year_of(value: str) -> int | None:
    """The year in a date, for the `about_year` column the gate already reads.

    Kept in step so the earlier pass's counting still works over findings the
    new one wrote. It is a convenience column, not the record: `event_date`
    holds whatever precision the source actually gave.
    """
    match = re.search(r"\b(1[6-9]\d{2}|20\d{2})\b", value or "")
    return int(match.group(1)) if match else None


# What an edit is allowed to change. Everything else about a finding -- its id,
# its profile, when it was first found, which attempt produced it -- is a
# record of what happened and is not editable.
EDITABLE_FINDING_FIELDS = (
    "text",
    "kind",
    "categories",
    "topics",
    "scope",
    "temporal_type",
    "event_date",
    "source_published_at",
    "valid_until",
    "curation",
    "observed_at",
)


class FindingConflict(RuntimeError):
    """An edit written against a version of a finding that has since moved."""

    def __init__(self, finding_id: str, current_version: int) -> None:
        super().__init__(
            "This finding changed while you were editing it. Re-read it and "
            "make the change again."
        )
        self.finding_id = finding_id
        self.current_version = current_version


def update_finding(
    finding_id: str,
    changes: dict,
    *,
    expected_version: int | None = None,
    editor: str = "",
    origin: str = "operator",
) -> ResearchFinding:
    """Change one finding, keeping what it said before.

    Optimistic: an edit written against a version that has moved is refused
    rather than applied over whatever happened in between. Every change writes
    a revision row, so a later research pass cannot silently replace something
    a person corrected and there is always an answer to "who changed this".
    """
    ensure_research_tables()
    current = finding(finding_id)
    if current is None:
        raise LookupError(f"No finding {finding_id}.")
    if expected_version is not None and expected_version != current.version:
        raise FindingConflict(finding_id, current.version)

    applied = {
        key: value
        for key, value in changes.items()
        if key in EDITABLE_FINDING_FIELDS and value is not None
    }
    if not applied:
        return current

    before = {key: getattr(current, key) for key in applied}
    now = _iso(datetime.now(timezone.utc))
    version = current.version + 1
    assignments = []
    values: list[object] = []
    for key, value in applied.items():
        assignments.append(f"{key} = ?")
        values.append(_json(value) if isinstance(value, list) else value)
    if "text" in applied or "scope" in applied:
        # The identity of a finding is its words and its scope, so an edit to
        # either has to move the key with it -- otherwise the next research
        # pass would find the old wording still occupying the row.
        assignments.append("text_key = ?")
        values.append(
            finding_text_key(
                str(applied.get("text", current.text)),
                str(applied.get("scope", current.scope)),
            )
        )
    if "event_date" in applied:
        assignments.append("about_year = ?")
        values.append(_year_of(str(applied["event_date"])))
    assignments.extend(["version = ?", "updated_at = ?"])
    values.extend([version, now, finding_id])

    with get_db_connection() as conn:
        conn.execute(
            f"UPDATE listicle_profile_claims SET {', '.join(assignments)} "
            "WHERE claim_id = ?",
            values,
        )
        conn.execute(
            "INSERT INTO listicle_finding_revisions (revision_id, finding_id, "
            "profile_id, version, editor, origin, changed_at, before, after) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                uuid.uuid4().hex[:12],
                finding_id,
                current.profile_id,
                version,
                editor,
                origin,
                now,
                _json(_plain(before)),
                _json(_plain(applied)),
            ),
        )
    _touch(current.profile_id)
    updated = finding(finding_id)
    assert updated is not None
    return updated


def _plain(values: dict) -> dict:
    """Revision values as JSON can hold them."""
    return {
        key: list(value) if isinstance(value, (list, tuple)) else value
        for key, value in values.items()
    }


def revisions(finding_id: str) -> list[dict]:
    """Every edit to one finding, newest last."""
    ensure_research_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM listicle_finding_revisions WHERE finding_id = ? "
            "ORDER BY changed_at, version",
            (finding_id,),
        ).fetchall()
    return [
        {
            "revision_id": row["revision_id"],
            "version": row["version"],
            "editor": row["editor"],
            "origin": row["origin"],
            "changed_at": row["changed_at"],
            "before": json.loads(row["before"]),
            "after": json.loads(row["after"]),
        }
        for row in rows
    ]


def edited_finding_ids(profile_id: str) -> set[str]:
    """Findings a person has changed.

    Read before a refresh writes anything, because a manual correction is the
    one thing a later model pass must never overwrite.
    """
    ensure_research_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT DISTINCT finding_id FROM listicle_finding_revisions "
            "WHERE profile_id = ? AND origin = 'operator'",
            (profile_id,),
        ).fetchall()
    return {row["finding_id"] for row in rows}


def add_angle(angle: PossibleAngle) -> PossibleAngle:
    ensure_research_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_possible_angles (angle_id, profile_id, label, "
            "topic, finding_ids, author, archived, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                angle.angle_id,
                angle.profile_id,
                angle.label,
                angle.topic,
                _json(angle.supporting_finding_ids),
                angle.author,
                int(angle.archived),
                _iso(angle.created_at),
            ),
        )
    _touch(angle.profile_id)
    return angle


def update_angle(angle_id: str, changes: dict) -> PossibleAngle:
    ensure_research_tables()
    fields = {
        key: value
        for key, value in changes.items()
        if key in {"label", "topic", "supporting_finding_ids", "archived"}
        and value is not None
    }
    column = {"supporting_finding_ids": "finding_ids"}
    with get_db_connection() as conn:
        if fields:
            assignments = ", ".join(
                f"{column.get(key, key)} = ?" for key in fields
            )
            values = [
                _json(value)
                if isinstance(value, list)
                else int(value)
                if isinstance(value, bool)
                else value
                for value in fields.values()
            ]
            conn.execute(
                f"UPDATE listicle_possible_angles SET {assignments} "
                "WHERE angle_id = ?",
                [*values, angle_id],
            )
        row = conn.execute(
            "SELECT * FROM listicle_possible_angles WHERE angle_id = ?",
            (angle_id,),
        ).fetchone()
    if row is None:
        raise LookupError(f"No possible angle {angle_id}.")
    return _hydrate_angle(row)


def _hydrate_angle(row: sqlite3.Row) -> PossibleAngle:
    return PossibleAngle(
        angle_id=row["angle_id"],
        profile_id=row["profile_id"],
        label=row["label"],
        topic=row["topic"],
        supporting_finding_ids=_list(row["finding_ids"]),
        author=row["author"],
        archived=bool(row["archived"]),
        created_at=_parse(row["created_at"]),
    )


def angles(profile_id: str) -> list[PossibleAngle]:
    ensure_research_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM listicle_possible_angles WHERE profile_id = ? "
            "ORDER BY created_at",
            (profile_id,),
        ).fetchall()
    return [_hydrate_angle(row) for row in rows]


def link_candidate(
    run_id: str,
    candidate_id: str,
    profile_id: str,
    *,
    name: str = "",
    district: str = "",
    place_id: str = "",
    address: str = "",
) -> None:
    """Record which profile a run's candidate is."""
    ensure_research_tables()
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO listicle_candidate_profiles (run_id, candidate_id, "
            "profile_id, name, district, place_id, address, linked_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(run_id, candidate_id) DO UPDATE SET "
            "profile_id=excluded.profile_id, name=excluded.name, "
            "district=excluded.district, place_id=excluded.place_id, "
            "address=excluded.address, linked_at=excluded.linked_at",
            (
                run_id,
                candidate_id,
                profile_id,
                name,
                district,
                place_id,
                address,
                _iso(datetime.now(timezone.utc)),
            ),
        )


def linked_profiles(run_id: str) -> dict[str, dict]:
    """Every candidate on this run that has a profile, by candidate id."""
    ensure_research_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM listicle_candidate_profiles WHERE run_id = ?",
            (run_id,),
        ).fetchall()
    return {
        row["candidate_id"]: {
            "profile_id": row["profile_id"],
            "name": row["name"],
            "district": row["district"],
            "place_id": row["place_id"],
            "address": row["address"],
            "linked_at": row["linked_at"],
        }
        for row in rows
    }


def runs_linking(profile_id: str) -> list[dict]:
    """Every list that has pointed at this profile.

    What makes "saved research available" a true statement on a card in a
    second list, and what gives the viewer a way back to the run a finding was
    bought for -- including a run whose candidate has since been removed.
    """
    ensure_research_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM listicle_candidate_profiles WHERE profile_id = ? "
            "ORDER BY linked_at",
            (profile_id,),
        ).fetchall()
    return [
        {
            "run_id": row["run_id"],
            "candidate_id": row["candidate_id"],
            "name": row["name"],
            "linked_at": row["linked_at"],
        }
        for row in rows
    ]


def by_id(profile_id: str) -> PlaceProfile | None:
    """One profile by its own id, whatever it is called now."""
    ensure_tables()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM listicle_place_profiles WHERE profile_id = ?",
            (profile_id,),
        ).fetchone()
        return None if row is None else _hydrate(conn, row)


def profiles_with_place_id(place_id: str) -> list[str]:
    """Every profile anchored to one Google Place ID.

    Normally one. More than one is a conflict worth refusing to research
    through, because it means two cards on a board claim the same building.
    """
    if not place_id:
        return []
    ensure_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT profile_id FROM listicle_place_profiles WHERE place_id = ?",
            (place_id,),
        ).fetchall()
    return [row["profile_id"] for row in rows]
