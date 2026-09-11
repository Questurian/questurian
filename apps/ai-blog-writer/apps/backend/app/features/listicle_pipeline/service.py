"""Starting and advancing a listicle interview.

Everything mechanical about the interview -- the loop, the single retry, the
mid-interview lookup budget, the pushback, the "accepted draft is not new
information" rule, the stop condition -- comes from
`prompt2blog.grill_v4` untouched. This module supplies the two things that
make it a listicle: the checklist it has to settle, and the prompt it asks
with.

That split is the point. Every bug worth fixing in the article grill lived in
the loop, and a forked copy of it would have to be fixed twice and would be
fixed once.
"""

from __future__ import annotations

import copy
import logging
import threading
import uuid
from contextlib import contextmanager

from ..prompt2blog.contracts_v4 import GrillState
from .profiles import PlaceProfile
from ..prompt2blog.grill_v4 import (
    GrillDependencies,
    answer_grill,
    reopen_grill,
    start_grill,
)
from . import cut_review, runner, shapes, spec, store
from .contracts import LISTICLE_MARKER_KEYS, SearchOrder
from .prompts import build_listicle_turn_prompt

logger = logging.getLogger(__name__)


class _ListicleLLM:
    """The grill's model call, with two derivable fields taken out of the ask.

    A wrapper rather than a change to the engine. The article grill and the
    listicle grill share one schema and one loop, and that sharing is the
    reason every bug in the loop is fixed once; editing the shared schema so
    that a listicle turn costs less would put a listicle concern inside the
    thing both of them run on.

    Two fields come out, and both are things this module already knows:

    **`group`** is the theme of the shape the option names. The model was being
    asked to send back a fact from the catalogue it had just been shown -- once
    per option, across a menu of thirty -- and every one of those was a chance
    for the two to disagree. It is filled from the shape key on the way back.

    **`recommendation`** on the angle question is the recommended option texts,
    joined. The model was writing them once in `options` and again in
    `recommendation`, which is the same paragraph bought twice on the most
    expensive turn of the interview. It is composed from the options the model
    marked, in the order it sent them.

    Nothing else changes. The job id, the model choice, usage accounting,
    retries and the raw provider text all belong to the wrapped call and are
    passed straight through. A reply the pipeline cannot read is still refused
    by the engine's own guards rather than repaired here -- inventing an
    approval is exactly the failure the menu exists to prevent.
    """

    def __init__(self, inner) -> None:
        self._inner = inner

    def __getattr__(self, name):
        # Every ordinary method delegates untouched.
        return getattr(self._inner, name)

    def invoke_json(self, *, prompt, model_name, schema, **kwargs):
        payload, raw = self._inner.invoke_json(
            prompt=prompt,
            model_name=model_name,
            schema=_compact_schema(schema),
            **kwargs,
        )
        return _restore_derived(payload), raw


def _compact_schema(schema: dict) -> dict:
    """The engine's schema with the fields this module derives removed.

    Copied, never mutated. The schema object is module-level in the engine and
    shared with the article grill; editing it in place would quietly change
    what Prompt2Blog asks for.
    """
    if not isinstance(schema, dict):  # pragma: no cover -- defensive
        return schema
    compact = copy.deepcopy(schema)
    options = (
        compact.get("properties", {}).get("options", {}).get("items", {})
    )
    properties = options.get("properties")
    if isinstance(properties, dict):
        properties.pop("group", None)
        required = options.get("required")
        if isinstance(required, list) and "group" in required:
            options["required"] = [name for name in required if name != "group"]
    return compact


def _restore_derived(payload):
    """Put `group` and the angle recommendation back before the engine reads it.

    Before, deliberately. The engine validates and stores what it is given, and
    a field restored after that point would be missing from the record it
    validated against.
    """
    if not isinstance(payload, dict):  # pragma: no cover -- defensive
        return payload
    options = payload.get("options")
    if not isinstance(options, list) or not options:
        return payload

    picked: list[str] = []
    for option in options:
        if not isinstance(option, dict):
            continue
        option["group"] = shapes.theme_of(str(option.get("shape", "") or ""))
        if option.get("recommended") and str(option.get("text", "")).strip():
            picked.append(str(option["text"]).strip())

    # Only when the model left it empty. A recommendation it wrote itself is
    # its answer to its own question, and this is not the place to overrule it.
    if picked and not str(payload.get("recommendation", "") or "").strip():
        payload["recommendation"] = "\n".join(picked)
    return payload


def _dependencies(base: GrillDependencies) -> GrillDependencies:
    """The article grill's dependencies, pointed at the listicle prompt.

    `job_id` is carried through, and that is the entire fix for a real bug:
    this function used to build a fresh `GrillDependencies` and take the
    default, so every listicle interview reported itself as `p2b.grill`. The
    caller was already setting `listicle.grill` and it was being dropped one
    line later -- which meant the usage dashboard attributed listicle spend to
    Prompt2Blog, and the model gateway answered for the wrong job when someone
    changed the listicle grill's model.
    """
    return GrillDependencies(
        llm=_ListicleLLM(base.llm),
        research=base.research,
        job_id=base.job_id,
        model_name=base.model_name,
        build_prompt=build_listicle_turn_prompt,
    )


def start(seed: str, base: GrillDependencies) -> GrillState:
    run_id = uuid.uuid4().hex[:8]
    state = start_grill(
        run_id=run_id,
        seed=seed,
        dependencies=_dependencies(base),
        marker_keys=LISTICLE_MARKER_KEYS,
    )
    store.save(state)
    return state


def answer(
    run_id: str,
    text: str,
    base: GrillDependencies,
    selections: list[dict] | None = None,
    review=None,
) -> GrillState:
    """One turn, plus whatever structure the screen knew about the answer.

    `selections` is the angle picker's own record of what was ticked, edited or
    written. The transcript still stores the operator's text verbatim, because
    that is what the interview agreed to; the records are stored beside it so
    the order does not have to reconstruct a shape from a sentence.
    """
    state = store.load(run_id)
    if state is None:
        raise LookupError(f"No listicle interview with id {run_id}")
    if selections:
        store.save_selections(run_id, selections)
    state = answer_grill(state, text, _dependencies(base))
    store.save(state)
    if state.status == "agreed":
        # Written down at the moment of agreement, so what the screen shows
        # next and what the searches run from are one object rather than two
        # readings of a paragraph. This is also the one moment the cut check
        # may run: the turn is already a paid call, and every later read of the
        # order is a GET that must stay free.
        #
        # An interview that agrees a SECOND time is a re-agreement, and the
        # version this replaced returned the existing order unconditionally --
        # so a run that reopened, agreed twenty and stored forty looked normal
        # from every screen. Creating and re-agreeing are now separate acts.
        if store.load_order(state.run_id) is None:
            create_order(state, review)
        else:
            reagree_order(state, review)
    return state


def reopen(run_id: str, base: GrillDependencies) -> GrillState:
    """Not quite -- keep talking. Sends an agreed interview back to asking."""
    state = store.load(run_id)
    if state is None:
        raise LookupError(f"No listicle interview with id {run_id}")
    state = reopen_grill(state, _dependencies(base))
    store.save(state)
    return state


def get(run_id: str) -> GrillState | None:
    return store.load(run_id)


def create_order(state: GrillState, review=None) -> SearchOrder:
    """The agreed order, written down once, with the interview beside it.

    Only ever called when there is none. An order that already exists may have
    been corrected by the operator, and regenerating it from the transcript
    would silently undo that correction -- which is the same class of bug as
    reading the count out of prose, one layer up. Re-agreement is
    `reagree_order`, and it is a different act.

    `review` is the cut check, and it is a parameter rather than an import
    because this function is reached from two kinds of caller. Answering a turn
    is a POST that is already spending on the model, and that is where the check
    belongs. Opening the order screen is a GET, and a GET must not spend --
    reopening a run without buying anything is the whole point of addressing
    runs by id. Called without it, the order is built unchecked and says so.
    """
    existing = store.load_order(state.run_id)
    if existing is not None:
        return existing
    selections = store.load_selections(state.run_id)
    order = spec.build_search_order(state, revision=1, selections=selections)
    _apply_conflicts(order, review)
    store.save_order(order)
    _save_baseline(state, order, selections)
    return order


def _save_baseline(
    state: GrillState, order: SearchOrder, selections: list[dict] | None
) -> None:
    baseline = spec.resolve_interview(state, selections)
    store.save_baseline(
        baseline.model_copy(
            update={"revision": order.revision, "taken_at": _now()}
        )
    )


def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# Which order fields an interview can settle, and where each one lives.
_INTERVIEW_FIELDS: tuple[tuple[str, str], ...] = (
    ("kind", "kind"),
    ("place", "place"),
    ("target_count", "target_count"),
    ("standard", "standard"),
    ("exclusions", "exclusions"),
)


def reagree_order(state: GrillState, review=None) -> SearchOrder:
    """A second agreement, applied field by field.

    The rule, stated once: **a field the interview changed its mind about wins;
    a field it did not is left exactly as the order has it, correction and
    all.** Reading the whole order back out of the transcript would undo every
    direct correction; returning the existing order -- which is what this used
    to do -- ignores the operator saying twenty when the order says forty.

    A re-agreement that says nothing new saves no revision and asks no
    question. Every stored result still answers the request it answered, and a
    revision number that moved for nothing is a revision number nobody can
    reason about.
    """
    current = store.load_order(state.run_id)
    if current is None:  # pragma: no cover -- caller checks
        return create_order(state, review)

    selections = store.load_selections(state.run_id)
    fresh = spec.resolve_interview(state, selections)
    baseline = store.load_baseline(state.run_id) or spec.baseline_of(current)
    had_baseline = store.load_baseline(state.run_id) is not None

    updated = current.model_copy(deep=True)
    changed: list[str] = []
    notes: list[str] = []

    for field, column in _INTERVIEW_FIELDS:
        said = getattr(fresh, field)
        was = getattr(baseline, field)
        if said == was:
            continue
        held = getattr(current, column)
        if held != was:
            # The operator had corrected this directly, and has now said
            # something different in the interview. The explicit later answer
            # wins, and the override is visible rather than silent.
            notes.append(
                f"You corrected this to {held!r} and then said {said!r} in the "
                "interview. The interview answer is the one being used."
                if had_baseline
                else
                f"The interview now says {said!r}. This order said {held!r}, "
                "and nothing recorded whether that was a correction -- check it."
            )
        setattr(updated, column, said)
        changed.append(column)

    if fresh.angles != baseline.angles:
        updated.angles = _reagreed_angles(current, state, selections)
        changed.append("angles")

    if not changed:
        return current

    if updated.target_count != current.target_count:
        updated.count_source = "answered"
        updated.count_ambiguous = False
        updated.count_note = ""
    updated.answer_notes = [
        *spec.answer_notes(state),
        *notes,
    ]
    _apply_allowances(updated)

    if "angles" in changed or "exclusions" in changed:
        # The two can only start disagreeing when one of them moves.
        updated.angle_conflicts = []
        updated.conflicts_checked = False

    _guard_mutation(state.run_id)
    placed = store.insert_next_revision(updated)
    _save_baseline(state, placed, selections)
    # Asked after the revision is safely written, because a model call inside
    # the write transaction would hold the database's write lock across a
    # network round trip.
    if "angles" in changed or "exclusions" in changed:
        _apply_conflicts(placed, review)
        store.save_order(placed)
    return placed


def _reagreed_angles(current: SearchOrder, state: GrillState, selections):
    """The newly approved searches, keeping the ids of the ones that stayed.

    Matched on exact wording. An angle whose text is unchanged is the same
    search and keeps its id, so its stored result is still its result. An angle
    whose text changed is a different search and gets a new id -- deciding by
    similarity that an edited line is "really" a previous one is how a stored
    result comes to answer a question nobody asked.
    """
    from .contracts import SelectedAngle

    by_text = {angle.text.strip(): angle.angle_id for angle in current.angles}
    used = {angle.angle_id for angle in current.angles}
    rebuilt: list[SelectedAngle] = []
    for index, angle in enumerate(spec.selected_angles(state, selections)):
        kept = by_text.pop(angle.text.strip(), "")
        if kept:
            rebuilt.append(angle.model_copy(update={"angle_id": kept}))
            continue
        fresh_id = angle.angle_id
        while not fresh_id or fresh_id in used:
            fresh_id = f"a{len(used) + index + 1}-{uuid.uuid4().hex[:4]}"
        used.add(fresh_id)
        rebuilt.append(angle.model_copy(update={"angle_id": fresh_id}))
    return rebuilt


def _apply_allowances(order: SearchOrder) -> None:
    from .search import role_allowances

    allowances = role_allowances(order.target_count, [a.role for a in order.angles])
    for angle, allowance in zip(order.angles, allowances):
        angle.wanted = allowance


def _guard_mutation(run_id: str) -> None:
    """Refuse to move the order out from under a batch that is spending on it.

    A revision written while searches are running changes what those searches
    were bought to answer, halfway through buying them. The operator gets an
    actionable conflict instead: wait, or stop the batch.
    """
    if store.batch_is_running(run_id):
        raise store.RevisionConflict(
            "Searches are running against this order. Wait for them to finish "
            "before correcting it.",
            store.next_revision(run_id) - 1,
        )


def _ensure_order(state: GrillState, review=None) -> SearchOrder:
    """Create the order if there is none, otherwise read the stored one.

    Kept because the plan's reproduction harness calls it by name, and that
    harness is the evidence these fixes are checked against -- editing it to
    match the code would make it agree with the code by construction. New
    callers want `create_order`, `reagree_order` or `order`, which say which
    of the three acts they mean.
    """
    existing = store.load_order(state.run_id)
    return existing if existing is not None else create_order(state, review)


def _apply_conflicts(order: SearchOrder, review) -> None:
    """Ask whether any approved search fights the cut, if anyone may ask.

    A check that fails is not a finding. `conflicts_checked` stays false and
    the screen says nobody looked, which is true -- the alternative is an order
    that reads as cleared because a model call timed out.
    """
    if review is None:
        return
    try:
        order.angle_conflicts = cut_review.review_order(order, review)
        order.conflicts_checked = True
    except Exception:
        logger.warning(
            "The cut check did not run for %s; the order says so", order.run_id
        )


def order(run_id: str) -> SearchOrder | None:
    """The order as it stands. A read, and never a regeneration.

    A stored order is returned exactly as stored. Only a run that has agreed
    and has no order at all gets one built, which is the first read after
    agreement and not a rebuild of anything.
    """
    existing = store.load_order(run_id)
    if existing is not None:
        return existing
    state = store.load(run_id)
    if state is None or state.status != "agreed":
        return None
    return create_order(state)


def revise_order(
    run_id: str,
    *,
    target_count: int | None = None,
    angles: list[dict] | None = None,
    standard: str | None = None,
    exclusions: str | None = None,
    expected_revision: int | None = None,
    review=None,
) -> SearchOrder:
    """Correct the agreement, at a new revision.

    A correction is not an edit in place. Results already gathered answered the
    previous request, and the only way to say so honestly is for the previous
    request to still exist -- so a revision is added rather than the old one
    overwritten, and every stored result is re-checked against the new request
    before it is shown as current.

    `expected_revision` is the revision the browser was looking at. A
    correction typed against a version that has since moved is refused rather
    than applied over whatever happened in between -- two tabs, or a tab left
    open while the interview re-agreed, are the ordinary way that happens.
    """
    current = order(run_id)
    if current is None:
        raise LookupError(f"No agreed search order for run {run_id}")
    if expected_revision is not None and expected_revision != current.revision:
        raise store.RevisionConflict(
            f"This correction was written against revision {expected_revision}, "
            f"and the order is now at revision {current.revision}. Re-read it "
            "and correct the version that exists.",
            current.revision,
        )

    updated = current.model_copy(deep=True)
    if target_count is not None:
        if not 1 <= target_count <= 200:
            raise ValueError("A list length has to be between 1 and 200.")
        # Re-typing the number that is already there is not a correction, and
        # recording it as one would move the revision for nothing -- which
        # invalidates stored results that still answer the request being made.
        if target_count != updated.target_count:
            updated.target_count = target_count
            updated.count_source = "corrected by operator"
            updated.count_ambiguous = False
            updated.count_note = ""
    # The bar and the cut can be typed out here because they may have been
    # assembled from two answers rather than given once. A combined value is
    # the safe reading and not necessarily the right one -- it keeps a rule the
    # operator may have meant to drop -- so the only honest way to combine is
    # to leave a way to disagree. Correcting one clears its note: it was a
    # question about an inference, and there is no longer an inference.
    if standard is not None and standard.strip() != updated.standard:
        updated.standard = standard.strip()
        updated.answer_notes = spec.drop_note_for(updated.answer_notes, "bar")
    if exclusions is not None and exclusions.strip() != updated.exclusions:
        updated.exclusions = exclusions.strip()
        updated.answer_notes = spec.drop_note_for(updated.answer_notes, "cut")
    if angles is not None:
        if not angles:
            raise ValueError("An order with no searches in it cannot be run.")
        from .contracts import SelectedAngle

        rebuilt: list[SelectedAngle] = []
        for index, entry in enumerate(angles):
            text = str(entry.get("text", "")).strip()
            if not text:
                continue
            previous = next(
                (a for a in current.angles if a.angle_id == entry.get("angle_id")),
                None,
            )
            shape_key = str(entry.get("shape_key", "") or (previous.shape_key if previous else ""))
            rebuilt.append(
                SelectedAngle(
                    angle_id=str(entry.get("angle_id") or f"a{index + 1}"),
                    text=text,
                    shape_key=shape_key,
                    group=str(entry.get("group", "") or (previous.group if previous else "")),
                    role=str(entry.get("role") or (previous.role if previous else "broad")),
                    # An angle whose wording changed is an angle whose stored
                    # result no longer answers it. Marked here so the
                    # fingerprint changes and the reuse check refuses it.
                    edited=bool(entry.get("edited"))
                    or (previous is not None and previous.text != text),
                    custom=bool(entry.get("custom")) or not shape_key,
                )
            )
        if not rebuilt:
            raise ValueError("An order with no searches in it cannot be run.")
        updated.angles = rebuilt

    _apply_allowances(updated)

    # Changing the angles or the cut is exactly the moment the two can start
    # disagreeing, so the old verdict is not an answer about the new order.
    # Cleared either way; re-asked only when the caller is a path allowed to
    # spend, and left honestly unchecked when it is not.
    if angles is not None or exclusions is not None:
        updated.angle_conflicts = []
        updated.conflicts_checked = False

    if _says_nothing_new(current, updated):
        # A correction that corrects nothing. Saving a revision for it would
        # move a number nobody can then reason about, and would invalidate
        # stored results that still answer the request being made.
        return current

    _guard_mutation(run_id)
    placed = store.insert_next_revision(updated)
    if angles is not None or exclusions is not None:
        _apply_conflicts(placed, review)
        store.save_order(placed)
    return placed


# Everything a revision is allowed to differ in. `revision` itself and the
# derived allowances are excluded: they follow from the rest.
_REVISION_FIELDS: tuple[str, ...] = (
    "kind",
    "place",
    "target_count",
    "standard",
    "exclusions",
    "count_source",
    "count_note",
    "count_ambiguous",
    "answer_notes",
)


def _says_nothing_new(current: SearchOrder, updated: SearchOrder) -> bool:
    """Whether this correction changes anything the searches would notice."""
    for field in _REVISION_FIELDS:
        if getattr(current, field) != getattr(updated, field):
            return False
    before = [
        (a.angle_id, a.text, a.role, a.shape_key, a.wanted) for a in current.angles
    ]
    after = [
        (a.angle_id, a.text, a.role, a.shape_key, a.wanted) for a in updated.angles
    ]
    return before == after


def search(
    run_id: str,
    research,
    *,
    only: list[str] | None = None,
    reuse: bool = True,
    review=None,
) -> dict:
    """Run the agreed search order and pool what comes back.

    Refuses to run before the interview has agreed. A half-settled order is
    missing the angles, and searching without them is six searches for whatever
    the seed happened to say -- which is the single-search failure the split
    exists to avoid, at six times the cost.

    `only` runs a named subset, which is how a retry costs one search rather
    than six. `reuse=False` is the deliberate full refresh.
    """
    state = store.load(run_id)
    if state is None:
        raise LookupError(f"No listicle interview with id {run_id}")
    if state.status != "agreed":
        raise ValueError(
            "This interview has not agreed a search order yet, so there is "
            "nothing to search for."
        )

    current = order(run_id)
    if not current.angles:
        raise ValueError("The agreed interview carries no angles to search.")

    token = store.claim_batch(run_id, current.revision)
    if not token:
        raise ValueError(
            "These searches are already running for this order. Wait for them "
            "rather than starting a second set."
        )
    with _heartbeat(run_id, token):
        try:
            payload = runner.run_order(
                current, research, only=only, reuse=reuse, owner_token=token
            )
            # Held through the review as well as the searches. The lease used
            # to be released before the cut check ran, so a batch that had
            # already lost the run could still publish a verdict over the pool
            # the new batch had gathered.
            store.save_results(run_id, payload)
            _review_candidates(current, payload, review, owner_token=token)
            return runner.assemble(current)
        finally:
            # Released whatever happened, so a failed batch does not lock the
            # run out of the retry that is the point of storing attempts
            # separately -- and only ever this batch's own lease.
            store.release_batch(run_id, token)


@contextmanager
def _heartbeat(run_id: str, token: str):
    """Say the batch is still alive, on a timer, until the block ends.

    One in-process thread, not a service. A real batch can run past the lease's
    stale window -- six grounded searches at up to three minutes each -- and the
    fix for that is to keep saying so rather than to widen the window until a
    crashed process wedges the run for an hour.

    A batch whose lease was taken from it keeps beating harmlessly: the renewal
    matches on the token and simply changes nothing. What stops it dispatching
    is the ownership check in the runner.
    """
    stop = threading.Event()

    def beat() -> None:
        while not stop.wait(store.LEASE_HEARTBEAT_SECONDS):
            try:
                if not store.renew_batch(run_id, token):
                    logger.warning(
                        "The search lease for %s was taken by another batch", run_id
                    )
                    return
            except Exception:  # pragma: no cover -- storage is local
                logger.warning("The search lease for %s could not be renewed", run_id)
                return

    ticker = threading.Thread(target=beat, name=f"listicle-lease-{run_id}", daemon=True)
    ticker.start()
    try:
        yield
    finally:
        stop.set()
        ticker.join(timeout=1)


def _review_candidates(
    order: SearchOrder, payload: dict, review, *, owner_token: str = ""
) -> None:
    """Judge what came back against the cut, once per distinct pool.

    One call per chunk, reading evidence the searches already wrote. Nothing is
    looked up: that is the difference between this and researching forty places
    to rediscover what the first search said.

    **A pool already judged is not judged again.** The stored verdict is looked
    up by the fingerprint of the material a reviewer would be sent, so a
    reuse-only POST that bought no research buys no review either -- which it
    did, on every press, while reporting the searches as reused.

    **A failed chunk is retried, and only the failed chunk.** Coverage is a
    question with an answer, so a retry knows which rows are still unjudged and
    pays for those.

    Like the order check, a failure is not a finding. A pool with no complete
    review says nobody finished looking rather than nothing was barred.
    """
    if review is None:
        return
    candidates = payload.get("candidates", [])
    fingerprint = cut_review.review_fingerprint(order, candidates)
    stored = store.load_pool_review(order.run_id, fingerprint)
    if stored is not None and stored.status in {"complete", "not_needed"}:
        return

    missing: set[str] | None = None
    if stored is not None and stored.status == "partial":
        # Buy the part nobody has judged. Re-buying the chunks that already
        # answered is the operator paying twice for the same verdict.
        missing = set(stored.expected_candidate_ids) - set(
            stored.reviewed_candidate_ids
        )

    try:
        fresh = cut_review.review_candidates(
            order, candidates, review, only_candidate_ids=missing
        )
    except Exception:
        logger.warning(
            "The cut check did not run over %s's candidates", order.run_id
        )
        return

    if owner_token and not store.holds_batch(order.run_id, owner_token):
        # Another batch owns the run. This verdict was bought and is real, and
        # it is not this process's to publish over whatever the new owner has
        # gathered.
        logger.warning(
            "A cut review for %s finished after its batch lost the run; not "
            "published", order.run_id,
        )
        return

    if stored is not None:
        fresh = _merged_reviews(stored, fresh)
    store.save_pool_review(fresh)


def _merged_reviews(stored, fresh):
    """A retry's answer, added to what already stood.

    The chunks that succeeded before are still answers about rows that have not
    changed -- the fingerprint says so, or this would not be the same review at
    all. Keeping them is what makes a retry cost one chunk.
    """
    verdicts = {v.candidate_id: v for v in stored.verdicts}
    verdicts.update({v.candidate_id: v for v in fresh.verdicts})
    chunks = {c.index: c for c in stored.chunks}
    chunks.update({c.index: c for c in fresh.chunks})
    reviewed = sorted(
        {
            *stored.reviewed_candidate_ids,
            *fresh.reviewed_candidate_ids,
        }
    )
    covered = set(reviewed)
    expected = set(fresh.expected_candidate_ids)
    if expected <= covered:
        status = "complete"
    elif covered:
        status = "partial"
    else:
        status = fresh.status
    return fresh.model_copy(
        update={
            "status": status,
            "verdicts": list(verdicts.values()),
            "chunks": [chunks[index] for index in sorted(chunks)],
            "reviewed_candidate_ids": reviewed,
        }
    )


def recheck_cut(run_id: str, review) -> dict:
    """Buy the review of this pool that is still missing.

    Explicitly asked for, because it costs. A partial review retries only its
    unjudged chunks; a failed one starts again; a pool already covered is
    returned as it stands without a call.
    """
    current = order(run_id)
    if current is None:
        raise LookupError(f"No agreed search order for run {run_id}")
    payload = runner.assemble(current)
    _review_candidates(current, payload, review)
    return runner.assemble(current)


def progress(run_id: str) -> dict | None:
    """What the run knows, without running anything.

    This is what a reopened page reads. It never searches: opening a screen is
    not a decision to spend, and the version this replaced had no way to tell
    "nothing stored" from "not read yet", so a reload looked like a run that
    had never happened.
    """
    current = order(run_id)
    if current is None:
        # No agreed order, which for a run with stored results means one from
        # before orders were recorded. Read through the same upgrade so the
        # screen never receives a payload with fields missing.
        stored = store.load_results(run_id)
        if stored is None:
            return None
        return _upgrade_legacy(
            stored,
            SearchOrder(
                run_id=run_id,
                revision=0,
                target_count=max(1, int(stored.get("target") or 20)),
            ),
        )
    assembled = runner.assemble(current)
    if assembled["rows_returned"] == 0 and not any(
        row["state"] != "not_started" for row in assembled["angles"]
    ):
        # Nothing answers this order. Two very different reasons, and the
        # version this replaced gave the same answer to both.
        #
        # A run with NO attempts at all is a run from before work was recorded
        # per angle. Its stored blob is a real result and it opens.
        #
        # A run WITH attempts that no longer answer is a CORRECTED order:
        # changing the count changes what every search asks for, so every
        # stored result answered the previous request. Handing back the
        # previous revision's blob labelled `legacy` says two false things at
        # once -- that these are results for this order, and that this run
        # predates per-angle recording. The honest answer is the empty view,
        # which says every search is unrun and offers to run them, with the
        # earlier work still stored and still readable at its own revision.
        if not store.load_attempts(run_id):
            legacy = store.load_results(run_id)
            if legacy is not None and legacy.get("candidates"):
                return _upgrade_legacy(legacy, current)
            return None
    return assembled


def _upgrade_legacy(stored: dict, current: "SearchOrder") -> dict:
    """An old stored result, read into the shape the screen now expects.

    Runs from before work was recorded per angle are real results and they open.
    What they cannot do is name their searches -- there are no attempts behind
    them -- so every field the new screen reads is filled with the honest
    default rather than left missing. A missing field is not a smaller version
    of a result; it is a crash on a page the operator opened expecting their
    research.
    """
    candidates = [
        {
            # A legacy row has no member sightings, so it cannot have a real
            # candidate id. Named from its position instead, and marked, so
            # nothing files a verdict against it believing it is stable.
            "candidate_id": f"legacy-{index}",
            "name": row.get("name", ""),
            "district": row.get("district", ""),
            "evidence": row.get("evidence", ""),
            "found_by": list(row.get("found_by", [])),
            "overlap": row.get("overlap", len(row.get("found_by", []))),
            # Neither was recorded at the time. Empty is the truthful answer:
            # nothing was checked, rather than nothing was found.
            "possible_duplicates": [],
            "possible_duplicate_ids": [],
            "sightings": [],
        }
        for index, row in enumerate(stored.get("candidates", []))
    ]
    angles = [
        {
            "angle_id": row.get("angle_id", ""),
            "angle": row.get("angle", ""),
            "shape": "",
            "group": "",
            "role": "broad",
            "wanted": 0,
            "edited": False,
            "custom": False,
            "state": "failed" if row.get("failed") else "completed",
            "failed": bool(row.get("failed")),
            "rows": row.get("rows", 0),
            "sources": row.get("sources", 0),
            "reason": row.get("reason", ""),
            "found": 0,
            "shared": 0,
            "exclusive": 0,
            "gathered_at": "",
            "reused": False,
        }
        for row in stored.get("angles", [])
    ]
    target = stored.get("target", current.target_count)
    return {
        "run_id": current.run_id,
        "revision": stored.get("revision", 0),
        "target": target,
        "found": stored.get("found", len(candidates)),
        "shortfall": stored.get("shortfall", max(0, target - len(candidates))),
        "rows_returned": stored.get("rows_returned", 0),
        "running": False,
        "complete": not any(row["failed"] for row in angles),
        "uncertain_identity": 0,
        "capacity": 0,
        "cut_checked": False,
        "barred_count": 0,
        "empty_handed": [],
        "capacity_warning": "",
        "order": {
            "kind": current.kind,
            "place": current.place,
            "target_count": target,
            "standard": current.standard,
            "exclusions": current.exclusions,
            "count_source": current.count_source,
            "count_ambiguous": current.count_ambiguous,
            "count_note": current.count_note,
            "answer_notes": list(current.answer_notes),
        },
        "angles": angles,
        "candidates": candidates,
        # Read by the screen, which then says individual searches cannot be
        # re-run from here rather than offering a button that would do nothing.
        "legacy": True,
    }


def results(run_id: str) -> dict | None:
    """What a previous run found, assembled fresh from the stored attempts."""
    return progress(run_id)


def runs(*, include_hidden: bool = False) -> list[dict]:
    """The shelf: every run, and how far each one got.

    A read and nothing else. It does not go through `order()`, because that
    builds an order for an agreed run that has none, and looking at a list is
    not a decision to write to every run on it.

    A run whose stage cannot be worked out is still listed, as `unreadable`.
    One bad row must not take the rest of the shelf down with it.
    """
    shelf = []
    for row in store.list_runs(include_hidden=include_hidden):
        try:
            where = _stage_of(row["run_id"], row["status"])
        except Exception:  # noqa: BLE001 -- one run must not hide the others
            logger.exception("Could not read listicle run %s", row["run_id"])
            where = {"stage": "unreadable", "found": None, "target": None}
        shelf.append({**row, **where})
    return shelf


def _stage_of(run_id: str, status: str) -> dict:
    """Where one run stands: interview, agreed, searching or searched."""
    if status != "agreed":
        return {"stage": "interview", "found": None, "target": None}
    if store.load_order(run_id) is None:
        # Agreed before orders were recorded. Its stored result, if any, is a
        # real one -- the same reading `progress` gives it.
        legacy = store.load_results(run_id)
        if legacy and legacy.get("candidates"):
            return {
                "stage": "searched",
                "found": int(legacy.get("found") or len(legacy["candidates"])),
                "target": legacy.get("target"),
            }
        return {"stage": "agreed", "found": None, "target": None}
    found = progress(run_id)
    if found is None:
        return {"stage": "agreed", "found": None, "target": None}
    return {
        "stage": "searching" if found.get("running") else "searched",
        "found": found.get("found"),
        "target": found.get("target"),
    }


def set_hidden(run_id: str, hidden: bool) -> None:
    """Take a run off the shelf, or put it back. Nothing about the run changes."""
    if not store.run_exists(run_id):
        raise LookupError(f"No listicle run {run_id}.")
    store.set_hidden(run_id, hidden)


def build_profile(
    *,
    name: str,
    city: str,
    district: str = "",
    angles: list[str] | None = None,
    run_id: str = "",
    research=None,
    resolve_identity: bool = True,
) -> "PlaceProfile":
    """Open this place's profile, anchor it, and gather what has been said.

    Deliberately not called by the search step. A profile is worth building for
    a candidate that survives, and wiring this in would research every row
    returned -- around forty on a real run -- including the ones that are there
    to be thrown away.

    `gate.assess` exists and is tested, but it answers one question: is enough
    published about this place to write about it. It does not answer whether
    the place breaks the cut, and the two are not the same question. Run
    33fca394 returned eight Nikkei and Japanese restaurants against an explicit
    "no places where ceviche is not the primary offering", and every one of
    them is written about constantly -- so a wired gate would have passed all
    eight. Checking the cut is a separate judgement about each place, and it is
    not built.

    Running it twice on the same place is safe and is the normal case: the
    profile is found rather than created, claims already held are not added
    again, and a sighting from a run already recorded is ignored.
    """
    from .profiles import Sighting
    from . import identity, places, profile_research, profile_store

    place_id = ""
    address = ""
    lookup_name = name
    if resolve_identity:
        resolved = identity.resolve(name, city, district)
        if resolved is not None:
            place_id = resolved.place_id
            address = resolved.address
            # The name Google holds, not the one a search happened to write.
            # "Bar Rovira del Callao" is really "Tradición Chalaca Rovira
            # 1907", and looking a place up under a name it does not use is
            # how a lookup comes back thin.
            lookup_name = resolved.name or name
            if resolved.permanently_closed:
                # Recorded rather than acted on. Whether a closed place stays
                # on a list is the gate's decision and the operator's, not
                # this step's.
                logger.warning("%r resolves to a permanently closed place", name)
            if not resolved.is_venue:
                logger.warning(
                    "%r resolves to %s, which is not somewhere a reader can be "
                    "served", name, ", ".join(resolved.types) or "nothing",
                )

    profile = profile_store.open_profile(
        name=name, city=city, district=district, place_id=place_id
    )

    for angle in angles or []:
        if run_id:
            profile_store.add_sighting(
                profile.profile_id, Sighting(angle=angle, run_id=run_id)
            )

    # What Google holds, before anything a model read. Cheap, factual, and the
    # only material in a profile no model wrote -- and the only source of the
    # customer voice a cheap-eats or value angle is written from.
    if place_id:
        details = places.fetch_details(place_id)
        if details.failed:
            logger.warning(
                "Place details unavailable for %r: %s", name, details.reason
            )
        else:
            added = profile_store.add_claims(
                profile.profile_id, places.claims_from(details)
            )
            logger.info("Profile %s: %s claims from Places", profile.profile_id, added)

    if research is not None:
        result = profile_research.research_place(
            lookup_name, city, list(angles or []), research, address=address
        )
        if result.failed:
            # Raised rather than logged. A profile recorded as having nothing
            # written about it, when the truth is the call never ran, is a
            # place the gate will drop for the network's mistake.
            raise RuntimeError(
                f"Research for {name!r} failed ({result.reason}); the profile "
                "was left as it was rather than recorded as empty."
            )
        added = profile_store.add_claims(profile.profile_id, result.claims)
        logger.info(
            "Profile %s: %s claims found, %s new%s",
            profile.profile_id,
            len(result.claims),
            added,
            f" -- {result.reason}" if result.reason else "",
        )

    # Re-read under the identity this profile actually has, including the
    # district. A name-and-city read could match a second branch of the same
    # business and hand back the wrong one's claims.
    refreshed = profile_store.find(
        place_id=profile.place_id,
        name=name,
        city=city,
        district=district or profile.district,
    )
    return refreshed or profile
