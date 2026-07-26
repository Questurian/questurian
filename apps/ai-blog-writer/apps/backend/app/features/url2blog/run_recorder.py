"""Run lifecycle persistence for URL2Blog."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.core import (
    read_status,
    write_artifact,
    write_stage_result,
    write_status,
)

from .config import FEATURE_NAME

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    """Return the existing naive-UTC storage shape without using utcnow()."""
    return datetime.now(UTC).replace(tzinfo=None).isoformat()


@dataclass(frozen=True)
class RunRecorder:
    """The only URL2Blog adapter allowed to mutate Run lifecycle storage."""

    status_writer: Callable[..., None] = write_status
    stage_writer: Callable[[str, str, dict[str, Any]], None] = write_stage_result
    artifact_writer: Callable[[str, dict[str, Any]], Any] = write_artifact
    status_reader: Callable[[str], dict[str, Any] | None] = read_status
    clock: Callable[[], str] = _now_iso

    def mark_running(self, run_id: str, stage: str) -> None:
        self.status_writer(
            run_id,
            {
                "run_id": run_id,
                "state": "running",
                "stage": stage,
                "error": None,
                "updated_at": self.clock(),
            },
            feature=FEATURE_NAME,
        )

    def record_stage(self, run_id: str, stage: str, data: dict[str, Any]) -> None:
        self.stage_writer(
            run_id,
            stage,
            {
                "created_at": self.clock(),
                "data": data,
            },
        )

    def record_artifact(self, run_id: str, artifact: dict[str, Any]) -> None:
        self.artifact_writer(run_id, artifact)

    def mark_completed(self, run_id: str) -> None:
        self.status_writer(
            run_id,
            {
                "run_id": run_id,
                "state": "completed",
                "stage": "complete",
                "error": None,
                "updated_at": self.clock(),
            },
            feature=FEATURE_NAME,
        )

    def mark_failed(self, run_id: str, error: Exception) -> None:
        stage = "pipeline_v2"
        try:
            current_status = self.status_reader(run_id)
            current_stage = (
                current_status.get("stage")
                if isinstance(current_status, dict)
                else None
            )
            if isinstance(current_stage, str) and current_stage.strip():
                stage = current_stage.strip()
        except Exception:  # noqa: BLE001
            logger.exception("Failed reading URL2Blog status before marking failure")

        error_text = str(error).strip() or error.__class__.__name__
        if len(error_text) > 1500:
            error_text = f"{error_text[:1497]}..."
        try:
            self.status_writer(
                run_id,
                {
                    "run_id": run_id,
                    "state": "failed",
                    "stage": stage,
                    "error": error_text,
                    "updated_at": self.clock(),
                },
                feature=FEATURE_NAME,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed marking URL2Blog run as failed")
