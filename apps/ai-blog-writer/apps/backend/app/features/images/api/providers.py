"""External image provider search routes."""

from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..shared import (
    PEXELS_ALLOWED_ORIENTATIONS,
    PEXELS_SEARCH_URL,
    UNSPLASH_ALLOWED_ORIENTATIONS,
    UNSPLASH_SEARCH_URL,
    _get_pexels_api_key,
    _get_unsplash_access_key,
    _raise_http_error,
    logger,
)

router = APIRouter()


@router.get("/pexels/search")
async def search_pexels_images(
    query: str,
    per_page: int = 9,
    page: int = 1,
    orientation: Optional[str] = None,
) -> JSONResponse:
    """Proxy basic Pexels photo search for stage image picker previews."""
    normalized_query = query.strip()
    normalized_orientation = (orientation or "").strip().lower()
    if not normalized_query:
        _raise_http_error(
            status_code=400,
            message="query is required",
            step="validate_pexels_query",
        )

    if per_page < 1 or per_page > 80:
        _raise_http_error(
            status_code=400,
            message="per_page must be between 1 and 80",
            step="validate_pexels_query",
            per_page=per_page,
        )

    if page < 1:
        _raise_http_error(
            status_code=400,
            message="page must be greater than 0",
            step="validate_pexels_query",
            page=page,
        )

    if (
        normalized_orientation
        and normalized_orientation not in PEXELS_ALLOWED_ORIENTATIONS
    ):
        _raise_http_error(
            status_code=400,
            message="orientation must be landscape, portrait, or square",
            step="validate_pexels_query",
            orientation=orientation,
        )

    api_key = _get_pexels_api_key()
    params: Dict[str, Any] = {
        "query": normalized_query,
        "per_page": per_page,
        "page": page,
    }
    if normalized_orientation:
        params["orientation"] = normalized_orientation

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                PEXELS_SEARCH_URL,
                params=params,
                headers={"Authorization": api_key},
            )
    except httpx.RequestError as exc:
        logger.exception("Pexels request failed for query=%s", normalized_query)
        _raise_http_error(
            status_code=502,
            message="Failed to reach Pexels API",
            step="request_pexels",
            detail=str(exc),
        )

    if response.status_code >= 400:
        detail_message = f"Pexels API returned {response.status_code}"
        if response.status_code == 429:
            _raise_http_error(
                status_code=429,
                message=detail_message,
                step="request_pexels",
                provider_status_code=response.status_code,
            )
        _raise_http_error(
            status_code=502,
            message=detail_message,
            step="request_pexels",
            provider_status_code=response.status_code,
        )

    try:
        payload = response.json()
    except ValueError as exc:
        logger.exception(
            "Pexels response was not valid JSON for query=%s", normalized_query
        )
        _raise_http_error(
            status_code=502,
            message="Pexels API returned invalid JSON",
            step="parse_pexels_response",
            detail=str(exc),
        )

    photos_raw = payload.get("photos")
    if not isinstance(photos_raw, list):
        photos_raw = []

    photos: List[Dict[str, Any]] = []
    for photo in photos_raw:
        if not isinstance(photo, dict):
            continue

        src = photo.get("src")
        if not isinstance(src, dict):
            src = {}

        image_url = (
            src.get("medium")
            or src.get("large")
            or src.get("large2x")
            or src.get("portrait")
            or src.get("original")
        )
        if not image_url:
            continue

        photo_id = photo.get("id")
        photos.append(
            {
                "id": int(photo_id) if isinstance(photo_id, int) else photo_id,
                "width": photo.get("width"),
                "height": photo.get("height"),
                "alt": photo.get("alt") or "",
                "photographer": photo.get("photographer") or "",
                "photographer_url": photo.get("photographer_url") or "",
                "pexels_url": photo.get("url") or "",
                "image_url": image_url,
                "image_url_large": src.get("large2x") or src.get("large") or image_url,
                "image_url_portrait": src.get("portrait") or image_url,
                "image_url_original": src.get("original") or image_url,
            }
        )

    return JSONResponse(
        {
            "success": True,
            "query": normalized_query,
            "page": page,
            "per_page": per_page,
            "total_results": payload.get("total_results", 0),
            "photos": photos,
        }
    )


@router.get("/unsplash/search")
async def search_unsplash_images(
    query: str,
    per_page: int = 18,
    page: int = 1,
    orientation: Optional[str] = None,
) -> JSONResponse:
    """Proxy basic Unsplash photo search for stage image picker previews."""
    normalized_query = query.strip()
    normalized_orientation = (orientation or "").strip().lower()
    if not normalized_query:
        _raise_http_error(
            status_code=400,
            message="query is required",
            step="validate_unsplash_query",
        )

    if per_page < 1 or per_page > 30:
        _raise_http_error(
            status_code=400,
            message="per_page must be between 1 and 30",
            step="validate_unsplash_query",
            per_page=per_page,
        )

    if page < 1:
        _raise_http_error(
            status_code=400,
            message="page must be greater than 0",
            step="validate_unsplash_query",
            page=page,
        )

    if (
        normalized_orientation
        and normalized_orientation not in UNSPLASH_ALLOWED_ORIENTATIONS
    ):
        _raise_http_error(
            status_code=400,
            message="orientation must be landscape, portrait, or square",
            step="validate_unsplash_query",
            orientation=orientation,
        )

    unsplash_orientation = (
        "squarish" if normalized_orientation == "square" else normalized_orientation
    )

    access_key = _get_unsplash_access_key()
    params: Dict[str, Any] = {
        "query": normalized_query,
        "per_page": per_page,
        "page": page,
    }
    if unsplash_orientation:
        params["orientation"] = unsplash_orientation

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                UNSPLASH_SEARCH_URL,
                params=params,
                headers={
                    "Authorization": f"Client-ID {access_key}",
                    "Accept-Version": "v1",
                },
            )
    except httpx.RequestError as exc:
        logger.exception("Unsplash request failed for query=%s", normalized_query)
        _raise_http_error(
            status_code=502,
            message="Failed to reach Unsplash API",
            step="request_unsplash",
            detail=str(exc),
        )

    if response.status_code >= 400:
        detail_message = f"Unsplash API returned {response.status_code}"
        if response.status_code == 429:
            _raise_http_error(
                status_code=429,
                message=detail_message,
                step="request_unsplash",
                provider_status_code=response.status_code,
            )
        _raise_http_error(
            status_code=502,
            message=detail_message,
            step="request_unsplash",
            provider_status_code=response.status_code,
        )

    try:
        payload = response.json()
    except ValueError as exc:
        logger.exception(
            "Unsplash response was not valid JSON for query=%s",
            normalized_query,
        )
        _raise_http_error(
            status_code=502,
            message="Unsplash API returned invalid JSON",
            step="parse_unsplash_response",
            detail=str(exc),
        )

    photos_raw = payload.get("results")
    if not isinstance(photos_raw, list):
        photos_raw = []

    photos: List[Dict[str, Any]] = []
    for photo in photos_raw:
        if not isinstance(photo, dict):
            continue

        urls = photo.get("urls")
        if not isinstance(urls, dict):
            urls = {}

        image_url = urls.get("small") or urls.get("regular") or urls.get("full")
        if not image_url:
            continue

        user = photo.get("user")
        if not isinstance(user, dict):
            user = {}

        user_links = user.get("links")
        if not isinstance(user_links, dict):
            user_links = {}

        links = photo.get("links")
        if not isinstance(links, dict):
            links = {}

        photo_id = photo.get("id")
        photos.append(
            {
                "id": photo_id,
                "width": photo.get("width"),
                "height": photo.get("height"),
                "alt": photo.get("alt_description") or photo.get("description") or "",
                "photographer": user.get("name") or "",
                "photographer_url": user_links.get("html") or "",
                "unsplash_url": links.get("html") or "",
                "image_url": image_url,
                "image_url_regular": urls.get("regular") or image_url,
                "image_url_full": urls.get("full") or image_url,
                "image_url_raw": urls.get("raw") or image_url,
            }
        )

    return JSONResponse(
        {
            "success": True,
            "query": normalized_query,
            "page": page,
            "per_page": per_page,
            "total_results": payload.get("total", 0),
            "photos": photos,
        }
    )
