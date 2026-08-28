"""
Core storage utilities for pipeline runs, stages, and outputs.

These are shared across all features (youtube2blog, prompt2blog, etc.)
"""

import json
from typing import Any, Dict, List, Optional

from .database import get_db_connection


def write_status(
    run_id: str,
    payload: Dict[str, Any],
    feature: str = "youtube2blog",
    owner_staff_id: Optional[str] = None,
) -> None:
    """Write or update run status."""
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO runs (
                run_id, feature, status, stage, error, failure_kind,
                owner_staff_id, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                status = excluded.status,
                stage = excluded.stage,
                error = excluded.error,
                failure_kind = excluded.failure_kind,
                updated_at = excluded.updated_at
        """,
            (
                run_id,
                feature,
                payload.get("state", "pending"),
                payload.get("stage", "stage_0"),
                payload.get("error"),
                # Written on every status update, not only on failure, so a
                # stage that starts cleanly clears a kind left by an earlier
                # attempt rather than leaving it to be read as current.
                payload.get("failure_kind"),
                owner_staff_id,
                payload.get("updated_at", ""),
                payload.get("updated_at", ""),
            ),
        )


def read_status(run_id: str) -> Optional[Dict[str, Any]]:
    """Read run status."""
    with get_db_connection() as conn:
        row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        if not row:
            return None
        return {
            "run_id": row["run_id"],
            "feature": row["feature"],
            "state": row["status"],
            "stage": row["stage"],
            "error": row["error"],
            "failure_kind": row["failure_kind"],
            "updated_at": row["updated_at"],
        }


def read_run_owner(run_id: str) -> Optional[str]:
    """Read staff owner ID without exposing it in status responses."""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT owner_staff_id FROM runs WHERE run_id = ?", (run_id,)
        ).fetchone()
        if not row:
            return None
        owner_staff_id = row["owner_staff_id"]
        return str(owner_staff_id) if owner_staff_id is not None else None


def write_stage_result(run_id: str, stage: str, payload: Dict[str, Any]) -> None:
    """Write stage result."""
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO stages (run_id, stage, data, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(run_id, stage) DO UPDATE SET
                data = excluded.data,
                created_at = excluded.created_at
        """,
            (
                run_id,
                stage,
                json.dumps(payload, default=str),
                payload.get("created_at", ""),
            ),
        )


def read_stage_result(run_id: str, stage: str) -> Optional[Dict[str, Any]]:
    """Read stage result."""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT data FROM stages WHERE run_id = ? AND stage = ?", (run_id, stage)
        ).fetchone()
        if not row:
            return None
        return json.loads(row["data"])


def delete_stage_result(run_id: str, stage: str) -> None:
    """Drop one stage row, leaving the rest of the run intact.

    Written for the resume snapshot, which is the one stage row that must not
    outlive the run it describes: it holds a whole graph state, and a finished
    run has an artifact instead.
    """
    with get_db_connection() as conn:
        conn.execute(
            "DELETE FROM stages WHERE run_id = ? AND stage = ?", (run_id, stage)
        )


def read_all_stage_results(run_id: str) -> Dict[str, Any]:
    """Read every stored stage result for a run, keyed by stage name."""
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT stage, data FROM stages WHERE run_id = ? ORDER BY created_at",
            (run_id,),
        ).fetchall()
        return {row["stage"]: json.loads(row["data"]) for row in rows}


def write_artifact(run_id: str, payload: Dict[str, Any]) -> str:
    """Write final artifact with markdown."""
    markdown = payload.pop("markdown", "")

    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO outputs (run_id, markdown, artifact, created_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(run_id) DO UPDATE SET
                markdown = excluded.markdown,
                artifact = excluded.artifact,
                created_at = excluded.created_at
        """,
            (
                run_id,
                markdown,
                json.dumps(payload, default=str),
            ),
        )
    return f"db:outputs:{run_id}"


def read_output(run_id: str) -> Optional[Dict[str, Any]]:
    """Read final output (markdown + artifact)."""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT markdown, artifact FROM outputs WHERE run_id = ?", (run_id,)
        ).fetchone()
        if not row:
            return None
        return {
            "markdown": row["markdown"],
            "artifact": json.loads(row["artifact"]),
        }


def fail_stale_runs(
    reason: str = "Server restarted while run was in progress",
) -> int:
    """
    Mark all non-terminal runs as failed.

    Pipelines execute as in-process background tasks, so any run still
    marked in-flight when the server boots was orphaned by a restart or
    crash and will never progress. Without this sweep the frontend polls
    those runs forever.

    Returns:
        Count of runs marked as failed.
    """
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE runs
            SET status = 'failed',
                error = ?,
                updated_at = datetime('now')
            WHERE status NOT IN ('completed', 'failed')
            """,
            (reason,),
        )
        return cursor.rowcount


def cleanup_run(run_id: str) -> None:
    """Delete all data for a specific run."""
    with get_db_connection() as conn:
        conn.execute("DELETE FROM outputs WHERE run_id = ?", (run_id,))
        conn.execute("DELETE FROM stages WHERE run_id = ?", (run_id,))
        conn.execute("DELETE FROM runs WHERE run_id = ?", (run_id,))


def clear_all_runs(feature: Optional[str] = None) -> int:
    """
    Delete runs from the database.

    Args:
        feature: If provided, only clear runs for this feature.
                If None, clear ALL runs.

    Returns:
        Count of deleted runs.
    """
    with get_db_connection() as conn:
        if feature:
            count = conn.execute(
                "SELECT COUNT(*) FROM runs WHERE feature = ?", (feature,)
            ).fetchone()[0]
            # Get run_ids to delete related data
            run_ids = [
                row[0]
                for row in conn.execute(
                    "SELECT run_id FROM runs WHERE feature = ?", (feature,)
                ).fetchall()
            ]
            for run_id in run_ids:
                conn.execute("DELETE FROM outputs WHERE run_id = ?", (run_id,))
                conn.execute("DELETE FROM stages WHERE run_id = ?", (run_id,))
            conn.execute("DELETE FROM runs WHERE feature = ?", (feature,))
        else:
            count = conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
            conn.execute("DELETE FROM outputs")
            conn.execute("DELETE FROM stages")
            conn.execute("DELETE FROM runs")
        return count


def get_all_runs(feature: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get all runs, optionally filtered by feature."""
    with get_db_connection() as conn:
        if feature:
            rows = conn.execute(
                "SELECT run_id, feature, status, stage, updated_at FROM runs WHERE feature = ? ORDER BY updated_at DESC",
                (feature,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT run_id, feature, status, stage, updated_at FROM runs ORDER BY updated_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]


def get_completed_runs_with_output(
    feature: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get all completed runs with their outputs."""
    with get_db_connection() as conn:
        if feature:
            rows = conn.execute(
                """
                SELECT
                    r.run_id,
                    r.feature,
                    r.status,
                    r.created_at,
                    r.updated_at,
                    o.markdown,
                    o.artifact
                FROM runs r
                INNER JOIN outputs o ON r.run_id = o.run_id
                WHERE r.status = 'completed' AND r.feature = ?
                ORDER BY r.updated_at DESC
            """,
                (feature,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT
                    r.run_id,
                    r.feature,
                    r.status,
                    r.created_at,
                    r.updated_at,
                    o.markdown,
                    o.artifact
                FROM runs r
                INNER JOIN outputs o ON r.run_id = o.run_id
                WHERE r.status = 'completed'
                ORDER BY r.updated_at DESC
            """
            ).fetchall()

        return [
            {
                "run_id": row["run_id"],
                "feature": row["feature"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "markdown": row["markdown"],
                "artifact": json.loads(row["artifact"]) if row["artifact"] else {},
            }
            for row in rows
        ]
