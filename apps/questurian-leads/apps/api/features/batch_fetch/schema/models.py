from typing import List, Optional
from pydantic import BaseModel


class BatchFetchStepResponse(BaseModel):
    id: int
    job_id: int
    source_type: str
    source_id: Optional[int] = None
    source_name: Optional[str] = None
    status: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    result_json: Optional[str] = None
    error_message: Optional[str] = None
    skip_reason: Optional[str] = None


class BatchFetchJobResponse(BaseModel):
    id: int
    status: str
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    total_steps: int
    completed_steps: int
    success_steps: int
    failed_steps: int
    skipped_steps: int
    message: Optional[str] = None
    error_message: Optional[str] = None
    config_json: Optional[str] = None


class BatchFetchJobDetailResponse(BatchFetchJobResponse):
    steps: List[BatchFetchStepResponse] = []
