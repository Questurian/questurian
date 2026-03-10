from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from features.scrape_jobs.schema import ScrapeJobResponse
from features.scrape_jobs.service import get_current_job, get_job, list_jobs


router = APIRouter(prefix="/scrape-jobs", tags=["scrape-jobs"])


@router.get("", response_model=List[ScrapeJobResponse])
def get_scrape_jobs(
    source_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: Optional[int] = Query(20, ge=1, le=200),
    offset: Optional[int] = Query(0, ge=0),
) -> List[ScrapeJobResponse]:
    jobs = list_jobs(
        source_type=source_type,
        status=status,
        limit=limit or 20,
        offset=offset or 0,
    )
    return [ScrapeJobResponse(**job) for job in jobs]


@router.get("/current", response_model=Optional[ScrapeJobResponse])
def get_current_scrape_job(source_type: Optional[str] = Query(None)) -> Optional[ScrapeJobResponse]:
    job = get_current_job(source_type=source_type)
    if not job:
        return None
    return ScrapeJobResponse(**job)


@router.get("/{job_id}", response_model=ScrapeJobResponse)
def get_scrape_job(job_id: int) -> ScrapeJobResponse:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scrape job not found")
    return ScrapeJobResponse(**job)
