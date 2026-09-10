#!/usr/bin/env python3
"""Offline review probes, not retrieval-quality tests.

Uses actual listicle modules and actual SQLite utilities in a disposable DB.
Skips package __init__ to avoid API/provider bootstrapping. Only the external
grill engine is stubbed; its behavior is explicitly outside this review.
No API calls, production DB reads/writes, or dependency installation.
Run with Python 3.11+ and Pydantic 2. Output is JSON, no files by default.

ADAPTED 2026-09-09, while implementing the plan this harness was written for.
Two probes called an interface the fix necessarily changed, and a probe that
crashes cannot report that a fault stopped reproducing. The claims are
unchanged; only the call shape is:

  R5  `review_candidates` returned a dict keyed by NAME, which is the fault.
      It now returns a review record whose verdicts are keyed by candidate id.
      The probe still asks the original question -- does looking a verdict up
      by name give the same flag to both rows -- against a name index built
      from the returned record.
  R1  `service._ensure_order` was split into create / read / re-agree. The name
      is kept in the source as a thin shim for exactly this caller, so this
      line is untouched.
  R7  the probe asked whether candidate 121 reached the FIRST reviewer prompt,
      which was the only prompt there could be while the pool was truncated at
      120. The pool is now chunked, so the same question is asked of every
      prompt the reviewer received.
"""
from __future__ import annotations

import contextlib
import hashlib
import importlib
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import types
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
BACKEND = ROOT / "apps/backend"
logging.disable(logging.CRITICAL)


def package(name, path):
    module = types.ModuleType(name)
    module.__path__ = [str(path)]
    sys.modules[name] = module


def main():
    records = []

    def record(key, observed, expected, confirmed):
        records.append(dict(id=key, observed=observed, expected=expected,
                            reproduces=bool(confirmed)))

    with tempfile.TemporaryDirectory(prefix="listicle-review-") as scratch:
        os.environ["DATA_DIR"] = scratch
        sys.path.insert(0, str(BACKEND))
        package("app.features", BACKEND / "app/features")
        package("app.features.listicle_pipeline", BACKEND / "app/features/listicle_pipeline")
        package("app.features.prompt2blog", BACKEND / "app/features/prompt2blog")
        engine = types.ModuleType("app.features.prompt2blog.grill_v4")
        engine.GrillDependencies = SimpleNamespace
        engine.start_grill = lambda **kwargs: None
        engine.reopen_grill = lambda state, dependencies: state
        engine.answer_grill = lambda state, text, dependencies: state
        engine._lookups_left = lambda state: 0
        engine._marker_status = lambda state, markers: str(state.markers_covered)
        engine._transcript = lambda state: ""
        sys.modules[engine.__name__] = engine
        names = "contracts search shapes spec store runner cut_review profiles profile_store prompts service".split()
        modules = {n: importlib.import_module(f"app.features.listicle_pipeline.{n}") for n in names}
        c, search, shapes, spec, store, runner, cut, profiles, ps, prompts, service = [modules[n] for n in names]
        gc = importlib.import_module("app.features.prompt2blog.contracts_v4")
        db = importlib.import_module("app.core.database")
        assert Path(db.DB_PATH).parent == Path(scratch)

        def turn(marker, answer, index=1):
            return gc.GrillTurn(question=gc.GrillQuestion(
                question_id=f"{marker}-{index}", topic=marker, ask="Set value",
                recommendation=answer, asks_about=marker), answer=answer)

        def state(run_id, count=20):
            return gc.GrillState(run_id=run_id, seed=f"The {count} best hotels in Lima",
                status="agreed", consensus="Agreed", marker_keys=c.LISTICLE_MARKER_KEYS,
                markers_covered=list(c.LISTICLE_MARKER_KEYS), turns=[
                    turn("count", str(count)), turn("angles", "Cheap hotels in Lima")])

        def order(run_id, *, exclusions="", shape="cheap", count=20):
            return c.SearchOrder(run_id=run_id, kind="hotels", place="Lima",
                target_count=count, exclusions=exclusions, angles=[c.SelectedAngle(
                    angle_id="a1", text="Cheap hotels in Lima", shape_key=shape,
                    role="broad", wanted=15)])

        def seed(run_id, **kwargs):
            store.save(state(run_id)); o = order(run_id, **kwargs); store.save_order(o); return o

        # R1: simulate a valid engine-returned re-agreement at the service boundary.
        old = state("reagree", 40); store.save(old); service._ensure_order(old)
        changed = old.model_copy(update={"turns": old.turns + [turn("count", "20", 2)],
                                         "consensus": "20 hotels agreed"})
        service.answer_grill = lambda *_: changed
        base = SimpleNamespace(llm=None, research=None, job_id="listicle.grill", model_name=None)
        service.answer("reagree", "20", base)
        observed = {"resolved_transcript_count": spec.build_search_order(changed).target_count,
                    "stored_order_count": store.load_order("reagree").target_count}
        record("R1", observed, "Both counts 20 after explicit re-agreement", observed == {
            "resolved_transcript_count": 20, "stored_order_count": 40})

        # R2: real service and runner refresh the same revision.
        seed("refresh")
        good = service.search("refresh", lambda _: ("Hotel Uno | Centro | good\nHotel Dos | Sur | good", [], 0))
        def fail(_): raise TimeoutError("offline injected failure")
        bad = service.search("refresh", fail, reuse=False)
        attempts = store.load_attempts("refresh")
        observed = {"before": good["found"], "after": bad["found"], "stored_attempts": len(attempts),
                    "successful_attempts_remaining": sum(a.state == "completed" for a in attempts)}
        record("R2", observed, "Keep last successful result and separate failed refresh", observed == {
            "before": 2, "after": 0, "stored_attempts": 1, "successful_attempts_remaining": 0})

        # R3: force both reads to finish before either writer claims the lock.
        store.ensure_tables(); original = store.get_db_connection; barrier = threading.Barrier(2)
        class Cursor:
            def __init__(self, cursor): self.cursor = cursor
            def fetchone(self):
                row = self.cursor.fetchone(); barrier.wait(timeout=10); return row
        class Connection:
            def __init__(self, connection): self.connection = connection
            def execute(self, sql, args=()):
                cursor = self.connection.execute(sql, args)
                return Cursor(cursor) if sql.startswith("SELECT started_at") else cursor
        @contextlib.contextmanager
        def interleaved():
            with original() as connection: yield Connection(connection)
        store.get_db_connection = interleaved
        try:
            with ThreadPoolExecutor(2) as executor:
                futures = [executor.submit(store.claim_batch, "race", 1) for _ in range(2)]
                claimed = [f.result(timeout=15) for f in futures]
        finally: store.get_db_connection = original
        record("R3", claimed, "Exactly one True", claimed == [True, True])

        # R4: synthetic venue names are deliberately different real-world identities.
        sightings = [search.Sighting(str(i), str(i), name, "Centro", "different venue")
                     for i, name in enumerate(["Hotel Sol", "Hotel Sol Palace"])]
        pooled = search.pool_sightings(sightings)
        observed = [{"name": x.name, "sightings": len(x.sightings), "possible_duplicates": x.possible_duplicates} for x in pooled]
        record("R4", observed, "Two candidates, linked as possible duplicates", len(pooled) == 1 and not pooled[0].possible_duplicates)

        # R5: reviewer correctly flags only one numbered branch; storage loses row identity.
        o = order("branches", exclusions="No bars inside hotels")
        candidates = [dict(name="Azul", district=d, sightings=[{"evidence": e}]) for d, e in [
            ("Centro", "inside a hotel"), ("Barranco", "independent street bar")]]
        reviewed = cut.review_candidates(o, candidates, lambda *_: {"barred": [{
            "number": 1, "name": "Azul", "why": "Inside a hotel", "confidence": "clear"}]})
        flags = {}
        for verdict in getattr(reviewed, "verdicts", []):
            flags.setdefault(verdict.name, {"why": verdict.why, "confidence": verdict.confidence})
        looked_up = [flags.get(x["name"]) for x in candidates]
        record("R5", looked_up, "Only row 1 flagged", bool(looked_up[0]) and looked_up[0] == looked_up[1])

        # R6: changed results, failed refresh review, old review survives.
        seed("stale", exclusions="No hotel bars")
        service.search("stale", lambda _: ("Old Venue | Centro | standalone", [], 0), review=lambda *_: {"barred": []})
        def fail_review(*_): raise TimeoutError("offline review failure")
        refreshed = service.search("stale", lambda _: ("New Venue | Norte | inside hotel", [], 0), reuse=False, review=fail_review)
        observed = {"names": [x["name"] for x in refreshed["candidates"]], "cut_checked": refreshed["cut_checked"], "barred_count": refreshed["barred_count"]}
        record("R6", observed, "New pool is unchecked after review failure", observed["names"] == ["New Venue"] and observed["cut_checked"])

        # R7: legal target and per-angle allowances; 121 rows across nine searches.
        o = order("coverage", exclusions="No hotel bars", count=200)
        o.angles = [c.SelectedAngle(angle_id=f"a{i}", text=f"Route {i}", wanted=15) for i in range(9)]
        store.save_order(o)
        for i, angle in enumerate(o.angles):
            rows = [{"name": f"Venue{j:03}", "district": "Centro", "evidence": "candidate", "angle": angle.text, "angle_id": angle.angle_id}
                    for j in range(i * 15, min((i + 1) * 15, 121))]
            store.save_attempt(c.SearchAttempt(run_id=o.run_id, revision=1, angle_id=angle.angle_id,
                state="completed", rows=len(rows), sightings=rows, request_fingerprint=o.angle_fingerprint(angle)))
        assembled = runner.assemble(o); captured = []
        def review_capture(_job, prompt, *_): captured.append(prompt); return {"barred": []}
        service._review_candidates(o, assembled, review_capture)
        observed = {"pool_count": len(assembled["candidates"]),
                    "last_candidate_sent": any("Venue120" in prompt for prompt in captured),
                    "cut_checked": runner.assemble(o)["cut_checked"]}
        record("R7", observed, "All 121 reviewed or partial coverage explicit", observed == {
            "pool_count": 121, "last_candidate_sent": False, "cut_checked": True})

        observed = {k: shapes.subject_of(k) for k in ["cevicherias", "cevicherías", "hotels", "hotels with rooftop bars", "hotel bars"]}
        record("R8", observed, "Accented cevicherías -> restaurants; hotels with bars -> hotels; hotel bars -> bars",
               observed["cevicherías"] == "" and observed["hotels with rooftop bars"] == "bars")

        # R9: distinct strong IDs fall through to one provisional name/city key.
        one = ps.open_profile(name="Azul", city="Lima", district="Centro", place_id="place-A")
        two = ps.open_profile(name="Azul", city="Lima", district="Barranco", place_id="place-B")
        observed = {"same_profile": one.profile_id == two.profile_id, "requested_second_id": "place-B", "returned_second_id": two.place_id}
        record("R9", observed, "Distinct IDs produce distinct profiles", observed["same_profile"] and two.place_id == "place-A")

        # R10: one execution, copied across three revisions, becomes triple history.
        o = seed("history", shape="institution"); calls = []
        def research(_):
            calls.append(1); return ("\n".join(f"Lodging{i:02} | Centro | candidate" for i in range(10)), [], 0)
        service.search(o.run_id, research)
        for _ in range(2):
            service.revise_order(o.run_id, target_count=20); service.search(o.run_id, research)
        note = runner.prior_contribution(order("new-history", shape="institution"))["a1"]
        record("R10", {"provider_calls": len(calls), "note": note}, "History counts one execution: ten rows", len(calls) == 1 and "30 rows" in note)

        # S1: a reuse-only POST still repeats an unchanged candidate review.
        seed("review-reuse", exclusions="No chains"); review_calls = []
        def counter(*_): review_calls.append(1); return {"barred": []}
        for _ in range(2): service.search("review-reuse", lambda _: ("Inn Uno | Centro | family owned", [], 0), review=counter)
        record("S1", {"review_calls": len(review_calls)}, "One review for identical evidence", len(review_calls) == 2)

        # S2: catalogue phase predicate; helpers above are inert, catalogue code is real.
        sample = state("catalogue")
        counts = {}
        for phase, markers in [("before_bar_cut", ["kind", "place", "count"]), ("agreement", list(c.LISTICLE_MARKER_KEYS))]:
            sample = sample.model_copy(update={"markers_covered": markers})
            block = prompts._catalogue_block(sample)
            counts[phase] = {"words": len(block.split()), "full_menu": "means:" in block}
        counts["menu_words"] = {s: len(shapes.shape_menu(s).split()) for s in shapes.SUBJECTS}
        record("S2", counts, "Outline before bar/cut; full only for menu; no full menu at agreement", all(counts[p]["full_menu"] for p in ["before_bar_cut", "agreement"]))

        # Controls: prevent proposed fixes from flattening correct existing behavior.
        branch_rows = [search.Sighting(str(i), str(i), name, district, "candidate") for i, (name, district) in enumerate([
            ("Hotel Azul (Lobby bar)", "Centro"), ("Hotel Azul (Rooftop bar)", "Centro")])]
        separated = search.pool_sightings(branch_rows)
        controls = {"conflicting_rooms_already_separate": len(separated) == 2,
                    "hotel_bars_already_classified_as_bars": shapes.subject_of("hotel bars") == "bars"}

    result = dict(commit=subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        source_sha256={p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                       for p in sorted((BACKEND / "app/features/listicle_pipeline").glob("*.py"))},
        method="Actual listicle source and real disposable SQLite; fake research responses; external grill engine stubbed; no suite or live calls",
        findings=records, controls=controls)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if all(x["reproduces"] for x in records) and all(controls.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
