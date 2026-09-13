"""The list's intro: a prompt built from the list's gist, and the text pasted back.

Unlocked only when every place on the board is done. Like the blurbs, the app
writes nothing itself: the operator copies the prompt into the strongest model
they have and pastes the answer back.

The intro is its own piece of writing, not a table of contents, so the prompt
carries list-level context and only one short line per place.

A saved, current intro on a finished board is the run being complete. That one
answer lives here, as `complete` on the view.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from pydantic import Field

from app.core.database import get_db_connection, transaction
from . import candidate_prep, location_manager, profile_service, research_workspace, store
from .entry_blurb import _clean
from .research_workspace import Contract

# One line per list type: what a reader plans with it. Worded so the intro
# frames the list rather than walking through its venues.
TYPE_ANGLES = {
    "dining": "Meal decisions: cravings, settings, occasions, and how the places spread across neighborhoods.",
    "nightlife": "A night out: the mood, the drinks or music, the crowd, and how late it runs.",
    "accommodations": "Where to stay: the base it gives a trip, the style of the property, and who it suits.",
    "attractions": "A day of visits: what is worth the trip, the pacing, and what each kind of stop pays back.",
}


class SaveInput(Contract):
    version: int = Field(ge=0)
    text: str = Field(min_length=1, max_length=6000)


def ensure_table():
    with get_db_connection() as conn:
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS listicle_intros (
            run_id TEXT PRIMARY KEY, version INTEGER NOT NULL, text TEXT NOT NULL,
            inputs_hash TEXT NOT NULL, prompt TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'''
        )


def _plural(count, one, many):
    return one if count == 1 else many


def build_prompt(*, title, place, kind, listicle_type, standard, exclusions, angles, places):
    listed = "\n".join(
        f"- {p['name']}" + (f" ({p['district']})" if p["district"] else "")
        + (f": {p['why']}" if p["why"] else "")
        for p in places
    )
    template = Path(__file__).with_name("intro_prompt.txt").read_text()
    values = {
        "{title}": title,
        "{place}": place,
        "{kind}": kind,
        "{listicle_type_upper}": listicle_type.upper(),
        "{listicle_type}": listicle_type,
        "{count}": str(len(places)),
        "{standard}": standard or "(not stated)",
        "{exclusions}": exclusions or "(none stated)",
        "{angles}": "\n".join(f"- {angle}" for angle in angles) or "- (none recorded)",
        "{type_angle}": TYPE_ANGLES.get(listicle_type, ""),
        "{places}": listed or "- (none)",
    }
    for key, value in values.items():
        template = template.replace(key, value)
    return template


def _gate(run_id):
    """Every input the intro depends on, and what still blocks writing it."""
    ctx = candidate_prep.context(run_id)
    order = store.load_order(run_id)
    listicle_type = store.listicle_type(run_id)
    entries = research_workspace.board_entries(run_id)
    lm = location_manager.board_status(run_id)
    on_board = [cid for cid in ctx.candidates if cid not in ctx.removed]

    research_workspace.ensure_tables()
    with get_db_connection() as conn:
        briefs = {
            row["candidate_id"]: json.loads(row["slots"])
            for row in conn.execute(
                "SELECT candidate_id, slots FROM listicle_entry_research_briefs WHERE run_id=?",
                (run_id,),
            )
        }

    no_blurb, not_in_lm, twice_in_lm = 0, 0, 0
    places, blurbs = [], {}
    for cid in on_board:
        candidate = ctx.candidates[cid]
        entry = entries.get(cid) or {}
        blurb = entry.get("blurb") or {}
        readiness = candidate_prep.readiness_of(ctx, cid)
        # Same rule as the card's "done" on the board.
        if not (
            blurb.get("text")
            and not blurb.get("stale")
            and all(b.where == "execution" for b in readiness.blockers)
        ):
            no_blurb += 1
        status = lm["places"].get(cid, {}).get("status")
        if status == "several":
            twice_in_lm += 1
        elif status != "present":
            not_in_lm += 1
        blurbs[cid] = blurb.get("text", "")
        places.append(
            {
                "name": readiness.google_name or candidate.get("name", ""),
                "district": candidate.get("district", ""),
                "why": _clean((briefs.get(cid) or {}).get("why_it_belongs")),
            }
        )

    blockers = []
    if not listicle_type:
        blockers.append({"code": "no_type", "message": "Choose the list type first."})
    elif not lm["available"]:
        blockers.append(
            {
                "code": "lm_unavailable",
                "message": "Location Manager could not be checked, so no place counts as done.",
            }
        )
    if len(on_board) < order.target_count:
        blockers.append(
            {
                "code": "short",
                "message": f"{len(on_board)} of {order.target_count} places are on the list.",
            }
        )
    if no_blurb:
        blockers.append(
            {
                "code": "blurbs",
                "message": f"{no_blurb} {_plural(no_blurb, 'place has', 'places have')} no current blurb.",
            }
        )
    if listicle_type and lm["available"]:
        if not_in_lm:
            blockers.append(
                {
                    "code": "lm_missing",
                    "message": f"{not_in_lm} {_plural(not_in_lm, 'place is', 'places are')} not in Location Manager as {listicle_type}.",
                }
            )
        if twice_in_lm:
            blockers.append(
                {
                    "code": "lm_several",
                    "message": f"{twice_in_lm} {_plural(twice_in_lm, 'place is', 'places are')} in Location Manager as {listicle_type} more than once.",
                }
            )

    grill = store.load(run_id)
    prompt = build_prompt(
        title=(grill.seed if grill else "") or ctx.topic_label,
        place=ctx.place,
        kind=ctx.kind,
        listicle_type=listicle_type,
        standard=ctx.standard,
        exclusions=ctx.exclusions,
        angles=[angle.text for angle in order.angles],
        places=places,
    )
    # The prompt covers the list, its type and every place's line. Blurbs are
    # not in it but are what the intro sits above, so a changed blurb counts.
    inputs_hash = hashlib.sha256(
        json.dumps({"prompt": prompt, "blurbs": blurbs}, sort_keys=True).encode()
    ).hexdigest()
    return blockers, prompt, inputs_hash


def view(run_id):
    blockers, prompt, inputs_hash = _gate(run_id)
    ensure_table()
    with get_db_connection() as conn:
        row = conn.execute("SELECT * FROM listicle_intros WHERE run_id=?", (run_id,)).fetchone()
    ready = not blockers
    text = row["text"] if row else ""
    stale = bool(row) and row["inputs_hash"] != inputs_hash
    return {
        "ready_to_write": ready,
        "blockers": blockers,
        # Not handed out before the list is finished: a prompt from a half-done
        # list would produce an intro for a different list.
        "prompt": prompt if ready else "",
        "version": row["version"] if row else 0,
        "text": text,
        "stale": stale,
        "complete": ready and bool(text) and not stale,
    }


def save(run_id, body: SaveInput):
    blockers, prompt, inputs_hash = _gate(run_id)
    if blockers:
        raise profile_service.Blocked(blockers)
    ensure_table()
    with transaction() as conn:
        row = conn.execute("SELECT version FROM listicle_intros WHERE run_id=?", (run_id,)).fetchone()
        if (row["version"] if row else 0) != body.version:
            raise profile_service.Stale("This intro changed. Reload first.", {})
        conn.execute(
            '''INSERT INTO listicle_intros (run_id,version,text,inputs_hash,prompt)
            VALUES (?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET
            version=excluded.version,text=excluded.text,inputs_hash=excluded.inputs_hash,
            prompt=excluded.prompt,updated_at=CURRENT_TIMESTAMP''',
            (run_id, body.version + 1, body.text.strip(), inputs_hash, prompt),
        )
    return view(run_id)
