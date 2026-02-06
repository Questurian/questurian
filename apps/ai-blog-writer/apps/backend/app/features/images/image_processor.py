"""Image processing using Pillow - creates 5 variants from source image."""

import io
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Tuple

from PIL import Image


class ImageVariantType(str, Enum):
    """The 5 image variant types matching Payload CMS media-assets."""
    THUMBNAIL = "thumbnail"
    SQUARE = "square"
    WIDE = "wide"
    PORTRAIT = "portrait"
    HERO = "hero"


@dataclass
class VariantSpec:
    """Specification for an image variant."""
    width: int
    height: int


# Variant specifications matching the Location Manager implementation
VARIANT_SPECS: Dict[ImageVariantType, VariantSpec] = {
    ImageVariantType.THUMBNAIL: VariantSpec(width=150, height=150),
    ImageVariantType.SQUARE: VariantSpec(width=600, height=600),
    ImageVariantType.WIDE: VariantSpec(width=1200, height=675),
    ImageVariantType.PORTRAIT: VariantSpec(width=600, height=800),
    ImageVariantType.HERO: VariantSpec(width=1920, height=1080),
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
    Process an image into 5 variants optimized for WebP format.
    
    Args:
        source_buffer: The original image bytes
        original_filename: Original filename (used for generating variant names)
        alt_text: Alt text for accessibility
        quality: WebP quality (0-100), default 85
        
    Returns:
        Dictionary mapping variant types to processed variants
    """
    # Load source image
    source_image = Image.open(io.BytesIO(source_buffer))
    
    # Convert to RGB if necessary (handles RGBA, P mode, etc.)
    if source_image.mode in ('RGBA', 'P'):
        # Create white background for transparency
        background = Image.new('RGB', source_image.size, (255, 255, 255))
        if source_image.mode == 'P':
            source_image = source_image.convert('RGBA')
        background.paste(source_image, mask=source_image.split()[-1] if source_image.mode == 'RGBA' else None)
        source_image = background
    elif source_image.mode != 'RGB':
        source_image = source_image.convert('RGB')
    
    # Generate base name from original filename
    base_name = original_filename.rsplit('.', 1)[0] if '.' in original_filename else original_filename
    
    variants: Dict[ImageVariantType, ProcessedVariant] = {}
    
    for variant_type, spec in VARIANT_SPECS.items():
        # Resize image maintaining aspect ratio, then crop to exact dimensions
        resized = _resize_and_crop(source_image, spec.width, spec.height)
        
        # Save as WebP
        output_buffer = io.BytesIO()
        resized.save(output_buffer, format='WEBP', quality=quality, method=6)
        webp_buffer = output_buffer.getvalue()
        
        # Generate filename
        filename = f"{base_name}_{variant_type.value}.webp"
        
        variants[variant_type] = ProcessedVariant(
            variant_type=variant_type,
            buffer=webp_buffer,
            filename=filename,
            width=spec.width,
            height=spec.height,
            content_type='image/webp',
            file_size=len(webp_buffer)
        )
    
    return variants


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
