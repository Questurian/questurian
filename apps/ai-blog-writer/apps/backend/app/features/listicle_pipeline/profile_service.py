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

from . import candidate_prep, profile_research, profile_store, research_store
from .candidate_prep import BoardContext, Prep
from .profiles import (
    FindingEvidence,
    PossibleAngle,
    ResearchAttempt,
    ResearchFinding,
    ResearchSource,
    Sighting,
)

logger = logging.getLogger(__name__)

RESEARCH_MODES = ("initial", "gap", "refresh")


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
    usage: dict = field(default_factory=dict)
    # What the provider says it searched, when it says anything. Never mixed
    # with the directions we asked for.
    actual_queries: list[str] = field(default_factory=list)


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
        sightings=[
            sighting.get("evidence", "")
            for sighting in candidate.get("sightings", [])
            if sighting.get("evidence")
        ],
        # Versioned, so a refresh over edited material is a different input.
        existing_findings=[
            f"{item.text} [v{item.version}]" for item in held
        ],
        source_links=links,
        mode=mode,
        gap_text=gap_text,
    )


def research(
    run_id: str,
    candidate_id: str,
    *,
    idempotency_key: str,
    transport,
    mode: str = "initial",
    gap_text: str = "",
    expected_prep_version: int | None = None,
    expected_order_revision: int | None = None,
    staff: str = "",
) -> dict:
    """Research one place. Exactly one provider call, or none at all.

    None at all is the common case and is not a failure: a repeated key, an
    unchanged input already answered, or a card that is not ready all return
    without spending. The call happens when a person pressed the button on a
    card that passes the same readiness check the card itself was drawn from.
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

    prompt = profile_research.build_place_research_prompt(request)
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
        requested_queries=profile_research.requested_directions(request),
        owner_token=research_store.new_token(),
        started_by=staff,
        started_at=_now(),
    )
    # Committed before the network is touched. Everything after this point
    # updates a row that already exists, so a crash leaves an attempt somebody
    # can find rather than a charge nobody can account for.
    attempt = research_store.reserve(attempt)

    started = time.monotonic()
    try:
        result = transport(prompt)
    except Exception as error:  # noqa: BLE001 -- every failure is recorded
        logger.warning("Research call failed for %s: %s", candidate_id, error)
        return _finish(
            attempt,
            state="failed",
            reason_code="provider_failed",
            reason=(
                f"The research call did not come back ({type(error).__name__}). "
                "Nothing was saved. It may still have been charged for."
            ),
            duration=time.monotonic() - started,
            topic=ctx.topic,
        )

    duration = time.monotonic() - started
    attempt = attempt.model_copy(
        update={
            "raw_response": result.text or "",
            "model": result.model,
            "usage": dict(result.usage or {}),
            "actual_queries": list(result.actual_queries or []),
        }
    )

    try:
        parsed = profile_research.parse_place_research(
            result.text or "",
            profile_id=profile_id,
            attempt_id=attempt.attempt_id,
            topic=ctx.topic,
        )
    except profile_research.ResponseInvalid as error:
        return _finish(
            attempt,
            state="response_invalid",
            reason_code="response_invalid",
            reason=(
                f"The answer was not the shape this pipeline asked for: {error} "
                "It is kept as it arrived; nothing was read out of it."
            ),
            duration=duration,
            topic=ctx.topic,
        )

    added, seen, sources_added = _save_findings(profile_id, parsed)
    state = "completed" if parsed.findings else "completed_empty"
    reason = (
        ""
        if parsed.findings
        else (
            "The request ran and returned no findings. That is an answer about "
            "what is published, not a failure and not a verdict on the place."
        )
    )
    return _finish(
        attempt,
        state=state,
        reason_code="",
        reason=reason,
        duration=duration,
        topic=ctx.topic,
        parsed=parsed,
        added=added,
        seen=seen,
        sources_added=sources_added,
    )


def _save_findings(profile_id: str, parsed) -> tuple[int, int, int]:
    """Write what came back, without overwriting anything a person wrote.

    A finding already held gains this pass's topics and provenance and keeps
    its own text, dates and curation. That is what makes a refresh safe: the
    material is added to, never replaced.
    """
    protected = profile_store.edited_finding_ids(profile_id)
    source_ids: dict[str, str] = {}
    sources_added = 0
    for source in parsed.sources:
        stored = profile_store.save_source(profile_id, source)
        source_ids[source.source_id] = stored
        sources_added += int(stored == source.source_id)
    added = 0
    for finding in parsed.findings:
        translated = finding.model_copy(
            update={
                "evidence": [
                    FindingEvidence(
                        source_id=source_ids.get(item.source_id, item.source_id),
                        supporting_excerpt=item.supporting_excerpt,
                        evidence_scope=item.evidence_scope,
                    )
                    for item in finding.evidence
                ]
            }
        )
        stored_id, is_new = profile_store.save_finding(translated)
        if stored_id in protected and not is_new:
            # The row this finding matched has been edited by hand. Its new
            # provenance is attached above; nothing else about it is touched.
            continue
        added += int(is_new)
    return added, len(parsed.findings), sources_added


def _finish(
    attempt: ResearchAttempt,
    *,
    state: str,
    reason_code: str,
    reason: str,
    duration: float,
    topic: str,
    parsed=None,
    added: int = 0,
    seen: int = 0,
    sources_added: int = 0,
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
            "validation_issues": list(parsed.issues) if parsed else [],
            "coverage": list(parsed.coverage) if parsed else [],
            "open_questions": list(parsed.open_questions) if parsed else [],
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
