from typing import Optional, Literal, Union, List
from pydantic import BaseModel


class TranslationRequest(BaseModel):
    """Request to translate content for a specific data source."""
    content_type: Literal["leads", "instagram_posts", "reddit_posts"]
    feed_id: Optional[int] = None
    limit: Optional[int] = None


class TranslationStats(BaseModel):
    """Statistics from a translation operation."""
    total: int
    translated: int
    already_english: int
    errors: int
    skipped: int


class TranslationResponse(BaseModel):
    """Response from translation operation."""
    content_type: str
    stats: TranslationStats
    message: str


class OverallStats(BaseModel):
    """Overall translation statistics across all content types."""
    leads: dict
    instagram_posts: dict
    reddit_posts: dict


class TranslateReviewsItem(BaseModel):
    """Single review item for translation."""
    id: Optional[Union[str, int]] = None
    review_text: Optional[str] = None
    title: Optional[str] = None


class TranslateReviewsRequest(BaseModel):
    """Request to translate a batch of reviews."""
    reviews: List[TranslateReviewsItem]
    fields_to_translate: List[Literal["review_text", "title"]]
    source_language: Optional[str] = "auto"


class TranslateReviewsResponse(BaseModel):
    """Response from review translation."""
    reviews: List[TranslateReviewsItem]
    stats: TranslationStats
    message: str
