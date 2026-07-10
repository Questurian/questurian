"""Payload CMS API client for uploading images and creating MediaSets."""

import json
import logging
import os
from typing import Any, Optional, TypedDict

import httpx

from .image_processor import ImageVariantType, ProcessedVariant


logger = logging.getLogger("images.payload")

DEFAULT_PAYLOAD_API_URL = "http://localhost:4000"


class PayloadMediaAssetDoc(TypedDict):
    id: str
    filename: str
    mediaSet: str | int | None
    variant: str | None
    width: int | None
    height: int | None
    bunny_original_url: str | None
    url: str | None


def _running_in_docker() -> bool:
    """Return True when executing inside a Docker container."""
    return os.path.exists("/.dockerenv")


def _resolve_payload_api_url() -> str:
    """
    Resolve the Payload base URL for local and Dockerized backend runs.

    Priority:
    1. PAYLOAD_API_URL env var
    2. localhost for local development and host-based runs
    """
    configured_url = os.getenv("PAYLOAD_API_URL")
    if configured_url:
        return configured_url

    if _running_in_docker():
        logger.warning(
            "PAYLOAD_API_URL not set while running in Docker; defaulting to %s. "
            "Set PAYLOAD_API_URL explicitly if Payload is outside this container.",
            DEFAULT_PAYLOAD_API_URL,
        )
    return DEFAULT_PAYLOAD_API_URL


class PayloadUploadError(Exception):
    """Structured error for Payload operations with full context."""

    def __init__(self, step: str, message: str, status_code: int = 0,
                 response_body: str = "", request_url: str = "", detail: str = ""):
        self.step = step
        self.status_code = status_code
        self.response_body = response_body
        self.request_url = request_url
        self.detail = detail
        full_msg = f"[{step}] {message}"
        if status_code:
            full_msg += f" (HTTP {status_code})"
        if detail:
            full_msg += f" — {detail}"
        super().__init__(full_msg)

    def to_dict(self) -> dict:
        return {
            "step": self.step,
            "message": str(self),
            "detail": self.detail,
            "status_code": self.status_code,
            "response_body": self.response_body[:1000] if self.response_body else "",
            "request_url": self.request_url,
        }


def _parse_payload_error(response_text: str) -> str:
    """Extract a human-readable error from Payload's JSON error responses."""
    try:
        data = json.loads(response_text)
        errors = data.get("errors", [])
        if errors:
            messages = [e.get("message", "") for e in errors if e.get("message")]
            field_errors = [
                f"{e.get('field', '?')}: {e.get('message', '')}"
                for e in errors if e.get("field")
            ]
            if field_errors:
                return "Validation: " + "; ".join(field_errors)
            if messages:
                return "; ".join(messages)
        if data.get("message"):
            return data["message"]
    except (json.JSONDecodeError, KeyError):
        pass
    return response_text[:300] if response_text else "Empty response"


def _is_variant_conflict_error(parsed_error: str, variant: str) -> bool:
    """Detect Payload's duplicate mediaSet+variant conflict message."""
    normalized = parsed_error.lower()
    variant_key = variant.lower()
    return (
        "mediaset already has a" in normalized
        or (
            "already has a" in normalized
            and variant_key in normalized
            and "variant" in normalized
        )
    )


def _is_missing_storage_file_delete_error(error: PayloadUploadError) -> bool:
    """Detect Payload/Bunny delete failures caused by an already-missing file."""
    normalized = f"{error.detail} {error.response_body}".lower()
    return (
        error.status_code >= 500
        and "delete file" in normalized
        and (
            "couldn't" in normalized
            or "could not" in normalized
            or "failed" in normalized
        )
    )


def _extract_relationship_id(value: Any) -> str | int | None:
    if value is None:
        return None
    if isinstance(value, (str, int)):
        return value
    if isinstance(value, dict):
        related_id = value.get("id")
        if isinstance(related_id, (str, int)):
            return related_id
    return None


def _to_optional_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value.is_integer():
            return int(value)
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return int(text)
        except ValueError:
            return None
    return None


def _parse_media_asset_doc(doc: Any) -> PayloadMediaAssetDoc:
    if not isinstance(doc, dict):
        raise PayloadUploadError(
            step="parse_media_asset_doc",
            message="Payload returned an invalid media-asset document",
            detail=f"Expected dict, got {type(doc).__name__}",
        )

    raw_id = doc.get("id")
    if raw_id is None:
        raise PayloadUploadError(
            step="parse_media_asset_doc",
            message="Payload media-asset document is missing id",
            detail=f"Response keys: {list(doc.keys())}",
        )

    filename = doc.get("filename")
    if not isinstance(filename, str) or not filename.strip():
        raise PayloadUploadError(
            step="parse_media_asset_doc",
            message="Payload media-asset document is missing filename",
            detail=f"asset_id={raw_id}",
        )

    media_set = _extract_relationship_id(doc.get("mediaSet"))
    variant = doc.get("variant")
    width = _to_optional_int(doc.get("width"))
    height = _to_optional_int(doc.get("height"))
    bunny_original_url = (
        doc.get("bunny_original_url")
        if isinstance(doc.get("bunny_original_url"), str)
        else None
    )
    asset_url = doc.get("url") if isinstance(doc.get("url"), str) else None

    return PayloadMediaAssetDoc(
        id=str(raw_id),
        filename=filename,
        mediaSet=media_set,
        variant=variant if isinstance(variant, str) else None,
        width=width,
        height=height,
        bunny_original_url=bunny_original_url,
        url=asset_url,
    )


class PayloadClient:
    """Async client for Payload CMS media operations."""

    def __init__(self, jwt_token: Optional[str] = None):
        self.api_url = _resolve_payload_api_url().rstrip('/')
        self.jwt_token = jwt_token
        if not jwt_token:
            logger.warning("PayloadClient created without JWT token")

    def _get_headers(self) -> dict:
        headers = {}
        if self.jwt_token:
            headers['Authorization'] = f'JWT {self.jwt_token}'
        return headers

    async def upload_image(
        self,
        variant: ProcessedVariant,
        alt_text: str,
        photographer_credit: str = "",
        media_set_id: Optional[str] = None,
        location_ref: Optional[int] = None,
        tags: Optional[list] = None,
    ) -> str:
        """Upload a single image variant to Payload CMS media-assets."""
        url = f"{self.api_url}/api/media-assets"
        headers = self._get_headers()
        step = f"upload_image({variant.variant_type.value})"

        files = {
            'file': (variant.filename, variant.buffer, variant.content_type),
        }

        media_set_value: Optional[str | int] = media_set_id
        if isinstance(media_set_value, str) and media_set_value.isdigit():
            media_set_value = int(media_set_value)

        # Make uploads deterministic per (mediaSet, variant):
        # if a variant already exists for this set, replace it so the latest upload wins.
        if media_set_id is not None:
            existing_asset = await self.find_media_asset_by_variant(
                media_set_id=media_set_id,
                variant=variant.variant_type.value,
            )
            existing_asset_id = existing_asset.get("id") if existing_asset else None
            if existing_asset_id:
                replacement_action = "deleted"
                try:
                    await self.delete_media_asset(str(existing_asset_id))
                except PayloadUploadError as exc:
                    if not _is_missing_storage_file_delete_error(exc):
                        raise
                    detached = await self.detach_media_asset_from_media_set(
                        asset_id=str(existing_asset_id),
                        media_set_id=media_set_id,
                        variant=variant.variant_type.value,
                    )
                    logger.warning(
                        "%s stale variant asset_id=%s delete failed because storage file is missing; detached=%s before upload",
                        step,
                        existing_asset_id,
                        detached,
                    )
                    replacement_action = "detached stale" if detached else "skipped stale"
                logger.info(
                    "%s ↻ existing variant found for media_set_id=%s; %s asset_id=%s before upload",
                    step,
                    media_set_id,
                    replacement_action,
                    existing_asset_id,
                )

        for attempt in range(3):
            payload_obj = {
                'alt_text': alt_text,
                'photographer_credit': photographer_credit.strip(),
                'variant': variant.variant_type.value,
            }
            if media_set_value is not None:
                payload_obj['mediaSet'] = media_set_value
            if location_ref is not None:
                payload_obj['locationRef'] = location_ref
            if tags:
                payload_obj['tags'] = tags

            payload_json = json.dumps(payload_obj)
            data = {
                '_payload': payload_json,
            }

            logger.info(
                "%s → %s | attempt=%d | file=%s (%d bytes, %s) | _payload=%s",
                step,
                url,
                attempt + 1,
                variant.filename,
                len(variant.buffer),
                variant.content_type,
                payload_json,
            )

            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(
                        url, headers=headers, files=files, data=data
                    )
            except httpx.ConnectError as e:
                raise PayloadUploadError(
                    step=step,
                    message="Cannot connect to Payload CMS",
                    request_url=url,
                    detail=f"Is Payload running at {self.api_url}? ({e})",
                )
            except httpx.TimeoutException as e:
                raise PayloadUploadError(
                    step=step,
                    message="Payload CMS request timed out (60s)",
                    request_url=url,
                    detail=str(e),
                )

            body = response.text
            logger.info("%s ← HTTP %d | body=%s", step, response.status_code, body[:300])

            if response.status_code == 401:
                raise PayloadUploadError(
                    step=step,
                    message="Authentication failed",
                    status_code=401,
                    response_body=body,
                    request_url=url,
                    detail="JWT token may be expired or invalid. Try logging in again.",
                )

            if response.status_code >= 400:
                parsed = _parse_payload_error(body)
                can_overwrite_retry = (
                    attempt == 0
                    and media_set_id is not None
                    and _is_variant_conflict_error(
                        parsed,
                        variant.variant_type.value,
                    )
                )
                should_probe_existing_variant = (
                    attempt == 0
                    and media_set_id is not None
                    and response.status_code >= 500
                )

                if can_overwrite_retry:
                    existing_asset = await self.find_media_asset_by_variant(
                        media_set_id=media_set_id,
                        variant=variant.variant_type.value,
                    )
                    existing_asset_id = (
                        existing_asset.get("id") if existing_asset else None
                    )
                    if not existing_asset_id:
                        raise PayloadUploadError(
                            step=step,
                            message="Variant conflict detected but no existing asset found",
                            status_code=response.status_code,
                            response_body=body,
                            request_url=url,
                            detail=parsed,
                        )

                    logger.warning(
                        "%s duplicate variant found after upload race; reusing existing asset_id=%s",
                        step,
                        existing_asset_id,
                    )
                    return str(existing_asset_id)

                if should_probe_existing_variant:
                    existing_asset = await self.find_media_asset_by_variant(
                        media_set_id=media_set_id,
                        variant=variant.variant_type.value,
                    )
                    existing_asset_id = (
                        existing_asset.get("id") if existing_asset else None
                    )
                    if existing_asset_id:
                        logger.warning(
                            "%s received HTTP %d with generic payload error; "
                            "existing %s variant asset_id=%s found, reusing existing asset",
                            step,
                            response.status_code,
                            variant.variant_type.value,
                            existing_asset_id,
                        )
                        return str(existing_asset_id)

                raise PayloadUploadError(
                    step=step,
                    message="Payload rejected the upload",
                    status_code=response.status_code,
                    response_body=body,
                    request_url=url,
                    detail=parsed,
                )

            try:
                result = response.json()
            except json.JSONDecodeError:
                raise PayloadUploadError(
                    step=step,
                    message="Payload returned invalid JSON",
                    status_code=response.status_code,
                    response_body=body,
                    request_url=url,
                )

            asset_id = result.get('doc', {}).get('id')
            if not asset_id:
                raise PayloadUploadError(
                    step=step,
                    message="Payload returned success but no asset ID in response",
                    status_code=response.status_code,
                    response_body=body[:500],
                    request_url=url,
                    detail=f"Response keys: {list(result.keys())}",
                )

            logger.info("%s ✓ asset_id=%s", step, asset_id)
            return str(asset_id)

        raise PayloadUploadError(
            step=step,
            message="Upload retry exhausted",
            request_url=url,
            detail="Retry limit reached while handling upload retries.",
        )

    async def create_media_set(
        self,
        title: str,
        alt_text: str,
        external_ref: str,
        photographer_credit: str = "",
        location_ref: Optional[int] = None,
        tags: Optional[list] = None,
    ) -> str:
        """Create a MediaSet in Payload CMS."""
        url = f"{self.api_url}/api/media-sets"
        headers = {**self._get_headers(), 'Content-Type': 'application/json'}
        step = "create_media_set"

        payload = {
            'title': title,
            'alt_text': alt_text,
            'externalRef': external_ref,
        }
        if photographer_credit.strip():
            payload['photographer_credit'] = photographer_credit.strip()
        if location_ref is not None:
            payload['locationRef'] = location_ref
        if tags:
            payload['tags'] = tags

        logger.info("%s → %s | payload=%s", step, url, json.dumps(payload))

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=headers, json=payload)
        except httpx.ConnectError as e:
            raise PayloadUploadError(
                step=step, message="Cannot connect to Payload CMS",
                request_url=url, detail=f"Is Payload running at {self.api_url}? ({e})"
            )
        except httpx.TimeoutException as e:
            raise PayloadUploadError(
                step=step, message="Payload CMS request timed out (30s)",
                request_url=url, detail=str(e)
            )

        body = response.text
        logger.info("%s ← HTTP %d | body=%s", step, response.status_code, body[:300])

        if response.status_code == 401:
            raise PayloadUploadError(
                step=step, message="Authentication failed",
                status_code=401, response_body=body, request_url=url,
                detail="JWT token may be expired or invalid."
            )

        if response.status_code >= 400:
            parsed = _parse_payload_error(body)
            raise PayloadUploadError(
                step=step, message="Failed to create MediaSet",
                status_code=response.status_code, response_body=body,
                request_url=url, detail=parsed
            )

        try:
            result = response.json()
        except json.JSONDecodeError:
            raise PayloadUploadError(
                step=step, message="Payload returned invalid JSON",
                status_code=response.status_code, response_body=body,
                request_url=url
            )

        media_set_id = result.get('doc', {}).get('id')
        if not media_set_id:
            raise PayloadUploadError(
                step=step, message="Payload returned success but no MediaSet ID",
                status_code=response.status_code, response_body=body[:500],
                request_url=url
            )

        logger.info("%s ✓ mediaSetId=%s", step, media_set_id)
        return str(media_set_id)

    async def get_media_set_by_id(
        self,
        media_set_id: str | int,
        depth: int = 2,
    ) -> Optional[dict]:
        """Fetch one media-set by ID."""
        url = f"{self.api_url}/api/media-sets/{media_set_id}"
        headers = self._get_headers()
        step = "get_media_set_by_id"
        params = {"depth": depth}

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=headers, params=params)
        except httpx.ConnectError as e:
            raise PayloadUploadError(
                step=step,
                message="Cannot connect to Payload CMS",
                request_url=url,
                detail=f"Is Payload running at {self.api_url}? ({e})",
            )
        except httpx.TimeoutException as e:
            raise PayloadUploadError(
                step=step,
                message="Payload CMS request timed out (15s)",
                request_url=url,
                detail=str(e),
            )

        if response.status_code == 404:
            return None

        if response.status_code >= 400:
            body = response.text
            parsed = _parse_payload_error(body)
            raise PayloadUploadError(
                step=step,
                message="Failed to fetch media-set by id",
                status_code=response.status_code,
                response_body=body,
                request_url=url,
                detail=parsed,
            )

        try:
            result = response.json()
        except json.JSONDecodeError:
            body = response.text
            raise PayloadUploadError(
                step=step,
                message="Payload returned invalid JSON while fetching media-set",
                status_code=response.status_code,
                response_body=body,
                request_url=url,
            )

        if isinstance(result, dict) and isinstance(result.get("doc"), dict):
            return result["doc"]
        if isinstance(result, dict) and result.get("id") is not None:
            return result
        return None

    async def find_media_set_by_external_ref(self, external_ref: str) -> Optional[dict]:
        """Find a MediaSet by its external reference."""
        url = f"{self.api_url}/api/media-sets"
        headers = self._get_headers()
        params = {
            'where[externalRef][equals]': external_ref,
            'limit': 1
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=headers, params=params)
        except httpx.ConnectError as e:
            raise PayloadUploadError(
                step="find_media_set", message="Cannot connect to Payload CMS",
                request_url=url, detail=f"Is Payload running at {self.api_url}? ({e})"
            )
        except httpx.TimeoutException:
            raise PayloadUploadError(
                step="find_media_set", message="Payload CMS request timed out (15s)",
                request_url=url
            )

        if response.status_code >= 400:
            body = response.text
            parsed = _parse_payload_error(body)
            raise PayloadUploadError(
                step="find_media_set", message="Failed to query MediaSets",
                status_code=response.status_code, response_body=body,
                request_url=url, detail=parsed
            )

        try:
            result = response.json()
        except json.JSONDecodeError:
            body = response.text
            raise PayloadUploadError(
                step="find_media_set",
                message="Payload returned invalid JSON while querying MediaSets",
                status_code=response.status_code,
                response_body=body,
                request_url=url,
            )

        docs = result.get('docs', [])
        found = docs[0] if docs else None
        logger.info("find_media_set(ref=%s) → %s", external_ref, found.get('id') if found else "not found")
        return found

    async def get_media_asset_by_id(
        self,
        asset_id: str | int,
    ) -> Optional[PayloadMediaAssetDoc]:
        """Fetch one media-asset by ID."""
        url = f"{self.api_url}/api/media-assets/{asset_id}"
        headers = self._get_headers()
        step = "get_media_asset_by_id"

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=headers)
        except httpx.ConnectError as e:
            raise PayloadUploadError(
                step=step,
                message="Cannot connect to Payload CMS",
                request_url=url,
                detail=f"Is Payload running at {self.api_url}? ({e})",
            )
        except httpx.TimeoutException as e:
            raise PayloadUploadError(
                step=step,
                message="Payload CMS request timed out (15s)",
                request_url=url,
                detail=str(e),
            )

        if response.status_code == 404:
            return None

        if response.status_code >= 400:
            body = response.text
            parsed = _parse_payload_error(body)
            raise PayloadUploadError(
                step=step,
                message="Failed to fetch media-asset by id",
                status_code=response.status_code,
                response_body=body,
                request_url=url,
                detail=parsed,
            )

        try:
            result = response.json()
        except json.JSONDecodeError:
            body = response.text
            raise PayloadUploadError(
                step=step,
                message="Payload returned invalid JSON while fetching media-asset",
                status_code=response.status_code,
                response_body=body,
                request_url=url,
            )

        doc: Any = None
        if isinstance(result, dict):
            # Payload responses can be either {"doc": {...}} or the raw document object.
            if isinstance(result.get("doc"), dict):
                doc = result.get("doc")
            elif result.get("id") is not None and result.get("filename") is not None:
                doc = result

        if doc is None:
            # Some deployments can return a non-standard by-id payload shape.
            # Fall back to a filtered collection query for robustness.
            query_url = f"{self.api_url}/api/media-assets"
            query_params = {
                "where[id][equals]": str(asset_id),
                "limit": 1,
                "depth": 0,
            }
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    query_response = await client.get(
                        query_url,
                        headers=headers,
                        params=query_params,
                    )
            except httpx.ConnectError as e:
                raise PayloadUploadError(
                    step=step,
                    message="Cannot connect to Payload CMS",
                    request_url=query_url,
                    detail=f"Is Payload running at {self.api_url}? ({e})",
                )
            except httpx.TimeoutException as e:
                raise PayloadUploadError(
                    step=step,
                    message="Payload CMS request timed out (15s)",
                    request_url=query_url,
                    detail=str(e),
                )

            if query_response.status_code >= 400:
                body = query_response.text
                parsed = _parse_payload_error(body)
                raise PayloadUploadError(
                    step=step,
                    message="Failed to query media-asset by id fallback",
                    status_code=query_response.status_code,
                    response_body=body,
                    request_url=query_url,
                    detail=parsed,
                )

            try:
                query_result = query_response.json()
            except json.JSONDecodeError:
                body = query_response.text
                raise PayloadUploadError(
                    step=step,
                    message="Payload returned invalid JSON while querying media-asset fallback",
                    status_code=query_response.status_code,
                    response_body=body,
                    request_url=query_url,
                )

            docs = query_result.get("docs", []) if isinstance(query_result, dict) else []
            if isinstance(docs, list) and docs:
                first_doc = docs[0]
                return _parse_media_asset_doc(first_doc)

            return None

        return _parse_media_asset_doc(doc)

    async def list_media_assets_by_media_set(
        self,
        media_set_id: str | int,
    ) -> list[PayloadMediaAssetDoc]:
        """List all media-assets linked to a media set."""
        url = f"{self.api_url}/api/media-assets"
        headers = self._get_headers()
        step = "list_media_assets_by_media_set"
        page = 1
        docs: list[PayloadMediaAssetDoc] = []
        total_pages = 1

        while page <= total_pages:
            params = {
                "where[mediaSet][equals]": str(media_set_id),
                "limit": 100,
                "page": page,
            }

            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.get(url, headers=headers, params=params)
            except httpx.ConnectError as e:
                raise PayloadUploadError(
                    step=step,
                    message="Cannot connect to Payload CMS",
                    request_url=url,
                    detail=f"Is Payload running at {self.api_url}? ({e})",
                )
            except httpx.TimeoutException as e:
                raise PayloadUploadError(
                    step=step,
                    message="Payload CMS request timed out (15s)",
                    request_url=url,
                    detail=str(e),
                )

            if response.status_code >= 400:
                body = response.text
                parsed = _parse_payload_error(body)
                raise PayloadUploadError(
                    step=step,
                    message="Failed to list media-assets by media set",
                    status_code=response.status_code,
                    response_body=body,
                    request_url=url,
                    detail=parsed,
                )

            try:
                result = response.json()
            except json.JSONDecodeError:
                body = response.text
                raise PayloadUploadError(
                    step=step,
                    message="Payload returned invalid JSON while listing media-assets",
                    status_code=response.status_code,
                    response_body=body,
                    request_url=url,
                )

            raw_docs = result.get("docs", [])
            if isinstance(raw_docs, list):
                docs.extend(_parse_media_asset_doc(raw_doc) for raw_doc in raw_docs)

            total_pages_raw = result.get("totalPages", 1)
            total_pages = total_pages_raw if isinstance(total_pages_raw, int) and total_pages_raw > 0 else 1
            page += 1

        return docs

    async def find_media_asset_by_variant(
        self,
        media_set_id: str,
        variant: str,
    ) -> Optional[dict]:
        """Find an existing media-asset by mediaSet and variant."""
        url = f"{self.api_url}/api/media-assets"
        headers = self._get_headers()
        step = f"find_media_asset({variant})"
        params = {
            'where[mediaSet][equals]': media_set_id,
            'where[variant][equals]': variant,
            'limit': 1,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=headers, params=params)
        except httpx.ConnectError as e:
            raise PayloadUploadError(
                step=step,
                message="Cannot connect to Payload CMS",
                request_url=url,
                detail=f"Is Payload running at {self.api_url}? ({e})",
            )
        except httpx.TimeoutException:
            raise PayloadUploadError(
                step=step,
                message="Payload CMS request timed out (15s)",
                request_url=url,
            )

        if response.status_code >= 400:
            body = response.text
            parsed = _parse_payload_error(body)
            raise PayloadUploadError(
                step=step,
                message="Failed to query media-assets",
                status_code=response.status_code,
                response_body=body,
                request_url=url,
                detail=parsed,
            )

        try:
            result = response.json()
        except json.JSONDecodeError:
            body = response.text
            raise PayloadUploadError(
                step=step,
                message="Payload returned invalid JSON while querying media-assets",
                status_code=response.status_code,
                response_body=body,
                request_url=url,
            )

        docs = result.get('docs', [])
        found = docs[0] if docs else None
        logger.info(
            "%s(media_set_id=%s) → %s",
            step,
            media_set_id,
            found.get('id') if found else "not found",
        )
        return found

    async def detach_media_asset_from_media_set(
        self,
        asset_id: str,
        media_set_id: str | int,
        variant: str,
    ) -> bool:
        """Clear mediaSet/variant on a stale asset without deleting its storage file."""
        current_asset = await self.get_media_asset_by_id(asset_id)
        if current_asset is None:
            return False

        if (
            str(current_asset.get("mediaSet")) != str(media_set_id)
            or current_asset.get("variant") != variant
        ):
            logger.warning(
                "detach_media_asset(%s) skipped; expected mediaSet=%s variant=%s, got mediaSet=%s variant=%s",
                asset_id,
                media_set_id,
                variant,
                current_asset.get("mediaSet"),
                current_asset.get("variant"),
            )
            return False

        url = f"{self.api_url}/api/media-assets/{asset_id}"
        headers = {**self._get_headers(), "Content-Type": "application/json"}
        step = f"detach_media_asset({asset_id})"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.patch(
                    url,
                    headers=headers,
                    json={"mediaSet": None, "variant": None},
                )
        except httpx.ConnectError as e:
            raise PayloadUploadError(
                step=step,
                message="Cannot connect to Payload CMS",
                request_url=url,
                detail=f"Is Payload running at {self.api_url}? ({e})",
            )
        except httpx.TimeoutException as e:
            raise PayloadUploadError(
                step=step,
                message="Payload CMS request timed out (30s)",
                request_url=url,
                detail=str(e),
            )

        if response.status_code == 404:
            return False

        if response.status_code >= 400:
            body = response.text
            parsed = _parse_payload_error(body)
            raise PayloadUploadError(
                step=step,
                message="Failed to detach stale media-asset from MediaSet",
                status_code=response.status_code,
                response_body=body,
                request_url=url,
                detail=parsed,
            )

        return True

    async def find_or_create_tag(self, name: str) -> int:
        """Find a tag by name in Payload, creating it if it doesn't exist. Returns tag ID."""
        url = f"{self.api_url}/api/article-tags"
        headers = self._get_headers()
        step = f"find_or_create_tag({name!r})"

        # Search by name first
        params = {"where[name][equals]": name, "limit": 1}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=headers, params=params)
        except httpx.ConnectError as e:
            raise PayloadUploadError(step=step, message="Cannot connect to Payload CMS",
                                     request_url=url, detail=str(e))
        except httpx.TimeoutException:
            raise PayloadUploadError(step=step, message="Payload CMS request timed out", request_url=url)

        if response.status_code >= 400:
            raise PayloadUploadError(step=step, message="Failed to search tags",
                                     status_code=response.status_code,
                                     response_body=response.text, request_url=url)

        docs = response.json().get("docs", [])
        if docs:
            tag_id = docs[0].get("id")
            logger.info("%s → found existing tag id=%s", step, tag_id)
            return int(tag_id)

        # Not found — create it
        json_headers = {**headers, "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, headers=json_headers, json={"name": name})
        except httpx.ConnectError as e:
            raise PayloadUploadError(step=step, message="Cannot connect to Payload CMS",
                                     request_url=url, detail=str(e))
        except httpx.TimeoutException:
            raise PayloadUploadError(step=step, message="Payload CMS request timed out", request_url=url)

        if response.status_code >= 400:
            parsed = _parse_payload_error(response.text)
            raise PayloadUploadError(step=step, message="Failed to create tag",
                                     status_code=response.status_code,
                                     response_body=response.text, request_url=url, detail=parsed)

        tag_id = response.json().get("doc", {}).get("id")
        if not tag_id:
            raise PayloadUploadError(step=step, message="Tag created but no ID returned",
                                     response_body=response.text, request_url=url)

        logger.info("%s → created new tag id=%s", step, tag_id)
        return int(tag_id)

    async def delete_media_asset(self, asset_id: str) -> None:
        """Delete a media-asset by ID."""
        url = f"{self.api_url}/api/media-assets/{asset_id}"
        headers = self._get_headers()
        step = f"delete_media_asset({asset_id})"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.delete(url, headers=headers)
        except httpx.ConnectError as e:
            raise PayloadUploadError(
                step=step,
                message="Cannot connect to Payload CMS",
                request_url=url,
                detail=f"Is Payload running at {self.api_url}? ({e})",
            )
        except httpx.TimeoutException as e:
            raise PayloadUploadError(
                step=step,
                message="Payload CMS request timed out (30s)",
                request_url=url,
                detail=str(e),
            )

        if response.status_code in {200, 202, 204, 404}:
            return

        body = response.text
        parsed = _parse_payload_error(body)
        raise PayloadUploadError(
            step=step,
            message="Failed to delete existing media-asset",
            status_code=response.status_code,
            response_body=body,
            request_url=url,
            detail=parsed,
        )


async def upload_image_set(
    jwt_token: str,
    external_ref: str,
    alt_text: str,
    photographer_credit: str,
    location_ref: int,
    variants: dict[ImageVariantType, ProcessedVariant]
) -> dict:
    """Upload all image variants and create a MediaSet (server-side processing)."""
    client = PayloadClient(jwt_token)

    existing = await client.find_media_set_by_external_ref(external_ref)
    if existing:
        existing_id = existing.get('id')
        if not existing_id:
            raise PayloadUploadError(
                step="find_media_set",
                message="Payload returned an existing MediaSet without an id",
                detail=f"external_ref={external_ref}",
            )
        media_set_id = str(existing_id)
        logger.info("Reusing existing MediaSet %s for ref=%s", media_set_id, external_ref)
    else:
        media_set_id = await client.create_media_set(
            title=external_ref,
            alt_text=alt_text,
            external_ref=external_ref,
            photographer_credit=photographer_credit,
            location_ref=location_ref,
        )

    variant_asset_ids = {}
    for variant_type in list(ImageVariantType):
        asset_id = await client.upload_image(
            variants[variant_type],
            alt_text,
            photographer_credit,
            media_set_id,
            location_ref=location_ref,
        )
        variant_asset_ids[variant_type.value] = asset_id

    return {
        "mediaSetId": media_set_id,
        "variantAssetIds": variant_asset_ids
    }
