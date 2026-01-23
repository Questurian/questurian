from typing import Optional, List
from pydantic import BaseModel


class FeedCreate(BaseModel):
    category_id: int
    url: str
    source_name: str
    website: Optional[str] = None
    country: str
    fetch_interval: int = 30
    is_active: int = 1


class FeedUpdate(BaseModel):
    category_id: Optional[int] = None
    url: Optional[str] = None
    source_name: Optional[str] = None
    website: Optional[str] = None
    country: Optional[str] = None
    fetch_interval: Optional[int] = None
    is_active: Optional[int] = None
    last_fetched: Optional[str] = None


class FeedResponse(BaseModel):
    id: int
    category_id: int
    url: str
    source_name: str
    website: Optional[str] = None
    country: Optional[str] = None
    fetch_interval: int
    last_fetched: Optional[str] = None
    is_active: int
    created_at: str
    tags: Optional[List[str]] = []
