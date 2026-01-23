from typing import Optional
from pydantic import BaseModel


class FetchLogResponse(BaseModel):
    id: int
    feed_id: int
    fetched_at: str
    status: Optional[str] = None
    lead_count: Optional[int] = None
    error_message: Optional[str] = None
