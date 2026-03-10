from typing import Optional
from pydantic import BaseModel


class ScrapeJobResponse(BaseModel):
    id: int
    source_type: str
    feed_id: int
    source_name: str
    redis_job_id: Optional[str] = None
    status: str
    message: Optional[str] = None
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    result_json: Optional[str] = None
    error_message: Optional[str] = None
    artifact_dir: Optional[str] = None
