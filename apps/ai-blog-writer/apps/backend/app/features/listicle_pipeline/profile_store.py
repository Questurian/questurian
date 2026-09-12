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
import re
import sqlite3
import unicodedata
import uuid
from datetime import datetime, timezone

from app.core.database import get_db_connection

from .profiles import Claim, PastBlurb, PlaceProfile, Sighting

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
