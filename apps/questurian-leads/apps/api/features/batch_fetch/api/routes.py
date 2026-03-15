from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

from features.batch_fetch.schema import (
    BatchFetchJobDetailResponse,
    BatchFetchJobResponse,
)
from features.batch_fetch.service.runner import (
    ActiveBatchFetchJobError,
    get_current_job_detail,
    get_job_detail,
    list_jobs,
    start_new_batch_fetch_job,
)

router = APIRouter(prefix="/batch-fetch", tags=["batch-fetch"])


@router.post("", response_model=BatchFetchJobDetailResponse)
def start_batch_fetch(
    force: bool = Query(
        False,
        description="Ignore the 24-hour skip window (still skips inactive feeds).",
    ),
) -> BatchFetchJobDetailResponse:
    """Start a batch fetch job across all active sources."""
    try:
        job = start_new_batch_fetch_job(force=force)
    except ActiveBatchFetchJobError as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc
    return BatchFetchJobDetailResponse(**job)


@router.get("", response_model=List[BatchFetchJobResponse])
def get_jobs(
    limit: Optional[int] = Query(20, ge=1, le=200),
    offset: Optional[int] = Query(0, ge=0),
) -> List[BatchFetchJobResponse]:
    """List batch fetch jobs."""
    jobs = list_jobs(limit=limit or 20, offset=offset or 0)
    return [BatchFetchJobResponse(**job) for job in jobs]


@router.get("/current", response_model=Optional[BatchFetchJobDetailResponse])
def get_current_job() -> Optional[BatchFetchJobDetailResponse]:
    """Get the current running job, or the latest completed job."""
    job = get_current_job_detail()
    if not job:
        return None
    return BatchFetchJobDetailResponse(**job)


@router.get("/{job_id}", response_model=BatchFetchJobDetailResponse)
def get_job(job_id: int) -> BatchFetchJobDetailResponse:
    """Get a batch fetch job by ID."""
    job = get_job_detail(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Batch fetch job not found")
    return BatchFetchJobDetailResponse(**job)
