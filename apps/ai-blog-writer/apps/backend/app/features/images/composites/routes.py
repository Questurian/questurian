"""Composite image routes."""

import asyncio
import io
import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from PIL import Image

from ..image_processor import ImageVariantType, ProcessedVariant, VARIANT_SPECS
from ..payload_client import PayloadClient, PayloadUploadError
from ..shared import (
    _download_media_asset_file,
    _extract_bearer_token,
    _raise_http_error,
    _status_from_payload_error,
    _validate_location_ref,
    _validate_photographer_credit,
    logger,
)

router = APIRouter(prefix="/composites")

CompositeLayout = Literal["two-up", "four-up"]


class CompositeSource(BaseModel):
    mediaSetId: int


class CompositeRequest(BaseModel):
    layout: CompositeLayout
    sources: list[CompositeSource] = Field(min_length=2, max_length=4)
    title: str = Field(min_length=1, max_length=160)
    altText: str = Field(min_length=1, max_length=500)
    photographerCredit: str = Field(default="Questurian Composite", max_length=160)
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


def _extract_asset_id(value: Any) -> Optional[int]:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    if isinstance(value, dict):
        raw = value.get("id")
        if isinstance(raw, int):
            return raw
        if isinstance(raw, str) and raw.isdigit():
            return int(raw)
    return None


def _asset_filename(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        filename = value.get("filename")
        if isinstance(filename, str) and filename.strip():
            return filename.strip()
    return None


def _media_set_focal(media_set: dict[str, Any]) -> tuple[float, float]:
    focal = media_set.get("focal_point")
    if not isinstance(focal, dict):
        return 0.5, 0.5
    x = focal.get("x")
    y = focal.get("y")
    return (
        min(1.0, max(0.0, x if isinstance(x, (int, float)) else 0.5)),
        min(1.0, max(0.0, y if isinstance(y, (int, float)) else 0.5)),
    )


def _rank_variant_key(key: str) -> int:
    priority = {
        "hero": 0,
        "wide": 1,
        "editorial": 2,
        "open_graph": 3,
        "portrait": 4,
        "square": 5,
        "thumbnail": 6,
    }
    return priority.get(key, 999)


def _select_asset_candidate(media_set: dict[str, Any]) -> tuple[Optional[int], Optional[str]]:
    source = media_set.get("source")
    source_id = _extract_asset_id(source)
    source_filename = _asset_filename(source)
    if source_id or source_filename:
        return source_id, source_filename

    variants = media_set.get("variants")
    if isinstance(variants, dict):
        candidates: list[tuple[int, int, Optional[str]]] = []
        for key, value in variants.items():
            asset_id = _extract_asset_id(value)
            filename = _asset_filename(value)
            if asset_id or filename:
                candidates.append((_rank_variant_key(str(key)), asset_id or 0, filename))
        if candidates:
            _, asset_id, filename = sorted(candidates)[0]
            return asset_id or None, filename

    return None, None


async def _download_asset_image(
    *,
    client: PayloadClient,
    jwt_token: str,
    asset_id: Optional[int],
    filename: Optional[str],
) -> tuple[Image.Image, str]:
    asset = await client.get_media_asset_by_id(asset_id) if asset_id else None
    resolved_filename = filename or (asset.get("filename") if asset else None)
    if not resolved_filename:
        _raise_http_error(
            status_code=400,
            message="Selected MediaSet has no downloadable source or variant",
            step="resolve_composite_source",
            asset_id=asset_id,
        )

    content = await _download_media_asset_file(
        payload_client=client,
        jwt_token=jwt_token,
        filename=resolved_filename,
    )
    try:
        image = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as exc:
        _raise_http_error(
            status_code=400,
            message="Selected MediaSet image could not be parsed",
            step="parse_composite_source",
            filename=resolved_filename,
            detail=str(exc),
        )
    return image, resolved_filename


async def _load_sources(
    *,
    client: PayloadClient,
    jwt_token: str,
    source_ids: list[int],
) -> list[SourceImage]:
    sources: list[SourceImage] = []
    for media_set_id in source_ids:
        media_set = await client.get_media_set_by_id(media_set_id, depth=2)
        if not media_set:
            _raise_http_error(
                status_code=404,
                message="Selected MediaSet was not found",
                step="load_composite_source",
                media_set_id=media_set_id,
            )
        asset_id, filename = _select_asset_candidate(media_set)
        image, resolved_filename = await _download_asset_image(
            client=client,
            jwt_token=jwt_token,
            asset_id=asset_id,
            filename=filename,
        )
        focal_x, focal_y = _media_set_focal(media_set)
        sources.append(
            SourceImage(
                media_set_id=media_set_id,
                image=image,
                filename=resolved_filename,
                focal_x=focal_x,
                focal_y=focal_y,
                width=image.width,
                height=image.height,
            )
        )
    return sources


def _validate_request_shape(request: CompositeRequest) -> None:
    expected_count = 2 if request.layout == "two-up" else 4
    if len(request.sources) != expected_count:
        _raise_http_error(
            status_code=400,
            message=f"{request.layout} requires exactly {expected_count} sources",
            step="validate_composite_request",
            layout=request.layout,
            expected_count=expected_count,
            received_count=len(request.sources),
        )

    ids = [source.mediaSetId for source in request.sources]
    if len(set(ids)) != len(ids):
        _raise_http_error(
            status_code=400,
            message="Composite sources must be unique",
            step="validate_composite_request",
            media_set_ids=ids,
        )


def _tile_boxes(layout: CompositeLayout, width: int, height: int) -> list[tuple[int, int, int, int]]:
    if layout == "two-up":
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


def _crop_to_fill(source: SourceImage, target_width: int, target_height: int) -> Image.Image:
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
    canvas = Image.new("RGB", (spec.width, spec.height), (255, 255, 255))
    boxes = _tile_boxes(layout, spec.width, spec.height)

    for source, box in zip(sources, boxes):
        left, top, right, bottom = box
        tile = _crop_to_fill(source, right - left, bottom - top)
        canvas.paste(tile, (left, top))

    output = io.BytesIO()
    canvas.save(output, format="WEBP", quality=quality, method=6)
    buffer = output.getvalue()
    stem = original_filename.rsplit(".", 1)[0]
    filename = f"{stem}_{variant_type.value}.webp"
    return ProcessedVariant(
        variant_type=variant_type,
        buffer=buffer,
        filename=filename,
        width=spec.width,
        height=spec.height,
        content_type="image/webp",
        file_size=len(buffer),
    )


def _render_variants(
    *,
    layout: CompositeLayout,
    sources: list[SourceImage],
    original_filename: str,
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


def _warnings(sources: list[SourceImage]) -> list[str]:
    warnings: list[str] = []
    for source in sources:
        if source.width < 1000 or source.height < 700:
            warnings.append(
                f"MediaSet {source.media_set_id} source is low resolution ({source.width}x{source.height})."
            )
    return warnings


def _safe_stem(title: str) -> str:
    stem = "".join(ch.lower() if ch.isalnum() else "-" for ch in title.strip())
    while "--" in stem:
        stem = stem.replace("--", "-")
    return stem.strip("-")[:80] or "composite-image"


_TRANSIENT_STATUS = {502, 503, 504}


async def _upload_variant_with_retry(
    *,
    client: PayloadClient,
    variant: ProcessedVariant,
    alt_text: str,
    photographer_credit: str,
    media_set_id: str,
    location_ref: Optional[int],
    attempts: int = 3,
) -> str:
    """Upload one composite variant, retrying transient CDN/gateway failures.

    ``upload_image`` is idempotent per (mediaSet, variant) — it replaces any
    asset already present — so re-running after a transient failure is safe.
    """
    last_error: Optional[PayloadUploadError] = None
    for attempt in range(attempts):
        try:
            return await client.upload_image(
                variant,
                alt_text=alt_text,
                photographer_credit=photographer_credit,
                media_set_id=media_set_id,
                location_ref=location_ref,
            )
        except PayloadUploadError as exc:
            if _status_from_payload_error(exc) not in _TRANSIENT_STATUS or attempt == attempts - 1:
                raise
            last_error = exc
            backoff = 0.5 * (2 ** attempt)
            logger.warning(
                "Composite variant %s upload hit transient error (attempt %d/%d); retrying in %.1fs: %s",
                variant.variant_type.value,
                attempt + 1,
                attempts,
                backoff,
                exc,
            )
            await asyncio.sleep(backoff)
    # Unreachable: the loop either returns or raises, but keeps type-checkers happy.
    raise last_error if last_error else PayloadUploadError(
        step="upload_variant_with_retry",
        message="Variant upload retry exhausted",
    )


async def _rollback_partial_composite(
    *,
    client: PayloadClient,
    media_set_id: Optional[str],
    uploaded_asset_ids: list[str],
) -> None:
    """Best-effort cleanup after a failed composite create.

    Removes any variant assets that were already uploaded and the MediaSet
    itself so a partial failure never leaves orphaned ("hanging") images.
    Cleanup errors are swallowed and logged — the original failure is what
    gets surfaced to the caller.
    """
    for asset_id in uploaded_asset_ids:
        try:
            await client.delete_media_asset(asset_id)
        except PayloadUploadError:
            logger.warning(
                "Composite rollback could not delete asset_id=%s", asset_id, exc_info=True
            )
    if media_set_id is not None:
        try:
            await client.delete_media_set(media_set_id)
        except PayloadUploadError:
            logger.warning(
                "Composite rollback could not delete media_set_id=%s",
                media_set_id,
                exc_info=True,
            )


async def _prepare(
    request: CompositeRequest,
    authorization: Optional[str],
) -> tuple[str, Optional[int], str, list[SourceImage], list[str]]:
    _validate_request_shape(request)
    jwt_token = _extract_bearer_token(authorization)
    location_ref = _validate_location_ref(request.locationRef)
    photographer_credit = _validate_photographer_credit(
        request.photographerCredit or "Questurian Composite"
    )
    client = PayloadClient(jwt_token)
    sources = await _load_sources(
        client=client,
        jwt_token=jwt_token,
        source_ids=[source.mediaSetId for source in request.sources],
    )
    return jwt_token, location_ref, photographer_credit, sources, _warnings(sources)


@router.post("/preview")
async def preview_composite(
    request: CompositeRequest,
    authorization: Optional[str] = Header(None),
) -> Response:
    try:
        _, _, _, sources, warnings = await _prepare(request, authorization)
    except PayloadUploadError as exc:
        logger.exception("Payload error during /images/composites/preview")
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message="Failed to preview composite image",
            step=exc.step,
            detail=exc.detail or str(exc),
            payload_error=exc.to_dict(),
        )
    variant = _render_composite_variant(
        layout=request.layout,
        sources=sources,
        variant_type=ImageVariantType.WIDE,
        original_filename=f"{_safe_stem(request.title)}.webp",
    )
    return Response(
        content=variant.buffer,
        media_type="image/webp",
        headers={"X-Composite-Warnings": json.dumps(warnings)},
    )


@router.post("/create")
async def create_composite(
    request: CompositeRequest,
    authorization: Optional[str] = Header(None),
) -> JSONResponse:
    try:
        jwt_token, location_ref, photographer_credit, sources, warnings = await _prepare(
            request,
            authorization,
        )
    except PayloadUploadError as exc:
        logger.exception("Payload error during /images/composites/create prepare")
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message="Failed to prepare composite image",
            step=exc.step,
            detail=exc.detail or str(exc),
            payload_error=exc.to_dict(),
        )
    client = PayloadClient(jwt_token)
    external_ref = f"composite-{_safe_stem(request.title)}-{int(time.time() * 1000)}"
    variants = _render_variants(
        layout=request.layout,
        sources=sources,
        original_filename=f"{external_ref}.webp",
    )

    media_set_id: Optional[str] = None
    uploaded_asset_ids: list[str] = []
    variant_asset_ids: dict[str, str] = {}
    try:
        media_set_id = await client.create_media_set(
            title=request.title.strip(),
            alt_text=request.altText.strip(),
            external_ref=external_ref,
            photographer_credit=photographer_credit,
            location_ref=location_ref,
        )
        for variant_type in ImageVariantType:
            asset_id = await _upload_variant_with_retry(
                client=client,
                variant=variants[variant_type],
                alt_text=request.altText.strip(),
                photographer_credit=photographer_credit,
                media_set_id=media_set_id,
                location_ref=location_ref,
            )
            uploaded_asset_ids.append(asset_id)
            variant_asset_ids[variant_type.value] = asset_id
    except PayloadUploadError as exc:
        logger.exception("Payload error during /images/composites/create")
        await _rollback_partial_composite(
            client=client,
            media_set_id=media_set_id,
            uploaded_asset_ids=uploaded_asset_ids,
        )
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message="Failed to create composite MediaSet",
            step=exc.step,
            detail=exc.detail or str(exc),
            payload_error=exc.to_dict(),
        )

    return JSONResponse(
        {
            "success": True,
            "mediaSetId": media_set_id,
            "externalRef": external_ref,
            "variantAssetIds": variant_asset_ids,
            "warnings": warnings,
        }
    )


# ---------------------------------------------------------------------------
# Hanging-composite cleanup
#
# A composite that failed mid-upload before rollback existed leaves a MediaSet
# with fewer than the full set of variants. These are invisible to the Orphans
# tab (their assets still have a mediaSet) and the Audit tab (metadata is
# complete), so we surface and clean them here.
# ---------------------------------------------------------------------------

HANGING_EXTERNAL_REF_PREFIX = "composite-"
EXPECTED_VARIANT_COUNT = len(ImageVariantType)


class HangingCleanupRequest(BaseModel):
    mediaSetIds: list[int] = Field(min_length=1)


def _parse_created_at(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _first_asset_preview(assets: list[dict]) -> Optional[str]:
    for asset in assets:
        url = asset.get("url")
        if isinstance(url, str) and url:
            return url
    return None


async def _find_hanging_composites(
    *,
    client: PayloadClient,
    min_age_minutes: float,
) -> list[dict]:
    """Return composite MediaSets that have fewer than the full variant set."""
    media_sets = await client.find_media_sets_by_external_ref_prefix(
        HANGING_EXTERNAL_REF_PREFIX
    )
    now = datetime.now(timezone.utc)
    hanging: list[dict] = []

    for media_set in media_sets:
        external_ref = str(media_set.get("externalRef") or "")
        # `like` is a contains match — enforce a real prefix.
        if not external_ref.startswith(HANGING_EXTERNAL_REF_PREFIX):
            continue
        set_id = media_set.get("id")
        if set_id is None:
            continue

        created = _parse_created_at(media_set.get("createdAt"))
        if created is not None:
            age_minutes = (now - created).total_seconds() / 60
            if age_minutes < min_age_minutes:
                continue

        assets = await client.list_media_assets_by_media_set(set_id)
        if len(assets) >= EXPECTED_VARIANT_COUNT:
            continue

        hanging.append(
            {
                "mediaSetId": set_id,
                "externalRef": external_ref,
                "title": media_set.get("title") or "Untitled composite",
                "createdAt": media_set.get("createdAt"),
                "variantCount": len(assets),
                "expectedVariants": EXPECTED_VARIANT_COUNT,
                "previewUrl": _first_asset_preview(assets),
                "assetIds": [str(a.get("id")) for a in assets if a.get("id") is not None],
            }
        )

    return hanging


@router.get("/hanging")
async def list_hanging_composites(
    authorization: Optional[str] = Header(None),
    min_age_minutes: float = 5.0,
) -> JSONResponse:
    """List composite MediaSets left incomplete by a failed upload."""
    jwt_token = _extract_bearer_token(authorization)
    client = PayloadClient(jwt_token)
    try:
        hanging = await _find_hanging_composites(
            client=client,
            min_age_minutes=min_age_minutes,
        )
    except PayloadUploadError as exc:
        logger.exception("Payload error during /images/composites/hanging")
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message="Failed to list hanging composites",
            step=exc.step,
            detail=exc.detail or str(exc),
            payload_error=exc.to_dict(),
        )
    return JSONResponse({"hanging": hanging, "count": len(hanging)})


@router.post("/cleanup")
async def cleanup_hanging_composites(
    request: HangingCleanupRequest,
    authorization: Optional[str] = Header(None),
) -> JSONResponse:
    """Delete the given hanging composite MediaSets and their variant assets.

    Only sets that are genuinely hanging (composite-prefixed and below the full
    variant count) are removed — a guard against deleting a healthy MediaSet.
    """
    jwt_token = _extract_bearer_token(authorization)
    client = PayloadClient(jwt_token)

    try:
        hanging = await _find_hanging_composites(client=client, min_age_minutes=0.0)
    except PayloadUploadError as exc:
        logger.exception("Payload error during /images/composites/cleanup scan")
        _raise_http_error(
            status_code=_status_from_payload_error(exc),
            message="Failed to scan composites for cleanup",
            step=exc.step,
            detail=exc.detail or str(exc),
            payload_error=exc.to_dict(),
        )

    hanging_by_id = {str(entry["mediaSetId"]): entry for entry in hanging}
    requested_ids = [str(mid) for mid in request.mediaSetIds]

    deleted: list[str] = []
    skipped: list[str] = []
    errors: list[dict] = []

    for media_set_id in requested_ids:
        entry = hanging_by_id.get(media_set_id)
        if entry is None:
            # Not hanging (already gone, or a healthy set) — never touch it.
            skipped.append(media_set_id)
            continue
        try:
            for asset_id in entry["assetIds"]:
                await client.delete_media_asset(asset_id)
            await client.delete_media_set(media_set_id)
            deleted.append(media_set_id)
        except PayloadUploadError as exc:
            logger.warning(
                "Cleanup failed for hanging composite media_set_id=%s: %s",
                media_set_id,
                exc,
            )
            errors.append({"mediaSetId": media_set_id, "detail": exc.detail or str(exc)})

    return JSONResponse(
        {
            "deleted": deleted,
            "skipped": skipped,
            "errors": errors,
            "deletedCount": len(deleted),
        }
    )
