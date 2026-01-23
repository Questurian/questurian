"""
Pydantic models for Diario Correo feeds API.
"""

from typing import Optional
from pydantic import BaseModel


class DiarioCorreoFeedCreate(BaseModel):
    """Schema for creating a new Diario Correo feed."""
    category_id: int
    url: str = "https://diariocorreo.pe/gastronomia/"
    display_name: str = "Diario Correo Gastronomia"
    section: str = "gastronomia"
    fetch_interval: int = 60
    is_active: int = 1


class DiarioCorreoFeedUpdate(BaseModel):
    """Schema for updating a Diario Correo feed."""
    category_id: Optional[int] = None
    url: Optional[str] = None
    display_name: Optional[str] = None
    section: Optional[str] = None
    fetch_interval: Optional[int] = None
    is_active: Optional[int] = None


class DiarioCorreoFeedResponse(BaseModel):
    """Schema for Diario Correo feed response."""
    id: int
    category_id: int
    url: str
    display_name: str
    section: str
    fetch_interval: int
    last_fetched: Optional[str] = None
    is_active: int
    created_at: str


class DiarioCorreoPostResponse(BaseModel):
    """Schema for Diario Correo post response."""
    id: int
    diario_correo_feed_id: int
    url: str
    title: str
    published_at: Optional[str] = None
    section: str
    country: Optional[str] = None
    image_url: Optional[str] = None
    excerpt: Optional[str] = None
    language: str
    source: str
    collected_at: str
    # Translation fields
    title_translated: Optional[str] = None
    excerpt_translated: Optional[str] = None
    detected_language: Optional[str] = None
    translation_status: Optional[str] = None
    translated_at: Optional[str] = None
    # Approval fields
    approval_status: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    approval_notes: Optional[str] = None
