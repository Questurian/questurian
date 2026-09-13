"""Article-entry editorial research, separate from the durable place fact bank.

Preview is pure. Apply revalidates against current context and commits sources,
atomic findings and selected brief slots together. Nothing here calls a model.
"""

from __future__ import annotations

import hashlib
import json
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.database import get_db_connection
from . import candidate_prep, profile_service, profile_store


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Source(Contract):
    url: str = Field(max_length=2048)
    publisher: str = Field(default="", max_length=300)
    title: str = Field(default="", max_length=500)

    @field_validator("url")
    @classmethod
    def public_link(cls, value):
        link = urlsplit(value)
        if (
            link.scheme not in {"http", "https"}
            or not link.hostname
            or link.username
            or link.password
        ):
            raise ValueError(
                "Every fact needs an HTTP(S) source URL without credentials."
            )
        return value


class Fact(Contract):
    id: str = Field(min_length=1, max_length=80)
    category: Literal[
        "signature",
        "preparation",
        "customer_observation",
        "setting",
        "occasion",
        "drinks",
        "people",
        "history",
        "recognition",
        "practical",
        "caveat",
    ]
    text: str = Field(min_length=8, max_length=1200)
    why_useful: str = Field(default="", max_length=1200)
    scope: Literal["branch", "brand", "unknown"]
    temporal_type: Literal["current", "historical", "dated_observation", "unknown"]
    observed_or_published_at: str | None = Field(default=None, max_length=40)
    source: Source


class EditorialTake(Contract):
    why_it_belongs: str | None = Field(default=None, max_length=2000)
    what_to_order_or_notice: list[str] = Field(default_factory=list, max_length=20)
    visit_character: str | None = Field(default=None, max_length=2000)
    useful_detail: str | None = Field(default=None, max_length=2000)
    story_depth: str | None = Field(default=None, max_length=2000)
    caveat: str | None = Field(default=None, max_length=2000)

    @field_validator("what_to_order_or_notice")
    @classmethod
    def short_details(cls, values):
        if any(not value.strip() or len(value) > 1200 for value in values):
            raise ValueError(
                "Order/notice details must be nonempty and at most 1200 characters."
            )
        return [value.strip() for value in values]


class IdentityMatch(Contract):
    status: Literal["matched", "uncertain", "wrong_branch"]
    note: str = Field(default="", max_length=2000)


class Fit(Contract):
    status: Literal["strong", "usable", "weak"]
    why: str = Field(max_length=2000)
    source_urls: list[str] = Field(default_factory=list, max_length=30)


class Rejected(Contract):
    claim: str = Field(max_length=1200)
    reason: str = Field(max_length=1200)


class ExternalPacket(Contract):
    identity_match: IdentityMatch
    fit: Fit
    facts: list[Fact] = Field(max_length=60)
    editorial_take: EditorialTake
    stale_or_rejected_claims: list[Rejected] = Field(
        default_factory=list, max_length=60
    )
    open_questions: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({fact.id for fact in self.facts}) != len(self.facts):
            raise ValueError("Fact IDs must be unique.")
        return self


class PreviewInput(Contract):
    raw_json: str = Field(min_length=1, max_length=120000)


SLOTS = tuple(EditorialTake.model_fields)


def ensure_tables():
    with get_db_connection() as conn:
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS listicle_entry_research_briefs (
            run_id TEXT NOT NULL, candidate_id TEXT NOT NULL, profile_id TEXT NOT NULL,
            version INTEGER NOT NULL, context_key TEXT NOT NULL, order_revision INTEGER NOT NULL,
            slots TEXT NOT NULL, supporting_findings TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (run_id, candidate_id))'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS listicle_research_imports (
            import_key TEXT PRIMARY KEY, run_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
            request_hash TEXT NOT NULL, packet TEXT NOT NULL, finding_ids TEXT NOT NULL,
            applied_fields TEXT NOT NULL, author TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'''
        )


def _hash(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def _context(run_id, candidate_id):
    ctx = candidate_prep.context(run_id)
    if candidate_id not in ctx.candidates or candidate_id in ctx.removed:
        raise LookupError("This candidate is no longer on this list.")
    link = profile_store.linked_profiles(run_id).get(candidate_id)
    check = ctx.checks.get(candidate_id, {})
    if (
        not link
        or not check.get("place_id")
        or link.get("place_id") != check["place_id"]
    ):
        raise ValueError(
            "Confirm this candidate's Google branch on its preparation card first."
        )
    request = profile_service._build_request(
        ctx, candidate_id, link["profile_id"], mode="initial", gap_text=""
    )
    sources = {
        source.source_id: source for source in profile_store.sources(link["profile_id"])
    }
    held = sorted(
        (
            finding
            for finding in profile_store.findings(link["profile_id"])
            if finding.curation != "discarded"
        ),
        key=lambda finding: (
            finding.curation != "kept",
            finding.validation != "evidence_ready",
            ctx.topic not in finding.topics,
        ),
    )
    data = {
        "list": {
            "title": request.article_title,
            "topic": ctx.topic_label,
            "standard": ctx.standard,
            "exclusions": ctx.exclusions,
        },
        "identity": {
            key: check.get(key)
            for key in (
                "google_name",
                "address",
                "place_id",
                "business_status",
                "types",
                "rating",
                "rating_count",
            )
        },
        "subject_terms": request.subject_terms,
        "discovery_leads": request.sightings[:8],
        "source_leads": request.source_links[:10],
        "retained_findings": [
            {
                "id": finding.finding_id,
                "text": finding.text,
                "version": finding.version,
                "curation": finding.curation,
                "validation": finding.validation,
                "scope": finding.scope,
                "temporal_type": finding.temporal_type,
                "event_date": finding.event_date,
                "source_published_at": finding.source_published_at,
                "valid_until": finding.valid_until,
                "channel": finding.channel,
                "sources": [
                    {
                        "url": sources[e.source_id].url,
                        "published_at": sources[e.source_id].published_at,
                    }
                    for e in finding.evidence
                    if e.source_id in sources
                ][:3],
            }
            for finding in held[:16]
        ],
    }
    # Editorial edits do not alter the identity of the request. Its list,
    # order, branch and operator source leads do.
    context_key = _hash(
        {
            "revision": ctx.order_revision,
            "profile": link["profile_id"],
            **{key: value for key, value in data.items() if key != "retained_findings"},
        }
    )
    return ctx, link["profile_id"], data, context_key


def _brief(conn, run_id, candidate_id):
    row = conn.execute(
        "SELECT * FROM listicle_entry_research_briefs WHERE run_id=? AND candidate_id=?",
        (run_id, candidate_id),
    ).fetchone()
    if not row:
        return {
            "version": 0,
            "slots": EditorialTake().model_dump(),
            "supporting_findings": {},
            "context_key": "",
        }
    return {
        **dict(row),
        "slots": json.loads(row["slots"]),
        "supporting_findings": json.loads(row["supporting_findings"]),
    }


def view(run_id, candidate_id):
    ctx, profile_id, data, context_key = _context(run_id, candidate_id)
    ensure_tables()
    with get_db_connection() as conn:
        brief = _brief(conn, run_id, candidate_id)
        imports = [
            {
                "import_key": row["import_key"],
                "created_at": row["created_at"],
                "stale_or_rejected_claims": json.loads(row["packet"]).get(
                    "stale_or_rejected_claims", []
                ),
                "open_questions": json.loads(row["packet"]).get("open_questions", []),
            }
            for row in conn.execute(
                "SELECT import_key,created_at,packet FROM listicle_research_imports WHERE run_id=? AND candidate_id=? ORDER BY rowid DESC LIMIT 20",
                (run_id, candidate_id),
            )
        ]
    slots = brief["slots"]
    from . import entry_blurb, store

    # The working title the operator typed, not the research request's label.
    grill = store.load(run_id)
    title = (grill.seed if grill else "") or data["list"]["title"]
    return {
        "profile_id": profile_id,
        "title": title,
        "place_name": data["identity"]["google_name"] or "",
        "blurb": entry_blurb.view(
            run_id,
            candidate_id,
            title=title,
            place=data["identity"]["google_name"] or "",
            profile_id=profile_id,
            brief=brief,
        ),
        "context_key": context_key,
        "order_revision": ctx.order_revision,
        "version": brief["version"],
        "slots": slots,
        "supporting_findings": brief["supporting_findings"],
        "stale": bool(brief["context_key"] and brief["context_key"] != context_key),
        "ready": bool(slots["why_it_belongs"] and slots["what_to_order_or_notice"]),
        "prompt": build_prompt(data),
        "imports": imports,
    }


def build_prompt(context):
    from pathlib import Path

    rules = Path(__file__).with_name("workspace_prompt.txt").read_text()
    return (
        rules
        + "\n\nSAVED CONTEXT — DISCOVERY LEADS, NOT EVIDENCE\n"
        + json.dumps(context, ensure_ascii=False, indent=2)
    )


def _undo_chat_links(raw):
    """Undo what copying a rendered chat answer does to URLs.

    Chat apps show each URL as a link and copy it back as `[text](href)`, where
    the text can run past the URL into the surrounding JSON and the href is the
    same text percent-encoded. Only that exact shape is undone: a real link has
    an href that differs from its label, so it stays as written.
    """
    from urllib.parse import unquote

    def href_end(text, at):
        # Encoding only lengthens text, by at most 3x.
        close = raw.find(")", at)
        while close != -1 and close - at <= 3 * len(text):
            if unquote(raw[at:close]) == text:
                return close
            close = raw.find(")", close + 1)
        return -1

    out, i = [], 0
    while (start := raw.find("[http", i)) != -1:
        out.append(raw[i:start])
        i = start + 1
        end = raw.find("](", start)
        while end != -1:
            close = href_end(raw[start + 1:end], end + 2)
            if close != -1:
                out.append(raw[start + 1:end])
                i = close + 1
                break
            end = raw.find("](", end + 2)
        else:
            out.append("[")
    return "".join(out) + raw[i:]


def parse(raw_json):
    text = raw_json.strip()
    # Models often wrap the answer in a fenced code block.
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rstrip().removesuffix("```")
    # The damage usually lands inside JSON strings, so the paste still parses.
    text = _undo_chat_links(text)
    try:
        return ExternalPacket.model_validate_json(text)
    except ValueError as error:
        raise ValueError(f"Invalid research JSON: {error}") from error


def preview(run_id, candidate_id, body: PreviewInput):
    packet = parse(body.raw_json)
    current = view(run_id, candidate_id)
    warnings = [
        "Imported facts are unchecked. A source URL alone does not verify a claim."
    ]
    if packet.identity_match.status != "matched":
        warnings.append(
            "Branch identity is not matched. Import is blocked; correct the packet first."
        )
    if packet.fit.status == "weak":
        warnings.append("Evidence for this list is weak. Keep the brief thin.")
    return {
        "version": current["version"],
        "context_key": current["context_key"],
        "can_apply": packet.identity_match.status == "matched",
        "warnings": warnings,
        "packet": packet.model_dump(),
        "changes": [
            {"field": key, "before": current["slots"][key], "after": value}
            for key, value in packet.editorial_take.model_dump(
                exclude_unset=True
            ).items()
            if value != current["slots"][key]
        ],
    }


def open_workspace(run_id, candidate_id):
    ctx = candidate_prep.context(run_id)
    if candidate_id not in ctx.candidates or candidate_id in ctx.removed:
        raise LookupError("This candidate is no longer on this list.")
    check = ctx.checks.get(candidate_id, {})
    prep = ctx.preps.get(candidate_id)
    if (
        not check.get("place_id")
        or not prep
        or prep.identity_fingerprint != candidate_prep.identity_fingerprint(check)
    ):
        raise ValueError(
            "Confirm this candidate's Google branch on its preparation card first."
        )
    profile_service._resolve_profile(ctx, candidate_id)
    return view(run_id, candidate_id)


class Versioned(Contract):
    version: int = Field(ge=0)
    context_key: str = Field(min_length=1, max_length=64)


class ApplyInput(Versioned):
    raw_json: str = Field(min_length=1, max_length=120000)
    import_key: str = Field(min_length=1, max_length=100)
    fields: list[
        Literal[
            "why_it_belongs",
            "what_to_order_or_notice",
            "visit_character",
            "useful_detail",
            "story_depth",
            "caveat",
        ]
    ] = Field(max_length=6)
    fact_ids: list[str] = Field(max_length=60)


class EditInput(Versioned):
    slots: EditorialTake


def _run_guard(conn, run_id):
    # A revision alone misses branch re-resolution or removal during import.
    # Compare all inputs that can change this entry, under the write lock.
    tables = (
        "listicle_search_orders",
        "listicle_selected_attempts",
        "listicle_google_checks",
        "listicle_board_removals",
        "listicle_candidate_profiles",
        "listicle_candidate_prep",
    )
    return _hash(
        {
            table: [
                dict(row)
                for row in conn.execute(
                    f"SELECT * FROM {table} WHERE run_id=? ORDER BY rowid", (run_id,)
                )
            ]
            for table in tables
        }
    )


def _write_brief(
    conn, run_id, candidate_id, profile_id, ctx, key, version, slots, refs
):
    conn.execute(
        '''INSERT INTO listicle_entry_research_briefs
        (run_id,candidate_id,profile_id,version,context_key,order_revision,slots,supporting_findings)
        VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(run_id,candidate_id) DO UPDATE SET
        profile_id=excluded.profile_id,version=excluded.version,context_key=excluded.context_key,
        order_revision=excluded.order_revision,slots=excluded.slots,
        supporting_findings=excluded.supporting_findings,updated_at=CURRENT_TIMESTAMP''',
        (
            run_id,
            candidate_id,
            profile_id,
            version,
            key,
            ctx.order_revision,
            json.dumps(slots),
            json.dumps(refs),
        ),
    )


def _check_version(brief, body, key):
    if body.version != brief["version"] or body.context_key != key:
        raise profile_service.Stale(
            "This brief or list changed. Reload before applying edits.",
            {"version": brief["version"]},
        )


def apply(run_id, candidate_id, body: ApplyInput, *, staff=""):
    import uuid
    from app.core.database import transaction
    from .profiles import ResearchFinding, ResearchSource, FindingEvidence

    packet = parse(body.raw_json)
    if packet.identity_match.status != "matched":
        raise ValueError("Branch identity must match before applying research.")
    available = {fact.id: fact for fact in packet.facts}
    if not set(body.fact_ids) <= available.keys():
        raise ValueError("Selected fact IDs are not in this packet.")
    supplied = packet.editorial_take.model_dump(exclude_unset=True)
    if not set(body.fields) <= supplied.keys():
        raise ValueError("Selected fields are not in this packet.")
    if body.fields and not body.fact_ids:
        raise ValueError("Select supporting facts before applying editorial fields.")
    ensure_tables()
    profile_store.ensure_research_tables()
    with get_db_connection() as conn:
        guard = _run_guard(conn, run_id)
    ctx, profile_id, _, key = _context(run_id, candidate_id)
    request_hash = _hash(
        {"run_id": run_id, "candidate_id": candidate_id, **body.model_dump()}
    )
    with transaction() as conn:
        previous = conn.execute(
            "SELECT request_hash FROM listicle_research_imports WHERE import_key=?",
            (body.import_key,),
        ).fetchone()
        if previous:
            if previous["request_hash"] != request_hash:
                raise profile_service.Stale(
                    "This import key was already used for different material.", {}
                )
        else:
            if guard != _run_guard(conn, run_id):
                raise profile_service.Stale(
                    "This candidate changed during import. Reload first.", {}
                )
            brief = _brief(conn, run_id, candidate_id)
            _check_version(brief, body, key)
            if brief.get("profile_id") and brief["profile_id"] != profile_id:
                raise ValueError(
                    "This brief belongs to a different branch. Restore its identity before editing."
                )
            ids = {}
            for fact_id in dict.fromkeys(body.fact_ids):
                fact = available[fact_id]
                source_id = profile_store.save_source(
                    profile_id,
                    ResearchSource(
                        source_id=uuid.uuid4().hex[:12],
                        url=fact.source.url,
                        publisher=fact.source.publisher,
                        title=fact.source.title,
                        # External dates are assertions, retained in the import and
                        # finding. Do not fill trusted page metadata with them.
                    ),
                    connection=conn,
                )
                category = {
                    "signature": "signature_offering",
                    "customer_observation": "customer_observations",
                    "caveat": "caveats",
                }.get(fact.category, fact.category)
                kind = {
                    "customer_observation": "review",
                    "people": "person",
                    "practical": "practice",
                }.get(fact.category, fact.category)
                if kind not in {
                    "signature",
                    "review",
                    "person",
                    "practice",
                    "history",
                    "recognition",
                    "setting",
                }:
                    kind = "other"
                finding = ResearchFinding(
                    finding_id=uuid.uuid4().hex[:12],
                    profile_id=profile_id,
                    text=fact.text,
                    kind=kind,
                    categories=[category],
                    topics=[ctx.topic],
                    scope=fact.scope,
                    temporal_type={
                        "current": "current_offering",
                        "dated_observation": "observation",
                    }.get(fact.temporal_type, fact.temporal_type),
                    event_date=fact.observed_or_published_at or "",
                    origin="external_import",
                    author=staff,
                    validation="not_checked",
                    validation_notes=[
                        "External model import; source and date have not been checked."
                    ],
                    evidence=[
                        FindingEvidence(source_id=source_id, evidence_scope=fact.scope)
                    ],
                )
                ids[fact_id] = profile_store.save_finding(finding, connection=conn)[0]
            slots, refs = brief["slots"], brief["supporting_findings"]
            for field in body.fields:
                slots[field] = supplied[field]
                # Packet-level supporting set: the prototype contract has no
                # per-slot fact-ID map. Preserve this honestly, never infer it.
                refs[field] = list(dict.fromkeys(ids.values()))
            _write_brief(
                conn,
                run_id,
                candidate_id,
                profile_id,
                ctx,
                key,
                brief["version"] + 1,
                slots,
                refs,
            )
            conn.execute(
                '''INSERT INTO listicle_research_imports
                (import_key,run_id,candidate_id,request_hash,packet,finding_ids,applied_fields,author)
                VALUES (?,?,?,?,?,?,?,?)''',
                (
                    body.import_key,
                    run_id,
                    candidate_id,
                    request_hash,
                    packet.model_dump_json(),
                    json.dumps(ids),
                    json.dumps(body.fields),
                    staff,
                ),
            )
    return view(run_id, candidate_id)


def edit(run_id, candidate_id, body: EditInput):
    from app.core.database import transaction

    ensure_tables()
    with get_db_connection() as conn:
        guard = _run_guard(conn, run_id)
    ctx, profile_id, _, key = _context(run_id, candidate_id)
    with transaction() as conn:
        if guard != _run_guard(conn, run_id):
            raise profile_service.Stale(
                "This candidate changed during save. Reload first.", {}
            )
        brief = _brief(conn, run_id, candidate_id)
        _check_version(brief, body, key)
        if brief.get("profile_id") and brief["profile_id"] != profile_id:
            raise ValueError("This brief belongs to a different branch.")
        for field, value in body.slots.model_dump(exclude_unset=True).items():
            if brief["slots"][field] != value:
                brief["slots"][field] = value
                brief["supporting_findings"][
                    field
                ] = []  # Hand edits do not inherit model attribution.
        _write_brief(
            conn,
            run_id,
            candidate_id,
            profile_id,
            ctx,
            key,
            brief["version"] + 1,
            brief["slots"],
            brief["supporting_findings"],
        )
    return view(run_id, candidate_id)
