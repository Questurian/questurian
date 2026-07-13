"""Request schemas for image API routes."""

from typing import List, Optional

from pydantic import BaseModel, Field


class GenerateSocialImageRequest(BaseModel):
    featuredAssetId: Optional[int] = Field(
        None,
        description="Featured media-asset id selected in Step 2",
    )
    featuredMediaSetId: Optional[int] = Field(
        None,
        description="Featured media-set id selected in Step 2",
    )


class ResolveTagsRequest(BaseModel):
    names: List[str] = Field(..., description="Tag names to find or create")
