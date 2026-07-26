"""Request models exposed by the YouTube2Blog API."""

from pydantic import BaseModel, Field


class YouTubeUrlRequest(BaseModel):
    url: str = Field(..., min_length=1)
    model: str | None = Field(default=None)
    forced_article_type: str | None = Field(default=None)
    tone_id: str | None = Field(default=None)
    writing_model: str | None = Field(default=None)


class ListicleDetectRequest(BaseModel):
    article: str = Field(..., min_length=1)
    title: str = Field(default="")
    model: str | None = Field(default=None)


class DeepExpandRequest(BaseModel):
    article: str = Field(..., min_length=1)
    article_type: str = Field(default="")
    title: str = Field(default="")
    model: str | None = Field(default=None)
    rewrite_items: list[str] | None = Field(default=None)
