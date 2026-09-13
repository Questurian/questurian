"""One place's blurb: a prompt built from its approved brief, and the text pasted back.

The app writes nothing itself. The operator copies the prompt into the strongest
model they have, reads the answer and pastes it back, one place at a time. The
brief decides the depth: a thin brief asks for two sentences, a deep one allows
four, and the prompt is the same for both.

The blurb belongs to the list entry, like the brief. It never touches the shared
place profile.
"""

from __future__ import annotations

import re
from pathlib import Path

from pydantic import Field

from app.core.database import get_db_connection, transaction
from . import profile_service, profile_store
from .research_workspace import Contract

MAX_FACTS = 16

# External packets cite their own fact IDs inside slot text, "(f1, f2)". They
# mean nothing to the writer and must not reach a reader.
_FACT_IDS = re.compile(r"\s*\(\s*f\d+(?:\s*,\s*f\d+)*\s*\)")

LABELS = {
    "why_it_belongs": "Why it belongs",
    "what_to_order_or_notice": "What to order or notice",
    "visit_character": "What the visit feels like",
    "useful_detail": "Useful detail",
    "story_depth": "People, history, or recognition",
    "caveat": "Caveat",
}


class SaveInput(Contract):
    version: int = Field(ge=0)
    text: str = Field(min_length=1, max_length=4000)


def ensure_table():
    with get_db_connection() as conn:
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS listicle_entry_blurbs (
            run_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
            version INTEGER NOT NULL, text TEXT NOT NULL,
            brief_version INTEGER NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL,
            edited INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (run_id, candidate_id))'''
        )


def _clean(value):
    if isinstance(value, list):
        return [_clean(item) for item in value if _clean(item)]
    return _FACT_IDS.sub("", value or "").strip()


def build_prompt(title, place, slots, facts):
    brief = "\n".join(
        f"{label}: "
        + ("; ".join(_clean(slots[key])) if isinstance(slots[key], list) else _clean(slots[key]))
        for key, label in LABELS.items()
        if _clean(slots[key])
    )
    listed = "\n".join(f"- {fact}" for fact in facts) or "- (none recorded)"
    template = Path(__file__).with_name("blurb_prompt.txt").read_text()
    return (
        template.replace("{title}", title)
        .replace("{place}", place)
        .replace("{brief}", brief)
        .replace("{facts}", listed)
    )


def view(run_id, candidate_id, *, title, place, profile_id, brief):
    """The saved blurb, and the prompt the current brief would produce."""
    referenced = {i for ids in brief["supporting_findings"].values() for i in ids}
    facts = [
        finding.text
        for finding in profile_store.findings(profile_id)
        if finding.finding_id in referenced and finding.curation != "discarded"
    ][:MAX_FACTS]
    prompt = build_prompt(title, place, brief["slots"], facts)
    ensure_table()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM listicle_entry_blurbs WHERE run_id=? AND candidate_id=?",
            (run_id, candidate_id),
        ).fetchone()
    return {
        "prompt": prompt,
        "version": row["version"] if row else 0,
        "text": row["text"] if row else "",
        # The brief changed after this blurb was saved against it.
        "stale": bool(row) and row["brief_version"] != brief["version"],
    }


def save(run_id, candidate_id, body: SaveInput):
    from . import research_workspace

    current = research_workspace.view(run_id, candidate_id)
    ensure_table()
    with transaction() as conn:
        row = conn.execute(
            "SELECT version FROM listicle_entry_blurbs WHERE run_id=? AND candidate_id=?",
            (run_id, candidate_id),
        ).fetchone()
        if (row["version"] if row else 0) != body.version:
            raise profile_service.Stale("This blurb changed. Reload first.", {})
        conn.execute(
            '''INSERT INTO listicle_entry_blurbs
            (run_id,candidate_id,version,text,brief_version,model,prompt,edited)
            VALUES (?,?,?,?,?,'',?,1) ON CONFLICT(run_id,candidate_id) DO UPDATE SET
            version=excluded.version,text=excluded.text,brief_version=excluded.brief_version,
            prompt=excluded.prompt,updated_at=CURRENT_TIMESTAMP''',
            (
                run_id,
                candidate_id,
                body.version + 1,
                body.text.strip(),
                current["version"],
                current["blurb"]["prompt"],
            ),
        )
    return research_workspace.view(run_id, candidate_id)
