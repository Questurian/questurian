"""Composite request and source models."""

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field
from PIL import Image
from ..image_processor import ImageVariantType


CompositeLayout = Literal["two-up", "four-up"]
HANGING_EXTERNAL_REF_PREFIX = "composite-"
EXPECTED_VARIANT_COUNT = len(ImageVariantType)


class CompositeSource(BaseModel):
    mediaSetId: int


class CompositeRequest(BaseModel):
    layout: CompositeLayout
    sources: list[CompositeSource] = Field(min_length=2, max_length=4)
    title: str = Field(min_length=1, max_length=160)
    altText: str = Field(min_length=1, max_length=500)
    photographerCredit: str = Field(default='Questurian Composite', max_length=160)
    locationRef: int = Field(default=0, ge=0)


@dataclass
class SourceImage:
    media_set_id: int
    image: Image.Image
    filename: str
    focal_x: float
    focal_y: float
    width: int
    height: int


class HangingCleanupRequest(BaseModel):
    mediaSetIds: list[int] = Field(min_length=1)
