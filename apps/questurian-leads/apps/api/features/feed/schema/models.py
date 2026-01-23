from typing import List, Optional

from pydantic import BaseModel


class FeedMeta(BaseModel):
    title: Optional[str] = None
    link: Optional[str] = None
    subtitle: Optional[str] = None
    language: Optional[str] = None
    updated: Optional[str] = None
    published: Optional[str] = None
    author: Optional[str] = None


class FeedEntry(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    link: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    published: Optional[str] = None
    updated: Optional[str] = None
    author: Optional[str] = None
    image_url: Optional[str] = None


class FeedResponse(BaseModel):
    feed: FeedMeta
    entries: List[FeedEntry]
    bozo: bool = False
    bozo_exception: Optional[str] = None
