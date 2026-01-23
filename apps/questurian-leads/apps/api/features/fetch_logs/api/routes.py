from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

from features.fetch_logs.schema import FetchLogResponse
from lib.database import fetch_all, fetch_one, execute_query

router = APIRouter(prefix="/logs", tags=["fetch_logs"])


@router.get("", response_model=List[FetchLogResponse])
def get_logs(
    feed_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None, regex="^(SUCCESS|FAILED)$"),
    limit: Optional[int] = Query(100, ge=1, le=1000),
    offset: Optional[int] = Query(0, ge=0),
    sort: Optional[str] = Query("fetched_at", regex="^fetched_at$")
) -> List[FetchLogResponse]:
    """Get fetch logs with optional filters."""
    query = "SELECT * FROM fetch_logs WHERE 1=1"
    params = []

    if feed_id is not None:
        query += " AND feed_id = ?"
        params.append(feed_id)

    if status is not None:
        query += " AND status = ?"
        params.append(status)

    query += f" ORDER BY {sort} DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    results = fetch_all(query, tuple(params))
    return [FetchLogResponse(**row) for row in results]


@router.get("/feed/{feed_id}", response_model=List[FetchLogResponse])
def get_logs_by_feed(
    feed_id: int,
    limit: Optional[int] = Query(100, ge=1, le=1000),
    offset: Optional[int] = Query(0, ge=0)
) -> List[FetchLogResponse]:
    """Get all fetch logs for a specific feed."""
    feed = fetch_one("SELECT * FROM feeds WHERE id = ?", (feed_id,))
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    logs = fetch_all(
        "SELECT * FROM fetch_logs WHERE feed_id = ? ORDER BY fetched_at DESC LIMIT ? OFFSET ?",
        (feed_id, limit, offset)
    )
    return [FetchLogResponse(**log) for log in logs]


@router.get("/{log_id}", response_model=FetchLogResponse)
def get_log(log_id: int) -> FetchLogResponse:
    """Get a fetch log by ID."""
    result = fetch_one("SELECT * FROM fetch_logs WHERE id = ?", (log_id,))
    if not result:
        raise HTTPException(status_code=404, detail="Fetch log not found")
    return FetchLogResponse(**result)


@router.delete("/{log_id}", status_code=204)
def delete_log(log_id: int):
    """Delete a fetch log (admin cleanup)."""
    existing = fetch_one("SELECT * FROM fetch_logs WHERE id = ?", (log_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Fetch log not found")

    execute_query("DELETE FROM fetch_logs WHERE id = ?", (log_id,))
