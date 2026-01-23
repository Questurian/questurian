from typing import Optional
from pydantic import BaseModel


class LeadCreate(BaseModel):
    feed_id: int
    guid: Optional[str] = None
    title: str
    link: str
    country: Optional[str] = None
    author: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    published: Optional[str] = None
    image_url: Optional[str] = None


class LeadUpdate(BaseModel):
    guid: Optional[str] = None
    title: Optional[str] = None
    link: Optional[str] = None
    country: Optional[str] = None
    author: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    published: Optional[str] = None
    image_url: Optional[str] = None


class LeadResponse(BaseModel):
    id: int
    feed_id: int
    guid: Optional[str] = None
    title: str
    link: str
    country: Optional[str] = None
    author: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    published: Optional[str] = None
    collected_at: str
    image_url: Optional[str] = None
    # Translation fields
    title_translated: Optional[str] = None
    summary_translated: Optional[str] = None
    content_translated: Optional[str] = None
    detected_language: Optional[str] = None
    translation_status: Optional[str] = None
    translated_at: Optional[str] = None
    # Approval fields
    approval_status: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    approval_notes: Optional[str] = None
