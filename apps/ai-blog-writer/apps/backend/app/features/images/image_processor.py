"""Image processing using Pillow - creates image variants from source image."""

import io
from dataclasses import dataclass
from enum import Enum
from typing import Dict

from PIL import Image


class ImageVariantType(str, Enum):
    """Image variant types matching Payload CMS media-assets."""
    THUMBNAIL = "thumbnail"
    SQUARE = "square"
    WIDE = "wide"
    PORTRAIT = "portrait"
    HERO = "hero"
    OPEN_GRAPH = "open_graph"
    EDITORIAL = "editorial"


@dataclass
class VariantSpec:
    """Specification for an image variant."""
    width: int
    height: int


# Variant specifications matching the Location Manager implementation
VARIANT_SPECS: Dict[ImageVariantType, VariantSpec] = {
    ImageVariantType.THUMBNAIL: VariantSpec(width=1200, height=800),   # 3:2
    ImageVariantType.SQUARE: VariantSpec(width=1080, height=1080),    # 1:1
    ImageVariantType.WIDE: VariantSpec(width=1920, height=1080),      # 16:9
    ImageVariantType.PORTRAIT: VariantSpec(width=1200, height=1500),  # 4:5
    ImageVariantType.HERO: VariantSpec(width=2100, height=900),       # 21:9
    ImageVariantType.OPEN_GRAPH: VariantSpec(width=1200, height=630),  # 1.91:1
    ImageVariantType.EDITORIAL: VariantSpec(width=1600, height=1200),  # 4:3
}


@dataclass
class ProcessedVariant:
    """A processed image variant ready for upload."""
    variant_type: ImageVariantType
    buffer: bytes
    filename: str
    width: int
    height: int
    content_type: str
    file_size: int


def process_image_variants(
    source_buffer: bytes,
    original_filename: str,
    alt_text: str,
    quality: int = 85
) -> Dict[ImageVariantType, ProcessedVariant]:
    """
    Process an image into variants optimized for WebP format.

    Args:
        source_buffer: The original image bytes
        original_filename: Original filename (used for generating variant names)
        alt_text: Alt text for accessibility
        quality: WebP quality (0-100), default 85

    Returns:
        Dictionary mapping variant types to processed variants
    """
    source_image = _normalize_source_image(source_buffer)

    variants: Dict[ImageVariantType, ProcessedVariant] = {}

    for variant_type in VARIANT_SPECS:
        variants[variant_type] = _render_variant(
            source_image=source_image,
            original_filename=original_filename,
            variant_type=variant_type,
            quality=quality,
        )

    return variants


def process_single_variant(
    source_buffer: bytes,
    original_filename: str,
    variant_type: ImageVariantType,
    quality: int = 85,
) -> ProcessedVariant:
    """Process one image variant from source bytes."""
    source_image = _normalize_source_image(source_buffer)
    return _render_variant(
        source_image=source_image,
        original_filename=original_filename,
        variant_type=variant_type,
        quality=quality,
    )


def _normalize_source_image(source_buffer: bytes) -> Image.Image:
    source_image = Image.open(io.BytesIO(source_buffer))

    if source_image.mode in ('RGBA', 'P'):
        background = Image.new('RGB', source_image.size, (255, 255, 255))
        if source_image.mode == 'P':
            source_image = source_image.convert('RGBA')
        background.paste(
            source_image,
            mask=source_image.split()[-1] if source_image.mode == 'RGBA' else None,
        )
        return background

    if source_image.mode != 'RGB':
        return source_image.convert('RGB')

    return source_image


def _build_variant_filename(original_filename: str, variant_type: ImageVariantType) -> str:
    base_name = (
        original_filename.rsplit('.', 1)[0]
        if '.' in original_filename
        else original_filename
    )
    return f"{base_name}_{variant_type.value}.webp"


def _render_variant(
    source_image: Image.Image,
    original_filename: str,
    variant_type: ImageVariantType,
    quality: int,
) -> ProcessedVariant:
    spec = VARIANT_SPECS[variant_type]

    resized = _resize_and_crop(source_image, spec.width, spec.height)
    output_buffer = io.BytesIO()
    resized.save(output_buffer, format='WEBP', quality=quality, method=6)
    webp_buffer = output_buffer.getvalue()

    filename = _build_variant_filename(original_filename, variant_type)

    return ProcessedVariant(
        variant_type=variant_type,
        buffer=webp_buffer,
        filename=filename,
        width=spec.width,
        height=spec.height,
        content_type='image/webp',
        file_size=len(webp_buffer),
    )


def _resize_and_crop(image: Image.Image, target_width: int, target_height: int) -> Image.Image:
    """
    Resize image to fill target dimensions while maintaining aspect ratio,
    then center crop to exact dimensions.
    """
    # Calculate scaling factors
    source_ratio = image.width / image.height
    target_ratio = target_width / target_height

    if source_ratio > target_ratio:
        # Source is wider relative to target - scale by height
        new_height = target_height
        new_width = int(new_height * source_ratio)
    else:
        # Source is taller relative to target - scale by width
        new_width = target_width
        new_height = int(new_width / source_ratio)

    # Resize using high-quality Lanczos resampling
    resized = image.resize((new_width, new_height), Image.LANCZOS)

    # Calculate crop box to center the image
    left = (new_width - target_width) // 2
    top = (new_height - target_height) // 2
    right = left + target_width
    bottom = top + target_height

    # Crop to exact dimensions
    cropped = resized.crop((left, top, right, bottom))

    return cropped
