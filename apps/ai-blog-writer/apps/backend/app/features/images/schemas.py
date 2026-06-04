"""Request schemas for image API routes."""

from typing import List

from pydantic import BaseModel, Field


class GenerateSocialImageRequest(BaseModel):
    featuredAssetId: int = Field(
        ...,
        description="Featured media-asset id selected in Step 2",
    )


class ResolveTagsRequest(BaseModel):
    names: List[str] = Field(..., description="Tag names to find or create")
