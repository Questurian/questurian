"""One place, researched once, on purpose.

The orchestration between a button and a saved profile. Everything it does in
order: re-check that this place may be researched, decide which profile it is,
write down what is about to be asked, make exactly one call, read the answer,
save what came back, and record how it ended.

Three rules shape the whole of it.

**The call is made outside any transaction.** A SQLite write lock held across a
three-minute network request blocks every other reader of the database, and the
only thing that has to be durable before the money is spent is the record that
it is about to be spent.

**The attempt exists before the call does.** A request that only exists in
memory while it is in flight is one nobody can find after a crash, and the
provider still charged for it.

**Nothing here retries.** A failure, a malformed answer and an answer with
nothing in it are three different things, all of them worth a person looking at,
and none of them worth buying again without being asked.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import urlparse

from . import (
    candidate_prep,
    evidence,
    places,
    profile_research,
    profile_store,
    research_store,
    source_reader,
)
from .candidate_prep import BoardContext, Prep
from .profiles import (
    CallReceipt,
    CoverageNote,
    FindingEvidence,
    PossibleAngle,
    ResearchAttempt,
    ResearchFinding,
    ResearchSource,
    Sighting,
)

logger = logging.getLogger(__name__)

# `extract_only` is the recovery mode ADR 0040 asks for: read the pages this
# attempt's predecessor already collected, extract from them again, and buy no
# search. It exists because an extraction that comes back malformed must not
# cost a second search to fix, and because "run it again" has to mean something
# narrower than "buy the whole thing again".
RESEARCH_MODES = ("initial", "gap", "refresh", "extract_only")

# Prompt, brief and extraction versions together. Stored on every attempt: a
# packet is only reproducible when all three are known, and a comparison
# between two packets is only honest when it can say which of the three moved.
STRATEGY_VERSION = (
    f"{profile_research.PROMPT_VERSION}+"
    f"{profile_research.research_brief.BRIEF_VERSION}+"
    f"{evidence.EXTRACTION_VERSION}"
)

# The closed vocabulary a finding's `kind` has to come from. An invented label
# is filed as `other` rather than stored, because a taxonomy nobody applies
# consistently cannot be counted -- and counting is the only thing done with it.
_CLAIM_KINDS = {
    "award",
    "recognition",
    "review",
    "history",
    "person",
    "signature",
    "setting",
    "practice",
    "price",
    "other",
}


@dataclass
class TransportResult:
    """What one grounded call came back with.

    A small object rather than a tuple because the interesting part is what it
    can say about ITSELF -- which model answered, what it cost, which searches
    it reports having run. A tuple of three strings loses all of that, and
    every one of them is what a receipt is made of.
    """

    text: str
    source_urls: list[str] = field(default_factory=list)
    source_titles: list[str] = field(default_factory=list)
    model: str = ""
    # What the registry asked for, when that differs from what answered.
    asked_for: str = ""
    usage: dict = field(default_factory=dict)
    # What the provider says it searched, when it says anything. Never mixed
    # with the directions we asked for.
    actual_queries: list[str] = field(default_factory=list)
    # Why the provider stopped. A reply truncated at the token ceiling and a
    # reply that finished are indistinguishable from their text alone, and one
    # of the two real failures this pipeline has seen was exactly that.
    finish_reason: str = ""


class Blocked(ValueError):
    """The request was refused before anything was bought.

    Carries the blockers, so a screen can show what to fix rather than "that
    could not be done".
    """

    def __init__(self, blockers: list[dict]) -> None:
        super().__init__(
            "; ".join(blocker["message"] for blocker in blockers)
            or "This place is not ready to research."
        )
        self.blockers = blockers


class Stale(RuntimeError):
    """The card moved between being looked at and being acted on."""

    def __init__(self, message: str, current: dict) -> None:
        super().__init__(message)
        self.current = current


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------


def board(run_id: str) -> dict:
    """Every card on a run: its preparation, what is blocking it, and what is
    already known about the place.

    One request for the whole board. The alternative -- a profile call per card
    -- is thirty-five requests to draw a screen, and the screen is opened every
    time somebody comes back to the list.

    A read. Nothing here creates a profile, resolves an identity or reaches the
    web.
    """
    ctx = candidate_prep.context(run_id)
    active = research_store.active()
    links = profile_store.linked_profiles(run_id)
    attempts = research_store.for_run(run_id)

    cards = []
    for candidate_id, candidate in ctx.candidates.items():
        readiness = candidate_prep.readiness_of(
            ctx, candidate_id, active_attempt=active
        )
        prep = ctx.preps.get(candidate_id) or Prep(
            run_id=run_id, candidate_id=candidate_id
        )
        link = links.get(candidate_id)
        summary = (
            _profile_summary(link["profile_id"], ctx.topic) if link else None
        )
        attempt = attempts.get(candidate_id)
        cards.append(
            {
                "candidate_id": candidate_id,
                "name": candidate.get("name", ""),
                "district": candidate.get("district", ""),
                "prep": prep.as_dict(),
                "readiness": readiness.as_dict(),
                "profile": summary,
                "last_attempt": _attempt_summary(attempt) if attempt else None,
            }
        )

    return {
        "run_id": run_id,
        "revision": ctx.order_revision,
        "topic": ctx.topic,
        "topic_label": ctx.topic_label,
        "exclusions": ctx.exclusions,
        "active_attempt": _attempt_summary(active) if active else None,
        "cards": cards,
    }


def _profile_summary(profile_id: str, topic: str) -> dict:
    """What a card says about research that exists. Counts, never a score.

    "4 findings" is a quantity. It does not mean the place is worth writing
    about, and the card says quantities precisely so that nothing on this
    screen pretends to be a judgement nobody has made.
    """
    profile = profile_store.by_id(profile_id)
    if profile is None:
        return {}
    findings = profile_store.findings(profile_id)
    attempts = research_store.for_profile(profile_id, limit=20)
    for_topic = [item for item in findings if topic in item.topics]
    other_topics = sorted(
        {name for item in findings for name in item.topics} - {topic}
    )
    last = attempts[0] if attempts else None
    return {
        "profile_id": profile_id,
        "name": profile.name,
        "place_id": profile.place_id,
        "district": profile.district,
        "findings_total": len(findings),
        "findings_this_topic": len(for_topic),
        "kept": sum(1 for item in for_topic if item.curation == "kept"),
        "unreviewed": sum(1 for item in for_topic if item.curation == "unreviewed"),
        "unattributed": sum(
            1 for item in for_topic if item.attribution == "incomplete"
        ),
        "open_questions": len(last.open_questions) if last else 0,
        "other_topics": other_topics,
        "last_research_at": _iso(last.started_at) if last else "",
        "last_state": last.state if last else "",
        "angles": len([angle for angle in profile_store.angles(profile_id) if not angle.archived]),
        "other_runs": [
            row
            for row in profile_store.runs_linking(profile_id)
        ],
    }


def _attempt_summary(attempt: ResearchAttempt) -> dict:
    """An attempt as a card reads it: what it is doing, or how it ended."""
    return {
        "attempt_id": attempt.attempt_id,
        "run_id": attempt.run_id,
        "candidate_id": attempt.candidate_id,
        "profile_id": attempt.profile_id,
        "mode": attempt.mode,
        "state": attempt.state,
        "reason_code": attempt.reason_code,
        "reason": attempt.reason,
        "findings_added": attempt.findings_added,
        "findings_seen": attempt.findings_seen,
        "open_questions": list(attempt.open_questions),
        "started_at": _iso(attempt.started_at),
        "finished_at": _iso(attempt.finished_at) if attempt.finished_at else "",
        "model": attempt.model,
        "running": attempt.state == "running",
        # What the action actually cost, on the summary rather than only in the
        # detail: one press makes up to two generations, and a card showing one
        # model name is a card showing half the bill.
        "receipts": [
            {
                "stage": receipt.stage,
                "model": receipt.model,
                "asked_for": receipt.asked_for,
                "grounded": receipt.grounded,
                "outcome": receipt.outcome,
                "reason": receipt.reason,
                "finish_reason": receipt.finish_reason,
                "usage": dict(receipt.usage),
                "duration_seconds": receipt.duration_seconds,
            }
            for receipt in attempt.receipts
        ],
        "generations": sum(
            1 for receipt in attempt.receipts if receipt.outcome != "skipped"
        ),
        "grounded_calls": sum(
            1
            for receipt in attempt.receipts
            if receipt.grounded and receipt.outcome != "skipped"
        ),
        "pages_read": sum(
            1 for page in attempt.pages if page.get("state") == "ok"
        ),
        "pages_attempted": len(attempt.pages),
        # Completion is operational. Evidence is separate and always will be:
        # a request that ran is not a request that found anything, and the two
        # were the same number on the screen this replaces.
        "evidence_ready": int(
            attempt.evidence_summary.get("subject_evidence_ready", 0) or 0
        ),
        "strategy_version": attempt.strategy_version,
        "pilot": attempt.pilot,
        "baseline_attempt_id": attempt.baseline_attempt_id,
    }


def attempt_view(attempt_id: str) -> dict:
    """One attempt, in full. A read: no provider call, no writes."""
    research_store.sweep()
    attempt = research_store.load(attempt_id)
    if attempt is None:
        raise LookupError(f"No research attempt {attempt_id}.")
    view = _attempt_summary(attempt)
    view.update(
        {
            "topic": attempt.topic,
            "requested_queries": list(attempt.requested_queries),
            "actual_queries": list(attempt.actual_queries),
            "validation_issues": list(attempt.validation_issues),
            "coverage": [note.model_dump() for note in attempt.coverage],
            "usage": dict(attempt.usage),
            "duration_seconds": attempt.duration_seconds,
            "prompt_version": attempt.prompt_version,
            "gap_text": attempt.gap_text,
            # Big, and rarely what anybody wants to read. Sent so it CAN be
            # read -- a claim about what a call returned has to be checkable --
            # and the screen keeps it closed.
            "raw_response": attempt.raw_response,
            "prompt": attempt.prompt,
            # The request, as a person can read it without reading the prompt.
            "brief": dict(attempt.brief),
            # Every page this action tried to open, readable or not. An
            # unreadable page is the honest shape of an access gap and is the
            # thing the screen before this one could not show at all.
            "pages": list(attempt.pages),
            # What the search said before anything was opened, kept apart from
            # what the pages turned out to say.
            "discovery": dict(attempt.discovery),
            "evidence_summary": dict(attempt.evidence_summary),
        }
    )
    return view


def profile_view(profile_id: str, *, topic: str = "") -> dict:
    """Everything known about one place. A read, free, and free to reopen.

    `topic` narrows to one list's material without hiding the rest: the filter
    is the default, and "all topics" is one click, because material paid for by
    the wings list is exactly what makes the cocktail list cheaper.
    """
    profile = profile_store.by_id(profile_id)
    if profile is None:
        raise LookupError(f"No profile {profile_id}.")
    findings = profile_store.findings(profile_id)
    sources = {source.source_id: source for source in profile_store.sources(profile_id)}
    attempts = research_store.for_profile(profile_id)
    topics = sorted({name for item in findings for name in item.topics})
    shown = [item for item in findings if not topic or topic in item.topics]
    return {
        "profile_id": profile_id,
        "name": profile.name,
        "city": profile.city,
        "district": profile.district,
        "place_id": profile.place_id,
        "topics": topics,
        "topic": topic,
        "findings": [_finding_view(item, sources) for item in shown],
        "sources": [
            {
                "source_id": source.source_id,
                "url": source.url,
                "publisher": source.publisher,
                "source_type": source.source_type,
                "title": source.title,
                "published_at": source.published_at,
                "retrieved_at": _iso(source.retrieved_at),
            }
            for source in sources.values()
        ],
        "possible_angles": [
            {
                "angle_id": angle.angle_id,
                "label": angle.label,
                "topic": angle.topic,
                "supporting_finding_ids": list(angle.supporting_finding_ids),
                "author": angle.author,
                "archived": angle.archived,
                "created_at": _iso(angle.created_at),
            }
            for angle in profile_store.angles(profile_id)
        ],
        "history": [_attempt_summary(attempt) for attempt in attempts],
        "coverage": [
            note.model_dump()
            for attempt in attempts
            if attempt.state in {"completed", "completed_empty"}
            for note in attempt.coverage
        ],
        "open_questions": [
            question for attempt in attempts for question in attempt.open_questions
        ],
        "runs": profile_store.runs_linking(profile_id),
    }


def _finding_view(finding: ResearchFinding, sources: dict) -> dict:
    return {
        "finding_id": finding.finding_id,
        "text": finding.text,
        "kind": finding.kind,
        "categories": list(finding.categories),
        "topics": list(finding.topics),
        "scope": finding.scope,
        "temporal_type": finding.temporal_type,
        "event_date": finding.event_date,
        "source_published_at": finding.source_published_at,
        "valid_until": finding.valid_until,
        "expired": finding.expired(),
        "curation": finding.curation,
        "origin": finding.origin,
        "version": finding.version,
        # What the checks made of it, and why. Shown beside curation and never
        # instead of it: one is what a machine could establish, the other is
        # what a person decided, and neither substitutes for the other.
        "validation": finding.validation,
        "validation_notes": list(finding.validation_notes),
        "who_said_it": finding.who_said_it,
        "who_name": finding.who_name,
        "channel": finding.channel,
        "attribution": finding.attribution,
        "author": finding.author,
        "observed_at": finding.observed_at,
        "attempt_id": finding.attempt_id,
        "created_at": _iso(finding.created_at),
        "updated_at": _iso(finding.updated_at),
        "evidence": [
            {
                "source_id": item.source_id,
                "supporting_excerpt": item.supporting_excerpt,
                "evidence_scope": item.evidence_scope,
                "url": getattr(sources.get(item.source_id), "url", ""),
                "publisher": getattr(sources.get(item.source_id), "publisher", ""),
                "title": getattr(sources.get(item.source_id), "title", ""),
                "published_at": getattr(
                    sources.get(item.source_id), "published_at", ""
                ),
                "retrieved_at": (
                    _iso(sources[item.source_id].retrieved_at)
                    if item.source_id in sources
                    else ""
                ),
            }
            for item in finding.evidence
        ],
        "revisions": profile_store.revisions(finding.finding_id),
    }


# ---------------------------------------------------------------------------
# Preparation
# ---------------------------------------------------------------------------


def save_prep(
    run_id: str,
    candidate_id: str,
    body: dict,
    *,
    staff: str = "",
    expected_version: int | None = None,
) -> dict:
    """Write what somebody has said about one card, and say where it stands.

    Confirmations are stamped with the fingerprint of what they were made
    about, so a tick survives an edit to an optional link and does not survive
    the identity underneath it changing.
    """
    ctx = candidate_prep.context(run_id)
    if candidate_id not in ctx.candidates:
        raise LookupError(f"No place {candidate_id} on run {run_id}.")
    candidate = ctx.candidates[candidate_id]
    check = ctx.checks.get(candidate_id, {})
    identity_fp = candidate_prep.identity_fingerprint(check)
    status_fp = candidate_prep.status_fingerprint(check)
    open_fp = candidate_prep._fingerprint(identity_fp, status_fp)

    current = ctx.preps.get(candidate_id) or Prep(
        run_id=run_id, candidate_id=candidate_id
    )
    updated = Prep(**current.__dict__)
    stamp = _iso(_now())

    if "identity_confirmed" in body:
        if body["identity_confirmed"]:
            updated.identity_confirmed_at = (
                current.identity_confirmed_at
                if current.identity_confirmed_at
                and current.identity_fingerprint == identity_fp
                else stamp
            )
            updated.identity_confirmed_by = staff or current.identity_confirmed_by
            updated.identity_fingerprint = identity_fp
        else:
            updated.identity_confirmed_at = ""
            updated.identity_confirmed_by = ""
            updated.identity_fingerprint = ""
    if "open_confirmed" in body:
        if body["open_confirmed"]:
            updated.open_confirmed_at = (
                current.open_confirmed_at
                if current.open_confirmed_at and current.open_fingerprint == open_fp
                else stamp
            )
            updated.open_confirmed_by = staff or current.open_confirmed_by
            updated.open_fingerprint = open_fp
        else:
            updated.open_confirmed_at = ""
            updated.open_confirmed_by = ""
            updated.open_fingerprint = ""
    if "status_note" in body:
        updated.status_note = str(body["status_note"] or "").strip()[:600]
        updated.status_note_fingerprint = open_fp if updated.status_note else ""
    if "exclusion_decision" in body or "exclusion_reason" in body:
        decision = str(body.get("exclusion_decision", current.exclusion_decision) or "")
        reason = str(body.get("exclusion_reason", current.exclusion_reason) or "")
        updated.exclusion_decision = "keep" if decision == "keep" else ""
        updated.exclusion_reason = reason.strip()[:600]
        updated.exclusion_fingerprint = (
            candidate_prep.exclusion_fingerprint(candidate)
            if updated.exclusion_decision
            else ""
        )
        updated.exclusion_at = stamp if updated.exclusion_decision else ""
        updated.exclusion_by = staff if updated.exclusion_decision else ""
    if "cut_confirmed" in body:
        if body["cut_confirmed"]:
            updated.cut_confirmed_at = stamp
            updated.cut_confirmed_by = staff
            updated.cut_fingerprint = candidate_prep.cut_fingerprint(ctx, candidate)
        else:
            updated.cut_confirmed_at = ""
            updated.cut_confirmed_by = ""
            updated.cut_fingerprint = ""
    if "tripadvisor_url" in body:
        updated.tripadvisor_url = str(body["tripadvisor_url"] or "").strip()[:500]
    if "source_links" in body:
        updated.source_links = [
            {
                "label": str(link.get("label", ""))[:80],
                "url": str(link.get("url", ""))[:500],
            }
            for link in (body["source_links"] or [])
            if str(link.get("url", "")).strip()
        ][:10]

    saved = candidate_prep.save_prep(updated, expected_version=expected_version)
    ctx.preps[candidate_id] = saved
    readiness = candidate_prep.readiness_of(
        ctx, candidate_id, active_attempt=research_store.active()
    )
    return {
        "run_id": run_id,
        "candidate_id": candidate_id,
        "prep": saved.as_dict(),
        "readiness": readiness.as_dict(),
    }


# ---------------------------------------------------------------------------
# The one call
# ---------------------------------------------------------------------------


def _input_hash(snapshot: dict) -> str:
    """What makes two requests the same question.

    Everything in the snapshot EXCEPT the findings already held. Those are in
    the prompt so the reply does not spend its length repeating what we have,
    and they are recorded so the stored prompt is what was actually sent -- but
    they are not part of the question. Counting them would mean a first
    successful call always changes its own input, so a second press of the same
    button would look like a new question and buy another call.

    A refresh is how somebody asks the same question again on purpose, and it
    never looks here.
    """
    question = {
        key: value for key, value in snapshot.items() if key != "existing_findings"
    }
    return hashlib.sha256(
        json.dumps(question, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()[:32]


def _resolve_profile(ctx: BoardContext, candidate_id: str) -> str:
    """Which profile this card is, creating one if it is new.

    By internal id and verified external identity, never by spelling. A Place
    ID that already belongs to a profile IS that profile; a name that matches
    several anchored profiles is refused rather than guessed at, because
    picking the first row is how one bar ends up wearing another's evidence.
    """
    candidate = ctx.candidates[candidate_id]
    check = ctx.checks.get(candidate_id, {})
    place_id = str(check.get("place_id") or "")
    name = str(check.get("google_name") or candidate.get("name") or "")
    district = candidate.get("district", "")
    existing = profile_store.linked_profiles(ctx.run_id).get(candidate_id)
    if existing and (not place_id or not existing.get("place_id") or existing["place_id"] == place_id):
        # Already linked, and nothing about the identity contradicts it.
        return existing["profile_id"]
    profile = profile_store.open_profile(
        name=name or candidate.get("name", ""),
        city=ctx.place,
        district=district,
        place_id=place_id,
    )
    profile_store.link_candidate(
        ctx.run_id,
        candidate_id,
        profile.profile_id,
        name=name,
        district=district,
        place_id=place_id,
        address=str(check.get("address") or ""),
    )
    for angle in candidate.get("found_by", []):
        profile_store.add_sighting(
            profile.profile_id, Sighting(angle=angle, run_id=ctx.run_id)
        )
    return profile.profile_id


def _build_request(
    ctx: BoardContext,
    candidate_id: str,
    profile_id: str,
    *,
    mode: str,
    gap_text: str,
) -> profile_research.ResearchRequest:
    candidate = ctx.candidates[candidate_id]
    check = ctx.checks.get(candidate_id, {})
    prep = ctx.preps.get(candidate_id) or Prep(
        run_id=ctx.run_id, candidate_id=candidate_id
    )
    held = profile_store.findings(profile_id)
    links = [prep.tripadvisor_url] if prep.tripadvisor_url.strip() else []
    links += [
        str(link.get("url", ""))
        for link in prep.source_links
        if str(link.get("url", "")).strip()
    ]
    google_name = str(check.get("google_name") or "")
    board_name = str(candidate.get("name") or "")
    # The name on the card, when Google holds a different one. A bracketed
    # branch qualifier is dropped: "Barbarian [Miraflores]" is the board's way
    # of telling two rows apart, not a name anybody publishes.
    alias = re.sub(r"\s*[\[(][^\])]*[\])]\s*", " ", board_name).strip()
    aliases = [name for name in {alias, board_name} if name and name != google_name]
    return profile_research.ResearchRequest(
        name=google_name or board_name,
        aliases=sorted(aliases),
        city=ctx.place,
        district=candidate.get("district", ""),
        address=str(check.get("address") or ""),
        place_id=str(check.get("place_id") or ""),
        article_title=f"{ctx.kind} in {ctx.place}".strip(),
        topic=ctx.topic,
        topic_label=ctx.topic_label,
        standard=ctx.standard,
        exclusions=ctx.exclusions,
        # Each lead with the search that produced it. The version before this
        # one sent the snippet alone, so a place found by "still serving wings
        # after midnight" and one found by "ají amarillo instead of Buffalo
        # sauce" produced an identical request.
        sightings=[
            {
                "snippet": str(sighting.get("evidence", "")),
                "angle": str(sighting.get("angle", "")),
                "attempt_id": str(sighting.get("sighting_id", "")).split("#")[0],
            }
            for sighting in candidate.get("sightings", [])
            if str(sighting.get("evidence", "")).strip()
        ],
        # Versioned, so a refresh over edited material is a different input.
        # Discarded findings are left out entirely: somebody threw them away,
        # and sending them back as context is how a rejected claim returns
        # wearing the profile's own authority.
        existing_findings=[
            {
                "text": item.text,
                "version": item.version,
                "curation": item.curation,
                "attributed": item.attribution == "attributed",
            }
            for item in held
            if item.curation != "discarded"
        ],
        source_links=links,
        mode=mode,
        gap_text=gap_text,
    )


def fetch_reviews(place_id: str):
    """What Google's reviewers said about this place.

    A seam of its own so a test can stand in front of it without standing in
    front of the whole Places module, and so the one paid call this stage makes
    is visible at the top of the file rather than buried in the sequence.
    """
    return places.fetch_details(place_id)


def _default_extract(prompt: str):
    """The extraction call, when a caller did not hand one in.

    Imported here rather than at module scope because `api.py` owns the
    provider wiring and the tests replace it. A service module that reaches for
    a provider at import time is one no test can run without a key.
    """
    from .api import _extract_call

    return _extract_call(prompt)


def research(
    run_id: str,
    candidate_id: str,
    *,
    idempotency_key: str,
    transport,
    extract=None,
    reader=None,
    mode: str = "initial",
    gap_text: str = "",
    expected_prep_version: int | None = None,
    expected_order_revision: int | None = None,
    staff: str = "",
    baseline_attempt_id: str = "",
    pilot: str = "",
) -> dict:
    """Research one place. At most one search and one extraction, or neither.

    Neither is the common case and is not a failure: a repeated key, an
    unchanged input already answered, or a card that is not ready all return
    without spending. When the call does happen it is a fixed sequence with a
    ceiling nobody inside it can raise:

        read the pages already known   -> no generation
        one grounded search            -> one generation, unless mode is
                                          extract_only
        read the pages it named        -> no generation
        one extraction over the text   -> one generation, and only when there
                                          is text to extract from

    Nothing retries. Nothing loops. There is no path through this function that
    makes a third generation, and the receipts on the attempt say which of the
    two ran, what each cost, and why either was skipped.
    """
    if mode not in RESEARCH_MODES:
        raise ValueError(f"Unknown research mode {mode!r}.")
    if mode == "gap" and not gap_text.strip():
        raise ValueError(
            "A follow-up has to say what it is looking for. Write the question."
        )

    # A repeat of an action already taken. Answered before anything else is
    # read, because the whole point is that a browser retry is free.
    already = research_store.by_key(idempotency_key)
    if already is not None:
        return {
            "attempt": _attempt_summary(already),
            "profile": _profile_summary(already.profile_id, already.topic)
            if already.profile_id
            else None,
            "repeated": True,
        }

    ctx = candidate_prep.context(run_id)
    if candidate_id not in ctx.candidates:
        raise LookupError(f"No place {candidate_id} on run {run_id}.")
    if (
        expected_order_revision is not None
        and expected_order_revision != ctx.order_revision
    ):
        raise Stale(
            "The search order changed since this card was drawn. Reload the "
            "list before researching.",
            {"order_revision": ctx.order_revision},
        )
    prep = ctx.preps.get(candidate_id) or Prep(
        run_id=run_id, candidate_id=candidate_id
    )
    if expected_prep_version is not None and expected_prep_version != prep.version:
        raise Stale(
            "This card was saved somewhere else after you looked at it. Read "
            "it again before spending anything on it.",
            {"prep_version": prep.version},
        )

    active = research_store.active()
    readiness = candidate_prep.readiness_of(ctx, candidate_id, active_attempt=active)
    if not readiness.ready:
        raise Blocked([blocker.as_dict() for blocker in readiness.blockers])

    profile_id = _resolve_profile(ctx, candidate_id)
    # Two cards on one board resolving to one profile is an identity conflict
    # the board check may have missed -- the names can share nothing.
    others = [
        other
        for other, link in profile_store.linked_profiles(run_id).items()
        if link["profile_id"] == profile_id
        and other != candidate_id
        and other in ctx.candidates
        and other not in ctx.removed
    ]
    if others:
        raise Blocked(
            [
                {
                    "code": "identity_conflict",
                    "message": (
                        "Another place still on this list is the same profile. "
                        "Settle which one it is before researching."
                    ),
                    "where": "board",
                }
            ]
        )

    request = _build_request(
        ctx, candidate_id, profile_id, mode=mode, gap_text=gap_text
    )
    snapshot = request.snapshot()
    input_hash = _input_hash(snapshot)
    brief = profile_research.brief_of(request)

    if mode == "initial":
        done = research_store.completed_for_input(profile_id, input_hash, mode)
        if done is not None:
            # The same question, already answered, over material that has not
            # moved. Handing back the stored answer is not a cache trick: a
            # second identical call would buy the same paragraph twice.
            return {
                "attempt": _attempt_summary(done),
                "profile": _profile_summary(profile_id, ctx.topic),
                "reused": True,
            }

    prompt = profile_research.build_discovery_prompt(brief)
    attempt = ResearchAttempt(
        attempt_id=research_store.new_attempt_id(),
        idempotency_key=idempotency_key,
        profile_id=profile_id,
        run_id=run_id,
        candidate_id=candidate_id,
        topic=ctx.topic,
        mode=mode,
        gap_text=gap_text.strip(),
        state="running",
        input_hash=input_hash,
        input_snapshot=snapshot,
        prompt=prompt,
        prompt_version=profile_research.PROMPT_VERSION,
        strategy_version=STRATEGY_VERSION,
        brief=brief.as_dict(),
        requested_queries=list(brief.illustrative_queries),
        baseline_attempt_id=baseline_attempt_id,
        pilot=pilot,
        owner_token=research_store.new_token(),
        started_by=staff,
        started_at=_now(),
    )
    # Committed before the network is touched. Everything after this point
    # updates a row that already exists, so a crash leaves an attempt somebody
    # can find rather than a charge nobody can account for.
    attempt = research_store.reserve(attempt)

    started = time.monotonic()
    read_pages = reader or source_reader.read_pages
    pages: list[source_reader.PageRead] = []
    receipts: list[CallReceipt] = []

    # --- What Google's own reviewers said, before anything is searched -------
    #
    # The one source of customer voice that is not a model's transcription of a
    # page and cannot be a review platform's refusal: Google returns the text
    # itself, with the reviewer's name, their rating and the day they wrote it.
    # It is attached to the Place ID, so it is about this branch by identity
    # rather than by an address printed somewhere in body text.
    #
    # The three-place pilot found zero attributable opinion about its subject
    # while every review platform the reader touched answered 403 or 404 -- and
    # this call was one line away the whole time, already written, wired only
    # into the old whole-run pass.
    #
    # Billed per call on the owner's Google account, and it does not spend the
    # page budget: nothing is fetched over HTTP.
    if brief.place_id:
        details = fetch_reviews(brief.place_id)
        review_page = places.reviews_as_page(details, brief.place_id)
        if review_page is not None:
            pages.append(review_page)
        elif details.failed:
            logger.warning(
                "Google reviews unavailable for %s: %s",
                candidate_id,
                details.reason,
            )

    # --- Known pages, before anything is bought ------------------------------
    #
    # The operator's links and anything an earlier audit noted. Read first
    # because they cost nothing and because a search bought to rediscover a
    # menu this request is already holding is a search bought for nothing.
    lead_budget = max(
        0, source_reader.PAGE_BUDGET - source_reader.DISCOVERED_RESERVE
    )
    if brief.known_source_leads and lead_budget:
        pages.extend(
            read_pages(
                [(lead.url, lead.origin) for lead in brief.known_source_leads],
                budget=lead_budget,
            )
        )

    # --- One grounded search -------------------------------------------------
    discovery = profile_research.Discovery()
    if mode == "extract_only":
        receipts.append(
            CallReceipt(
                stage="discovery",
                outcome="skipped",
                grounded=True,
                reason=(
                    "Extraction only. This action was authorised to re-read the "
                    "pages already collected and to buy no search."
                ),
            )
        )
    else:
        already_read = [
            (page.final_url or page.requested_url, page.state) for page in pages
        ]
        prompt = profile_research.build_discovery_prompt(
            brief, already_read=already_read
        )
        attempt = attempt.model_copy(update={"prompt": prompt})
        search_started = time.monotonic()
        try:
            result = transport(prompt)
        except Exception as error:  # noqa: BLE001 -- every failure is recorded
            logger.warning("Research search failed for %s: %s", candidate_id, error)
            receipts.append(
                CallReceipt(
                    stage="discovery",
                    grounded=True,
                    outcome="failed",
                    reason=f"{type(error).__name__}",
                    duration_seconds=round(time.monotonic() - search_started, 2),
                )
            )
            return _finish(
                attempt,
                state="failed",
                reason_code="provider_failed",
                reason=(
                    f"The search call did not come back ({type(error).__name__}). "
                    "Nothing was saved. It may still have been charged for."
                ),
                duration=time.monotonic() - started,
                topic=ctx.topic,
                receipts=receipts,
                pages=pages,
            )
        search_duration = round(time.monotonic() - search_started, 2)
        attempt = attempt.model_copy(
            update={
                "raw_response": result.text or "",
                "model": result.model,
                "usage": dict(result.usage or {}),
                "actual_queries": list(result.actual_queries or []),
            }
        )
        try:
            discovery = profile_research.parse_discovery(result.text or "")
        except profile_research.ResponseInvalid as error:
            receipts.append(
                CallReceipt(
                    stage="discovery",
                    grounded=True,
                    model=result.model,
                    usage=dict(result.usage or {}),
                    duration_seconds=search_duration,
                    outcome="invalid",
                    reason=str(error),
                    finish_reason=str(getattr(result, "finish_reason", "") or ""),
                )
            )
            return _finish(
                attempt,
                state="response_invalid",
                reason_code="response_invalid",
                reason=(
                    f"The search answered in a shape this pipeline cannot read: "
                    f"{error} It is kept as it arrived; nothing was read out of "
                    "it, and no second call was made."
                ),
                duration=time.monotonic() - started,
                topic=ctx.topic,
                receipts=receipts,
                pages=pages,
            )
        receipts.append(
            CallReceipt(
                stage="discovery",
                grounded=True,
                model=result.model,
                asked_for=str(getattr(result, "asked_for", "") or ""),
                usage=dict(result.usage or {}),
                duration_seconds=search_duration,
                outcome="ok",
                reason=(
                    f"{len(discovery.pages)} page(s) named, "
                    f"{len(result.actual_queries or [])} search(es) reported."
                ),
                finish_reason=str(getattr(result, "finish_reason", "") or ""),
            )
        )
        # --- Read what it named ---------------------------------------------
        remaining = source_reader.PAGE_BUDGET - sum(
            1 for page in pages if not page.reused
        )
        if discovery.pages and remaining > 0:
            held = {
                source_reader.normalise(page.requested_url): page for page in pages
            }
            pages.extend(
                read_pages(
                    [(page.url, "discovered") for page in discovery.pages],
                    budget=remaining,
                    already_read=held,
                )
            )

    # --- One extraction, over text this process holds ------------------------
    readable = [page for page in pages if page.readable]
    if not readable:
        receipts.append(
            CallReceipt(
                stage="extraction",
                outcome="skipped",
                reason=(
                    "No page could be read, so there was no collected text to "
                    "extract from. Asking a model to restate its own search "
                    "answer would buy a second opinion about a first one."
                ),
            )
        )
        return _finish(
            attempt,
            state="completed_empty",
            reason_code="no_readable_source",
            reason=(
                f"{len(pages)} page(s) were tried and none could be read. That "
                "is a fact about access, not about what is published, and not a "
                "verdict on the place."
            ),
            duration=time.monotonic() - started,
            topic=ctx.topic,
            receipts=receipts,
            pages=pages,
            discovery=discovery,
        )

    extraction_prompt = evidence.build_extraction_prompt(
        brief, pages, discovery_notes=discovery.summary()
    )
    run_extraction = extract or _default_extract
    extract_started = time.monotonic()
    try:
        extracted = run_extraction(extraction_prompt)
    except Exception as error:  # noqa: BLE001 -- every failure is recorded
        logger.warning("Extraction failed for %s: %s", candidate_id, error)
        receipts.append(
            CallReceipt(
                stage="extraction",
                outcome="failed",
                reason=f"{type(error).__name__}",
                duration_seconds=round(time.monotonic() - extract_started, 2),
            )
        )
        return _finish(
            attempt,
            state="failed",
            reason_code="extraction_failed",
            reason=(
                f"The pages were collected and the extraction call did not come "
                f"back ({type(error).__name__}). The pages are kept: running "
                "extraction again over them buys no search."
            ),
            duration=time.monotonic() - started,
            topic=ctx.topic,
            receipts=receipts,
            pages=pages,
            discovery=discovery,
        )
    extract_duration = round(time.monotonic() - extract_started, 2)
    raw_extraction = getattr(extracted, "text", extracted)
    attempt = attempt.model_copy(
        update={
            "raw_response": (
                (attempt.raw_response or "")
                + "\n\n--- EXTRACTION ---\n"
                + (
                    raw_extraction
                    if isinstance(raw_extraction, str)
                    else json.dumps(raw_extraction, ensure_ascii=False)
                )
            )
        }
    )
    try:
        packet = evidence.check(raw_extraction, brief=brief, pages=pages)
    except evidence.ExtractionInvalid as error:
        receipts.append(
            CallReceipt(
                stage="extraction",
                model=str(getattr(extracted, "model", "") or ""),
                usage=dict(getattr(extracted, "usage", {}) or {}),
                duration_seconds=extract_duration,
                outcome="invalid",
                reason=str(error),
                finish_reason=str(getattr(extracted, "finish_reason", "") or ""),
            )
        )
        return _finish(
            attempt,
            state="response_invalid",
            reason_code="response_invalid",
            reason=(
                f"The extraction answered in a shape this pipeline cannot read: "
                f"{error} The pages it was given are kept, and extraction can be "
                "run again over them without buying a search."
            ),
            duration=time.monotonic() - started,
            topic=ctx.topic,
            receipts=receipts,
            pages=pages,
            discovery=discovery,
        )
    receipts.append(
        CallReceipt(
            stage="extraction",
            model=str(getattr(extracted, "model", "") or ""),
            asked_for=str(getattr(extracted, "asked_for", "") or ""),
            usage=dict(getattr(extracted, "usage", {}) or {}),
            duration_seconds=extract_duration,
            outcome="ok",
            reason=(
                f"{len(packet.claims)} claim(s) from {len(readable)} readable "
                f"page(s)."
            ),
            finish_reason=str(getattr(extracted, "finish_reason", "") or ""),
        )
    )

    added, seen, sources_added = _save_packet(
        profile_id,
        packet,
        pages=pages,
        discovery=discovery,
        topic=ctx.topic,
        attempt_id=attempt.attempt_id,
    )
    summary = evidence.derived_coverage(packet, brief=brief, pages=pages)
    state = "completed" if packet.claims else "completed_empty"
    reason = (
        ""
        if packet.claims
        else (
            "The pages were read and carried nothing assertable about this "
            "subject. That is an answer about what those pages say, not a "
            "verdict on the place."
        )
    )
    return _finish(
        attempt,
        state=state,
        reason_code="",
        reason=reason,
        duration=time.monotonic() - started,
        topic=ctx.topic,
        packet=packet,
        added=added,
        seen=seen,
        sources_added=sources_added,
        receipts=receipts,
        pages=pages,
        discovery=discovery,
        summary=summary,
    )


def _publisher_of(url: str, fallback: str = "") -> str:
    """Who published a page, from its address when nothing else says.

    A hostname is a worse answer than a masthead and a far better one than
    nothing: "elcomercio.pe" still means something in two years, where a
    grounding redirect means nothing the moment it expires.
    """
    if fallback.strip():
        return fallback.strip()[:160]
    host = urlparse(url).hostname or ""
    return host[4:] if host.startswith("www.") else host


def _save_packet(
    profile_id: str,
    packet,
    *,
    pages: list,
    discovery,
    topic: str,
    attempt_id: str,
) -> tuple[int, int, int]:
    """Write the checked packet, without overwriting anything a person wrote.

    Sources are the pages that were actually read, under the address the
    redirects ended at -- so a citation points at the publisher's own page
    rather than at a grounding redirect that expires. A page that could not be
    read becomes no source at all: an unreadable lead is a lead, and giving it
    a source record would make it look like something was consulted.
    """
    protected = profile_store.edited_finding_ids(profile_id)
    described = {
        source_reader.normalise(page.url): page for page in discovery.pages
    }
    now = datetime.now(timezone.utc)
    source_ids: dict[int, str] = {}
    sources_added = 0
    for index, page in enumerate(
        [page for page in pages if page.readable], start=1
    ):
        told = described.get(
            source_reader.normalise(page.final_url or page.requested_url)
        ) or described.get(source_reader.normalise(page.requested_url))
        # Google's reviews are not a publisher's page and a hostname is a poor
        # name for them. "Google reviews" is what the attribution should still
        # say in two years.
        from_reviews = page.origin == "google_reviews"
        stored = profile_store.save_source(
            profile_id,
            ResearchSource(
                source_id=uuid.uuid4().hex[:12],
                url=page.final_url or page.requested_url,
                publisher=(
                    "Google reviews"
                    if from_reviews
                    else _publisher_of(
                        page.final_url or page.requested_url,
                        getattr(told, "publisher", "") or "",
                    )
                ),
                source_type=(
                    "review_platform"
                    if from_reviews
                    else getattr(told, "source_type", "") or ""
                ),
                title=page.title,
                # The page's own date, read off the page. Never the day it was
                # fetched, and never the provider's guess at it.
                published_at=page.published_at
                or (getattr(told, "published_at", "") or ""),
                retrieved_at=page.retrieved_at,
            ),
        )
        source_ids[index] = stored
        sources_added += 1

    added = 0
    for claim in packet.claims:
        finding = ResearchFinding(
            finding_id=uuid.uuid4().hex[:12],
            profile_id=profile_id,
            text=claim.text,
            kind=claim.kind if claim.kind in _CLAIM_KINDS else "other",
            categories=list(claim.categories) or ["other"],
            topics=sorted({topic} - {""}) if claim.about_subject else [],
            scope=claim.scope,
            temporal_type=claim.temporal_type,
            event_date=claim.event_date,
            source_published_at=claim.source_published_at,
            valid_until=claim.valid_until,
            curation="unreviewed",
            origin="research",
            validation=claim.validation,
            validation_notes=list(claim.notes),
            who_said_it=claim.who_said_it,
            who_name=claim.who_name,
            channel=claim.channel,
            attempt_id=attempt_id,
            evidence=[
                FindingEvidence(
                    source_id=source_ids[item.page_index],
                    supporting_excerpt=item.excerpt,
                    evidence_scope=item.scope,
                )
                for item in claim.support
                if item.passage_found and item.page_index in source_ids
            ],
            created_at=now,
            updated_at=now,
        )
        stored_id, is_new = profile_store.save_finding(finding)
        if stored_id in protected and not is_new:
            # The row this claim matched has been edited by hand. Its new
            # provenance is attached; nothing else about it is touched.
            continue
        added += int(is_new)
    return added, len(packet.claims), sources_added


def _finish(
    attempt: ResearchAttempt,
    *,
    state: str,
    reason_code: str,
    reason: str,
    duration: float,
    topic: str,
    packet=None,
    added: int = 0,
    seen: int = 0,
    sources_added: int = 0,
    receipts: list | None = None,
    pages: list | None = None,
    discovery=None,
    summary: dict | None = None,
) -> dict:
    finished = attempt.model_copy(
        update={
            "state": state,
            "reason_code": reason_code or ("" if state.startswith("completed") else state),
            "reason": reason,
            "duration_seconds": round(duration, 2),
            "findings_added": added,
            "findings_seen": seen,
            "sources_added": sources_added,
            "validation_issues": list(packet.issues) if packet else [],
            "coverage": (
                [CoverageNote(**note) for note in packet.coverage] if packet else []
            ),
            "open_questions": list(packet.unresolved) if packet else [],
            "receipts": list(receipts or []),
            "pages": [page.as_dict() for page in (pages or [])],
            "discovery": (
                {
                    "pages": [page.as_dict() for page in discovery.pages],
                    "searched": list(discovery.searched),
                    "not_found": list(discovery.not_found),
                    "notes": list(discovery.notes),
                    "issues": list(discovery.issues),
                }
                if discovery is not None
                else {}
            ),
            "evidence_summary": dict(summary or {}),
            "finished_at": _now(),
        }
    )
    written = research_store.finish(finished)
    return {
        "attempt": _attempt_summary(written),
        "profile": _profile_summary(attempt.profile_id, topic),
    }


# ---------------------------------------------------------------------------
# By hand
# ---------------------------------------------------------------------------


def add_finding(profile_id: str, body: dict, *, staff: str = "") -> dict:
    """One finding, typed by a person.

    Origin `operator`, which is not a lesser kind of evidence -- somebody who
    went there knows things no search will return -- and is never given a
    fabricated URL or publication to make it look like a citation.
    """
    if profile_store.by_id(profile_id) is None:
        raise LookupError(f"No profile {profile_id}.")
    text = str(body.get("text", "")).strip()
    if len(text) < 8:
        raise ValueError("Write the finding as one concrete sentence.")
    now = _now()
    evidence: list[FindingEvidence] = []
    url = str(body.get("source_url", "")).strip()
    if url:
        if not candidate_prep.is_usable_link(url):
            raise ValueError("That source link is not a usable web address.")
        source_id = profile_store.save_source(
            profile_id,
            ResearchSource(
                source_id=uuid.uuid4().hex[:12],
                url=url,
                publisher=str(body.get("source_publisher", "")).strip()[:160],
                source_type=str(body.get("source_type", "")).strip()[:40],
                published_at=str(body.get("source_published_at", "")).strip()[:10],
                retrieved_at=now,
            ),
        )
        evidence.append(
            FindingEvidence(
                source_id=source_id,
                supporting_excerpt=str(body.get("supporting_excerpt", "")).strip()[:1000],
                evidence_scope=str(body.get("scope", "unknown")),
            )
        )
    finding = ResearchFinding(
        finding_id=uuid.uuid4().hex[:12],
        profile_id=profile_id,
        text=text[:1200],
        kind=str(body.get("kind", "other")),
        categories=[
            key for key in (body.get("categories") or []) if isinstance(key, str)
        ]
        or ["other"],
        topics=[key for key in (body.get("topics") or []) if isinstance(key, str)],
        scope=str(body.get("scope", "unknown")),
        temporal_type=str(body.get("temporal_type", "observation")),
        event_date=str(body.get("event_date", "")).strip()[:10],
        source_published_at=str(body.get("source_published_at", "")).strip()[:10],
        valid_until=str(body.get("valid_until", "")).strip()[:10],
        # A person writing a finding down has reviewed it by writing it.
        curation=str(body.get("curation", "kept")),
        origin="operator",
        author=staff,
        observed_at=str(body.get("observed_at", "")).strip()[:10],
        evidence=evidence,
        created_at=now,
        updated_at=now,
    )
    stored_id, _ = profile_store.save_finding(finding)
    return profile_view(profile_id, topic=str(body.get("topic", "")))


def edit_finding(
    profile_id: str,
    finding_id: str,
    body: dict,
    *,
    staff: str = "",
) -> dict:
    """Change one finding, or keep, discard or restore it.

    Curation and correction go through the same door because both are a person
    changing what a profile says, and both have to leave a trace. Discarding
    deletes nothing: the research still happened.
    """
    held = profile_store.finding(finding_id)
    if held is None or held.profile_id != profile_id:
        raise LookupError(f"No finding {finding_id} on profile {profile_id}.")
    changes = {
        key: body[key]
        for key in profile_store.EDITABLE_FINDING_FIELDS
        if key in body
    }
    profile_store.update_finding(
        finding_id,
        changes,
        expected_version=body.get("expected_version"),
        editor=staff,
        origin="operator",
    )
    return profile_view(profile_id, topic=str(body.get("topic", "")))


def add_angle(profile_id: str, body: dict, *, staff: str = "") -> dict:
    if profile_store.by_id(profile_id) is None:
        raise LookupError(f"No profile {profile_id}.")
    label = str(body.get("label", "")).strip()
    if not label:
        raise ValueError("An idea needs a sentence.")
    profile_store.add_angle(
        PossibleAngle(
            angle_id=uuid.uuid4().hex[:12],
            profile_id=profile_id,
            label=label[:400],
            topic=str(body.get("topic", "")),
            supporting_finding_ids=[
                str(item) for item in (body.get("supporting_finding_ids") or [])
            ],
            author=staff,
        )
    )
    return profile_view(profile_id, topic=str(body.get("topic", "")))


def edit_angle(profile_id: str, angle_id: str, body: dict) -> dict:
    profile_store.update_angle(
        angle_id,
        {
            "label": body.get("label"),
            "topic": body.get("topic"),
            "supporting_finding_ids": body.get("supporting_finding_ids"),
            "archived": body.get("archived"),
        },
    )
    return profile_view(profile_id, topic=str(body.get("topic", "")))
