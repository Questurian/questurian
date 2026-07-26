"""Pure composite crop and rendering algorithms."""

import io

from PIL import Image

from ..image_processor import ImageVariantType, ProcessedVariant, VARIANT_SPECS
from .models import CompositeLayout, SourceImage


def _tile_boxes(
    layout: CompositeLayout, width: int, height: int
) -> list[tuple[int, int, int, int]]:
    if layout == 'two-up':
        left_width = width // 2
        return [(0, 0, left_width, height), (left_width, 0, width, height)]
    left_width = width // 2
    top_height = height // 2
    return [
        (0, 0, left_width, top_height),
        (left_width, 0, width, top_height),
        (0, top_height, left_width, height),
        (left_width, top_height, width, height),
    ]


def _crop_to_fill(
    source: SourceImage, target_width: int, target_height: int
) -> Image.Image:
    source_ratio = source.image.width / source.image.height
    target_ratio = target_width / target_height
    if source_ratio > target_ratio:
        crop_height = source.image.height
        crop_width = int(crop_height * target_ratio)
    else:
        crop_width = source.image.width
        crop_height = int(crop_width / target_ratio)
    focal_x = source.focal_x * source.image.width
    focal_y = source.focal_y * source.image.height
    left = round(focal_x - crop_width / 2)
    top = round(focal_y - crop_height / 2)
    left = max(0, min(left, source.image.width - crop_width))
    top = max(0, min(top, source.image.height - crop_height))
    cropped = source.image.crop((left, top, left + crop_width, top + crop_height))
    return cropped.resize((target_width, target_height), Image.LANCZOS)


def _render_composite_variant(
    *,
    layout: CompositeLayout,
    sources: list[SourceImage],
    variant_type: ImageVariantType,
    original_filename: str,
    quality: int = 85,
) -> ProcessedVariant:
    spec = VARIANT_SPECS[variant_type]
    canvas = Image.new('RGB', (spec.width, spec.height), (255, 255, 255))
    boxes = _tile_boxes(layout, spec.width, spec.height)
    for source, box in zip(sources, boxes):
        left, top, right, bottom = box
        tile = _crop_to_fill(source, right - left, bottom - top)
        canvas.paste(tile, (left, top))
    output = io.BytesIO()
    canvas.save(output, format='WEBP', quality=quality, method=6)
    buffer = output.getvalue()
    stem = original_filename.rsplit('.', 1)[0]
    filename = f'{stem}_{variant_type.value}.webp'
    return ProcessedVariant(
        variant_type=variant_type,
        buffer=buffer,
        filename=filename,
        width=spec.width,
        height=spec.height,
        content_type='image/webp',
        file_size=len(buffer),
    )


def _render_variants(
    *, layout: CompositeLayout, sources: list[SourceImage], original_filename: str
) -> dict[ImageVariantType, ProcessedVariant]:
    return {
        variant_type: _render_composite_variant(
            layout=layout,
            sources=sources,
            variant_type=variant_type,
            original_filename=original_filename,
        )
        for variant_type in ImageVariantType
    }


def _safe_stem(title: str) -> str:
    stem = ''.join((ch.lower() if ch.isalnum() else '-' for ch in title.strip()))
    while '--' in stem:
        stem = stem.replace('--', '-')
    return stem.strip('-')[:80] or 'composite-image'
