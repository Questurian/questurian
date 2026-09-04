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

from .profiles import Claim, PlaceProfile, Sighting

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

_INDEXES = (
    "CREATE UNIQUE INDEX IF NOT EXISTS listicle_profiles_place_id "
    "ON listicle_place_profiles (place_id) WHERE place_id IS NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS listicle_profiles_provisional "
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


def provisional_key(name: str, city: str) -> str:
    """The identity a profile has before it is resolved to a Place ID.

    Explicitly a placeholder. Name matching is what splits "Bar Inglés" from
    "Bar Inglés del Country Club", and no amount of normalising fixes that --
    which is why the Place ID is the anchor and this is only what holds a
    profile together until resolution runs.
    """
    words = _tokens(name) or [re.sub(r"[^a-z0-9]+", "", name.lower())]
    place = "".join(_tokens(city))
    return f"{''.join(words)}@{place}"


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
        for statement in _INDEXES:
            conn.execute(statement)


def find(*, place_id: str = "", name: str = "", city: str = "") -> PlaceProfile | None:
    """The profile for this place, by Place ID if we have one, else by name.

    Place ID first and always: it is the only identity that survives a rename,
    a spelling variant, or a Spanish source and an English one describing the
    same bar.
    """
    ensure_tables()
    with get_db_connection() as conn:
        row = None
        if place_id:
            row = conn.execute(
                "SELECT * FROM listicle_place_profiles WHERE place_id = ?", (place_id,)
            ).fetchone()
        if row is None and name:
            row = conn.execute(
                "SELECT * FROM listicle_place_profiles WHERE provisional_key = ?",
                (provisional_key(name, city),),
            ).fetchone()
        if row is None:
            return None
        return _hydrate(conn, row)


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
    return PlaceProfile(
        profile_id=profile_id,
        place_id=row["place_id"] or "",
        lm_location_id=row["lm_location_id"],
        name=row["name"],
        city=row["city"],
        district=row["district"],
        claims=claims,
        sightings=sightings,
        created_at=_parse(row["created_at"]),
        updated_at=_parse(row["updated_at"]),
    )


def open_profile(
    *, name: str, city: str = "", district: str = "", place_id: str = ""
) -> PlaceProfile:
    """Find this place's profile, or start one.

    Called the moment a search returns a name, before anything is known about
    whether the place is worth writing about -- because deciding that is what
    the profile is for.
    """
    existing = find(place_id=place_id, name=name, city=city)
    if existing is not None:
        # A profile opened before resolution gains its anchor the first time
        # resolution succeeds, without losing the claims gathered meanwhile.
        if place_id and not existing.place_id:
            set_place_id(existing.profile_id, place_id)
            existing = existing.model_copy(update={"place_id": place_id})
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
                provisional_key(name, city),
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
