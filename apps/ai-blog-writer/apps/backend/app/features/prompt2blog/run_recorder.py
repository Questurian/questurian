from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.core import (
    delete_stage_result,
    write_artifact,
    write_stage_result,
    write_status,
)
from app.shared.provider_faults import provider_fault_kind

from .config import FEATURE_NAME
from .observability import _now_iso

logger = logging.getLogger(__name__)

StageWriter = Callable[[str, str, dict[str, Any]], None]
StageDeleter = Callable[[str, str], None]
ArtifactWriter = Callable[[str, dict[str, Any]], None]

# The stage row for the run's append-only usage ledger. Written under one name
# on purpose: the ledger is cumulative, so the upsert that loses a repeated
# stage's earlier receipt cannot lose anything here -- every rewrite is a
# superset of the one before it.
USAGE_LEDGER_STAGE = "usage_ledger"


class UsageLedger(Protocol):
    """The token tracker, as the recorder needs it.

    Attempts are numbered here rather than counted from the stage rows,
    because the stage rows are keyed `(run_id, stage)` and a second pass
    overwrites the first. The ledger is the record; the stage rows are a view
    of the latest pass.
    """

    def begin_stage(self, stage: str) -> int: ...

    def attempt_usage(self, stage: str, attempt: int) -> dict[str, int]: ...

    def ledger(self) -> dict[str, Any]: ...


@dataclass(frozen=True)
class RunRecorder:
    """The only Prompt2Blog adapter allowed to mutate run lifecycle storage."""

    status_writer: Callable[..., None] = write_status
    stage_writer: StageWriter = write_stage_result
    stage_deleter: StageDeleter = delete_stage_result
    artifact_writer: ArtifactWriter = write_artifact
    clock: Callable[[], str] = _now_iso
    # Left unset by the pipeline's own tests and by any caller that builds a
    # recorder without a token tracker; attribution is then simply absent.
    usage_tracker: UsageLedger | None = None
    active_stages: dict[str, str] = field(
        default_factory=dict,
        compare=False,
        repr=False,
    )
    active_attempts: dict[str, int] = field(
        default_factory=dict,
        compare=False,
        repr=False,
    )

    def queue(self, run_id: str, owner_staff_id: str | None = None) -> None:
        self.status_writer(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": "queued",
                "error": None,
                "failure_kind": None,
                "updated_at": self.clock(),
            },
            feature=FEATURE_NAME,
            owner_staff_id=owner_staff_id,
        )

    def _open_attempt(self, run_id: str, stage: str) -> None:
        if self.usage_tracker is None:
            return
        try:
            self.active_attempts[run_id] = self.usage_tracker.begin_stage(stage)
        except Exception as exc:  # pragma: no cover -- telemetry only
            logger.warning("Prompt2Blog stage usage attempt failed: %s", exc)
            self.active_attempts.pop(run_id, None)

    def _stage_usage(self, run_id: str, stage: str) -> dict[str, int] | None:
        # Only the stage that is currently open gets a receipt on its row.
        # Debug dumps like `pipeline_v2` and `langgraph_trace` are written
        # under a name no `start_stage` ever opened. Their tokens are not lost:
        # whatever was spent is in the ledger under the stage that was open.
        if self.usage_tracker is None or self.active_stages.get(run_id) != stage:
            return None
        attempt = self.active_attempts.get(run_id)
        if attempt is None:
            return None
        try:
            # Read for this attempt rather than diffed against a running total,
            # so a stage that records twice reports the same attempt twice
            # instead of reporting the second write as zero.
            return dict(self.usage_tracker.attempt_usage(stage, attempt))
        except Exception as exc:  # pragma: no cover -- telemetry only
            logger.warning("Prompt2Blog stage usage read failed: %s", exc)
            return None

    def _write_usage_ledger(self, run_id: str) -> None:
        """Persist the whole ledger, so a run that dies still has accounting."""
        if self.usage_tracker is None:
            return
        try:
            ledger = self.usage_tracker.ledger()
        except Exception as exc:  # pragma: no cover -- telemetry only
            logger.warning("Prompt2Blog usage ledger read failed: %s", exc)
            return
        try:
            self.stage_writer(
                run_id,
                USAGE_LEDGER_STAGE,
                {"created_at": self.clock(), "data": ledger},
            )
        except Exception as exc:  # pragma: no cover -- telemetry only
            logger.warning("Prompt2Blog usage ledger write failed: %s", exc)

    def start_stage(self, run_id: str, stage: str) -> None:
        if self.usage_tracker is not None:
            self.usage_tracker.run_id = run_id
        self.active_stages[run_id] = stage
        self._open_attempt(run_id, stage)
        self.status_writer(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": stage,
                "error": None,
                "failure_kind": None,
                "updated_at": self.clock(),
            },
            feature=FEATURE_NAME,
        )

    def start_stage_once(self, run_id: str, stage: str) -> None:
        """Open `stage` unless this recorder already has it open for the run.

        The intake opens a stage *before* its model call, so the call is filed
        under that stage rather than under `unattributed`, and then records the
        row when the call comes back. Recording must not open a second attempt:
        the row would then report an attempt the call was not filed under, and
        say the stage cost nothing.

        `start_stage` keeps its unconditional meaning, because the writing
        graph relies on a repeated stage opening a fresh numbered attempt.
        """
        if self.active_stages.get(run_id) == stage:
            return
        self.start_stage(run_id, stage)

    def record_stage(self, run_id: str, stage: str, data: dict[str, Any]) -> None:
        stage_usage = self._stage_usage(run_id, stage)
        if stage_usage is not None:
            data = {
                **data,
                "stage_usage": stage_usage,
                # Which pass of this stage the row above is. The row itself is
                # overwritten by the next pass; the attempt number is what says
                # so, and the ledger holds the passes it replaced.
                "stage_attempt": self.active_attempts.get(run_id),
            }
        self.stage_writer(
            run_id,
            stage,
            {
                "created_at": self.clock(),
                "data": data,
            },
        )
        self._write_usage_ledger(run_id)

    def discard_stage(self, run_id: str, stage: str) -> None:
        """Drop one stage row once nothing will read it again.

        Best effort by design. The only caller is the resume snapshot, which
        is housekeeping: a run that has already produced its article must not
        fail because the cleanup delete did.
        """
        try:
            self.stage_deleter(run_id, stage)
        except Exception as exc:  # pragma: no cover -- housekeeping only
            logger.warning(
                "Prompt2Blog could not discard stage %s for run %s: %s",
                stage,
                run_id,
                exc,
            )

    def record_artifact(self, run_id: str, artifact: dict[str, Any]) -> None:
        self.artifact_writer(run_id, artifact)

    def complete(self, run_id: str) -> None:
        self.status_writer(
            run_id,
            {
                "run_id": run_id,
                "state": "completed",
                "stage": "complete",
                "error": None,
                "failure_kind": None,
                "updated_at": self.clock(),
            },
            feature=FEATURE_NAME,
        )
        self._write_usage_ledger(run_id)
        self.active_stages.pop(run_id, None)
        self.active_attempts.pop(run_id, None)

    def active_stage(self, run_id: str, fallback: str = "graph_execution") -> str:
        return self.active_stages.get(run_id, fallback)

    def fail(
        self,
        run_id: str,
        stage: str,
        error: Exception,
        *,
        debug_data: dict[str, Any] | None = None,
    ) -> None:
        # Read off the exception rather than passed in, so every caller of
        # `fail` records the kind without having to remember to.
        kind = provider_fault_kind(error)
        self.status_writer(
            run_id,
            {
                "run_id": run_id,
                "state": "failed",
                "stage": stage,
                "error": str(error),
                "failure_kind": kind,
                "updated_at": self.clock(),
            },
            feature=FEATURE_NAME,
        )
        # A stage row as well as the status row. The status row is overwritten
        # by the next run of anything; this one is the durable record of which
        # stage stopped and why, which is what a resume has to read.
        self.stage_writer(
            run_id,
            "pipeline_failure",
            {
                "created_at": self.clock(),
                "data": {
                    "failed_stage": stage,
                    "failure_kind": kind,
                    "error": str(error),
                },
            },
        )
        if debug_data is not None:
            self.record_stage(
                run_id,
                "pipeline_v2",
                {
                    "error": str(error),
                    "failed_stage": stage,
                    **debug_data,
                },
            )
        # A failed run spent real tokens. Writing the ledger here is what keeps
        # a crash from being free in the accounting.
        self._write_usage_ledger(run_id)
        self.active_stages.pop(run_id, None)
        self.active_attempts.pop(run_id, None)
