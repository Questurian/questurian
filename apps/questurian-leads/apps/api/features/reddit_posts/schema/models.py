from typing import Optional
from pydantic import BaseModel


class RedditPostResponse(BaseModel):
    id: int
    reddit_feed_id: int
    post_id: str
    subreddit: str
    title: str
    author: Optional[str] = None
    score: int
    num_comments: int
    permalink: Optional[str] = None
    url: Optional[str] = None
    selftext: Optional[str] = None
    created_utc: Optional[int] = None
    post_type: Optional[str] = None
    collected_at: str
    # Translation fields
    title_translated: Optional[str] = None
    selftext_translated: Optional[str] = None
    detected_language: Optional[str] = None
    translation_status: Optional[str] = None
    translated_at: Optional[str] = None
    # Approval fields
    approval_status: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    approval_notes: Optional[str] = None
