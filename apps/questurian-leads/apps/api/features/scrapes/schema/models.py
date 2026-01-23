"""
Pydantic models for unified scrapes API.
"""

from typing import Optional
from pydantic import BaseModel


class ScrapeItem(BaseModel):
    content_type: str
    content_id: int
    title: Optional[str] = None
    summary: Optional[str] = None
    source_name: str
    collected_at: str
    country: Optional[str] = None
    image_url: Optional[str] = None
    link: Optional[str] = None
    detected_language: Optional[str] = None
    translation_status: Optional[str] = None
    approval_status: Optional[str] = None


class ScrapeResponse(BaseModel):
    total_count: int
    items: list[ScrapeItem]
