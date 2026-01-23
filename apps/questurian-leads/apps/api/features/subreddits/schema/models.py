from typing import Optional
from pydantic import BaseModel, Field


class SubredditBase(BaseModel):
    category_id: int
    subreddit: str = Field(..., description="Subreddit name without /r/")
    display_name: str
    description: Optional[str] = None


class SubredditCreate(SubredditBase):
    pass


class SubredditUpdate(BaseModel):
    category_id: Optional[int] = None
    subreddit: Optional[str] = None
    display_name: Optional[str] = None
    description: Optional[str] = None


class SubredditResponse(SubredditBase):
    id: int
    created_at: str
