"""Running the day's selection in the app, on the Claude subscription.

(The module keeps its name and job id, `itinerary.day_research`: the call
still researches, it just no longer writes an article. ADR 0045.)

The copy-and-paste boundary was the plan's deliberate choice and it is still
supported. It also turned out to be the part that failed in practice: the
packet is twelve kilobytes of nested JSON, a chat window has nothing enforcing
its shape, and every attempt came back missing something.

The CLI transport solves exactly that. `--json-schema` is not a request: the
CLI validates the reply against the schema and hands back a parsed object, and
it does so while `WebSearch` and `WebFetch` are available. Measured on
2026-09-16 against a one-field lookup: five turns, real hours, real URL, and a
`structured_output` object rather than a string to be salvaged.

Three things this deliberately does NOT change.

**The operator still reviews.** What comes back goes through the same preview
and the same Save as a paste. The app has not verified anything; it has only
saved the operator a copy, a paste, and a shape.

**The same validator judges it.** There is one set of checks, and an answer
that arrives by API is held to it exactly as one that arrives by clipboard.

**Identity is stamped, not asked for.** A pasted packet has to echo the export
it answers, because the operator could paste anything. A call this module made
is by construction the answer to the export it was made for, so those five
fields are filled in from what we already hold rather than asked of the model
and then checked. Five fewer things to get wrong, and no weaker.

**What the run did is read off the run.** A compact export asks the model
nothing about itself -- not whether it browsed, not when. The session id the
CLI returns names exactly one transcript; that transcript, and only that one,
is copied into the app's own audit folder and its WebSearch and WebFetch calls
are counted. When it cannot be found the counts are unknown, and unknown is
what the screen says. Nothing here infers browsing from a turn count.

**One call, no retry.** Whatever the research allowance in the prompt says, it
is guidance: the transport buffers a subprocess and cannot stop it at a tool
boundary and still get an answer. The timeout below is a failure ceiling, not
a budget, and a failed run is reported and left for the operator to re-run.
"""

from __future__ import annotations

import copy
import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any

from .contracts import DayPromptExport
from .selection_contract import call_schema

logger = logging.getLogger(__name__)

RESEARCH_JOB = "itinerary.day_research"

# A day is searches, fetches and then the writing, and how much of that there
# is depends on how many stops the day has. One constant for every day size was
# the original choice and it was wrong: 1200s was measured on a three-stop day
# and then assumed to cover "the largest day this feature builds". On
# 2026-09-16 a seven-stop day was killed at exactly 1200s with the call still
# working, and twenty minutes of finished searching went in the bin with it.
#
# So the limit scales with the work. Two runs of the same three-stop day, both
# successful, are the measurement behind the numbers below:
#
#     11m57s / 60 round trips / $2.25      14m12s / 54 round trips / $2.70
#
# That is roughly nineteen provider round trips per stop at fourteen seconds
# each, plus a fixed cost at either end for reading the brief and writing the
# package. Five minutes of base and five minutes per stop covers both of those
# runs with headroom and puts a seven-stop day at forty minutes.
#
# These bound a call that is proceeding, not a hang. A stopped subprocess loses
# everything -- `subprocess.run` buffers the output and discards it on timeout
# -- so cutting a working call off early is strictly more expensive than
# waiting, and the quota breaker bounds the spend either way.
RESEARCH_BASE_SECONDS = 300.0
RESEARCH_SECONDS_PER_STOP = 300.0

# The transport's own ceiling, which no per-day number may exceed: past this
# the CLI stops on its own and this app's limit would be a fiction. Held here
# rather than imported because this module must import without a Claude
# connection; `test_itinerary_research` pins the two together.
RESEARCH_CEILING_SECONDS = 2700.0


def timeout_for(export: DayPromptExport) -> float:
    """How long this particular day's research is allowed to take.

    Also what `service` measures a silent run against before reporting it as
    never heard from again -- the same number, so a day is never declared lost
    while its own call is still inside its own limit.
    """
    stops = max(1, len(export.slot_ids))
    seconds = RESEARCH_BASE_SECONDS + RESEARCH_SECONDS_PER_STOP * stops
    return min(seconds, RESEARCH_CEILING_SECONDS)


class ResearchUnavailable(RuntimeError):
    """The research call could not be made or could not be used.

    `kind` carries the transport's own classification through unchanged, so a
    screen can tell an exhausted subscription from a provider that fell over
    from an answer that came back unusable. Flattening those to one message is
    how an operator ends up retrying something that will never work.
    """

    def __init__(self, message: str, *, kind: str = "invalid_response") -> None:
        super().__init__(message)
        self.kind = kind


def schema_for_call(export: DayPromptExport) -> dict[str, Any]:
    """The export's schema without the identity, which this module stamps.

    Asking for five `const`s the app already knows would add five ways to fail
    a call whose answer cannot be misattributed. The schema carries no
    `$schema` line: the CLI cannot resolve the meta-schema by URL and refuses
    the whole call when one is present.
    """
    return call_schema(copy.deepcopy(export.response_schema))


def stamp_identity(payload: dict[str, Any], export: DayPromptExport) -> dict[str, Any]:
    """Put this app's own identity on an answer it asked for."""
    return {
        **payload,
        "contractVersion": export.schema_version,
        "workspaceId": export.workspace_id,
        "dayId": export.day_id,
        "exportId": export.export_id,
        "inputHash": export.input_hash,
    }


def build_prompt(export: DayPromptExport) -> str:
    """What the in-app call sends: assembled from the export's own sections."""
    return export.call_prompt


def system_prompt_for(export: DayPromptExport) -> str | None:
    """The call site's own system prompt, or None for the shared one."""
    return export.system_prompt or None


def sent_sizes(export: DayPromptExport) -> dict[str, int]:
    """Exactly what this app hands the transport, in characters."""
    system = system_prompt_for(export)
    prompt = build_prompt(export)
    schema = json.dumps(schema_for_call(export), ensure_ascii=False, separators=(",", ":"))
    return {
        "system": len(system) if system is not None else 0,
        "prompt": len(prompt),
        "schema": len(schema),
        "total": (len(system) if system is not None else 0) + len(prompt) + len(schema),
    }


def run_research(
    *, export: DayPromptExport, model_name: str, call: Any
) -> dict[str, Any]:
    """One selection assignment for one exported day.

    `call` is the transport, injected so this is testable without a
    subscription, a subprocess or a network. It is handed the prompt, the
    trimmed schema and the tool policy, and is expected to return the CLI's
    payload dict.

    Returns the raw JSON text plus what the call cost and whether tools
    actually ran. `turns` is the load-bearing one: a single turn means the
    model never searched, whatever its `browsingUsed` flag claims about itself.
    """
    payload = call(
        prompt=build_prompt(export),
        schema=schema_for_call(export),
        model_name=model_name,
        timeout_seconds=timeout_for(export),
        system_prompt=system_prompt_for(export),
    )
    structured = payload.get("structured_output")
    if not isinstance(structured, dict) or not structured:
        # The CLI validates against the schema before filling this in, so an
        # empty one means the reply never satisfied the shape. The raw text is
        # kept for the operator to look at rather than thrown away.
        raw = payload.get("result")
        logger.warning(
            "Itinerary research returned no schema payload: %s",
            (raw if isinstance(raw, str) else repr(raw))[:400],
        )
        raise ResearchUnavailable(
            "The research came back in a shape the app could not read. Nothing "
            "was saved. You can try again, or copy the prompt and run it "
            "yourself."
        )

    stamped = stamp_identity(structured, export)
    turns = payload.get("num_turns")
    usage = payload.get("usage")
    duration = payload.get("duration_ms")
    session = payload.get("session_id")
    return {
        "raw": json.dumps(stamped, ensure_ascii=False),
        # The model's own object, before this app put its identity on it.
        "returned": json.dumps(structured, ensure_ascii=False),
        "session_id": session if isinstance(session, str) else "",
        "usage": usage if isinstance(usage, dict) else {},
        "duration_ms": duration
        if isinstance(duration, int) and not isinstance(duration, bool)
        else None,
        # Named by the transport, which knows that `modelUsage` is a map and
        # that the first entry in it is routinely a small helper rather than
        # the model that did the work. Reading a key off the payload by hand is
        # how this repo once recorded every Claude call as haiku.
        "model": str(payload.get("resolved_model") or ""),
        "cost_usd": payload.get("total_cost_usd"),
        "turns": turns if isinstance(turns, int) and not isinstance(turns, bool) else None,
        "tool_denials": payload.get("tool_denials") or [],
    }


def default_transport():
    """The live CLI, with the open web and an enforced schema.

    Imported at call time so that importing this feature — which every test
    that touches the router does — does not require the Claude connection to
    exist.

    Wrapped in `observe_job_call` like every other model call this backend
    makes, so the dashboard sees this job under its own name. It does not go
    through `model_calls.research_text`, which is the usual seam, because that
    one runs the text-only research writer: this call needs the schema and the
    tools together, which is a combination no existing helper makes. The
    reporting is therefore done here by hand, and that is the one part of this
    function worth checking if the dashboard ever stops showing it.

    One job here is many provider round trips, not one — searches, fetches,
    then the writing — and the usage that comes back covers the whole
    assignment. Splitting it would be a guess.
    """
    from model_gateway.usage import observe_job_call

    from app.features.claude_connection import cli_writer
    from app.shared.model_calls import _provider_for

    def call(
        *,
        prompt: str,
        schema: dict,
        model_name: str,
        timeout_seconds: float,
        system_prompt: str | None = None,
    ):
        with observe_job_call(
            RESEARCH_JOB,
            provider=_provider_for(model_name),
            model=model_name,
            endpoint="research_structured",
        ) as observed:
            payload = _dispatch(
                cli_writer, prompt, schema, model_name, timeout_seconds, system_prompt
            )
            served = payload.get("resolved_model")
            if isinstance(served, str) and served:
                observed.set_model(served)
                observed.set_provider(_provider_for(served))
            usage = payload.get("usage")
            if isinstance(usage, dict):
                observed.record_usage(usage)
        return payload

    return call


def _dispatch(cli_writer, prompt, schema, model_name, timeout_seconds, system_prompt=None):
    """The subprocess call itself, with the transport's faults carried through.

    The system prompt is this call site's own when the export has one. The
    shared research writer's prompt describes an article and is left alone for
    its other callers.
    """
    try:
        payload, alias = cli_writer._invoke(
            prompt,
            model_name,
            schema,
            allowed_tools=cli_writer.RESEARCH_TOOLS,
            denied_tools=cli_writer.RESEARCH_DENIED_TOOLS,
            system_prompt=system_prompt or cli_writer.RESEARCH_SYSTEM_PROMPT,
            timeout_seconds=timeout_seconds,
        )
    except cli_writer.ClaudeCliWriterError as error:
        # The transport's own classification, carried through. An exhausted
        # subscription and a malformed reply need different next steps and the
        # screen has to be able to tell them apart.
        raise ResearchUnavailable(
            str(error), kind=getattr(error, "kind", "invalid_response")
        ) from error
    return {
        **payload,
        # Resolved here because only this layer holds the alias the transport
        # needs to fall back on.
        "resolved_model": cli_writer._canonical_model(payload, alias),
        "tool_denials": cli_writer._tool_denials(payload),
    }


# ------------------------------------------------------------ the transcript --


def claude_config_dir() -> Path:
    configured = os.environ.get("CLAUDE_CONFIG_DIR", "").strip()
    return Path(configured).expanduser() if configured else Path.home() / ".claude"


def find_transcript(session_id: str, *, root: Path | None = None) -> Path | None:
    """The one transcript with exactly this session id, or None.

    Matched on the file name the CLI gives a session, never on timestamps or
    on "the newest file": a neighbouring session is somebody else's work.
    """
    cleaned = (session_id or "").strip()
    if not cleaned or "/" in cleaned or ".." in cleaned:
        return None
    projects = (root or claude_config_dir()) / "projects"
    try:
        matches = sorted(projects.glob(f"*/{cleaned}.jsonl"))
    except OSError:
        return None
    return matches[0] if len(matches) == 1 else None


def count_tool_calls(path: Path) -> dict[str, int] | None:
    """How many times each tool was called in one transcript.

    Counted by tool-use id, because a transcript can repeat a message across
    streamed lines. None when the file cannot be read -- which is unknown,
    not zero.
    """
    seen: dict[str, str] = {}
    try:
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                message = entry.get("message") if isinstance(entry, dict) else None
                content = message.get("content") if isinstance(message, dict) else None
                if not isinstance(content, list):
                    continue
                for block in content:
                    if (
                        isinstance(block, dict)
                        and block.get("type") == "tool_use"
                        and isinstance(block.get("id"), str)
                    ):
                        seen[block["id"]] = str(block.get("name") or "")
    except OSError:
        return None
    counts: dict[str, int] = {}
    for name in seen.values():
        counts[name] = counts.get(name, 0) + 1
    return counts


def keep_transcript(session_id: str, destination: Path) -> dict[str, Any]:
    """Copy this run's transcript into app-owned storage and count its tools.

    Returns what was learned. Every field may be missing, and a missing
    transcript is a telemetry gap, never a failed day.
    """
    found = find_transcript(session_id)
    if found is None:
        return {"transcript_path": "", "tool_counts": None}
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(found, destination)
        kept = destination
    except OSError:
        logger.warning("Could not copy research transcript %s", session_id)
        kept = found
    return {"transcript_path": str(kept), "tool_counts": count_tool_calls(kept)}
