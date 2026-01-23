from typing import Optional, Literal
from pydantic import BaseModel

ContentType = Literal[
    'lead',
    'instagram_post',
    'reddit_post',
    'el_comercio_post',
    'diario_correo_post',
]

class ApprovalRequest(BaseModel):
    content_type: ContentType
    content_id: int
    status: Literal['approved', 'rejected']
    approved_by: str  # Username or user ID
    approval_notes: Optional[str] = None

class BatchApprovalRequest(BaseModel):
    items: list[ApprovalRequest]

class PendingContentItem(BaseModel):
    content_type: ContentType
    content_id: int
    title: Optional[str] = None  # Main text/title
    summary: Optional[str] = None  # Summary or caption
    source_name: str  # Feed name, username, subreddit, etc.
    collected_at: str
    image_url: Optional[str] = None
    link: Optional[str] = None
    detected_language: Optional[str] = None
    translation_status: Optional[str] = None

class PendingContentResponse(BaseModel):
    total_count: int
    items: list[PendingContentItem]
