"""Black Forest Labs FLUX.2 API client."""

import asyncio
import base64
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx


logger = logging.getLogger("images.bfl")

DEFAULT_BFL_BASE_URL = "https://api.bfl.ai"
DEFAULT_BFL_MODEL_ID = "flux-2-pro-preview"
DEFAULT_OUTPUT_FORMAT = "png"
BFL_SUBMIT_TIMEOUT_SECONDS = 30.0
BFL_POLL_TIMEOUT_SECONDS = 15.0
BFL_DOWNLOAD_TIMEOUT_SECONDS = 60.0
BFL_POLL_INTERVAL_SECONDS = 0.5
BFL_TOTAL_POLL_SECONDS = 90.0
BFL_FLEX_MODEL_ID = "flux-2-flex"


def _safe_str(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _safe_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _extract_bfl_error_message(payload: Any, fallback: str = "") -> str:
    if isinstance(payload, dict):
        for key in ("detail", "message", "error"):
            candidate = _safe_str(payload.get(key))
            if candidate:
                return candidate
    if isinstance(payload, str):
        return payload.strip()
    return fallback.strip()


def _serialize_payload(payload: Any) -> str:
    if payload is None:
        return ""
    if isinstance(payload, str):
        return payload
    try:
        return json.dumps(payload)
    except TypeError:
        return str(payload)


class BflApiError(Exception):
    """Structured error for BFL operations."""

    def __init__(
        self,
        *,
        step: str,
        message: str,
        status_code: int = 0,
        detail: str = "",
        request_url: str = "",
        response_body: str = "",
        bfl_status: str = "",
        env_var: str = "",
    ):
        self.step = step
        self.user_message = message
        self.status_code = status_code
        self.detail = detail
        self.request_url = request_url
        self.response_body = response_body
        self.bfl_status = bfl_status
        self.env_var = env_var
        full_message = f"[{step}] {message}"
        if status_code:
            full_message += f" (HTTP {status_code})"
        if detail:
            full_message += f" — {detail}"
        if bfl_status:
            full_message += f" — status={bfl_status}"
        super().__init__(full_message)

    def to_dict(self) -> dict[str, Any]:
        return {
            "step": self.step,
            "message": self.user_message,
            "detail": self.detail,
            "status_code": self.status_code,
            "request_url": self.request_url,
            "response_body": self.response_body[:1000] if self.response_body else "",
            "bfl_status": self.bfl_status,
            "env_var": self.env_var,
        }


@dataclass
class BflAsyncTask:
    request_id: str
    polling_url: str
    cost: float | None
    input_mp: float | None
    output_mp: float | None


@dataclass
class BflGeneratedImage:
    request_id: str
    model_id: str
    bytes_content: bytes
    content_type: str
    output_format: str
    cost: float | None
    input_mp: float | None
    output_mp: float | None


def _resolve_bfl_api_key() -> str:
    api_key = os.getenv("BFL_API_KEY", "").strip()
    if not api_key:
        raise BflApiError(
            step="validate_bfl_config",
            message="BFL_API_KEY is not configured",
            status_code=500,
            env_var="BFL_API_KEY",
        )
    return api_key


def _resolve_bfl_base_url() -> str:
    configured_url = os.getenv("BFL_BASE_URL", DEFAULT_BFL_BASE_URL).strip()
    return configured_url.rstrip("/") or DEFAULT_BFL_BASE_URL


def _resolve_bfl_model_id() -> str:
    configured_model = os.getenv("BFL_MODEL_ID", DEFAULT_BFL_MODEL_ID).strip()
    return configured_model or DEFAULT_BFL_MODEL_ID


def _raise_for_http_error(response: Any, *, step: str, request_url: str) -> None:
    status_code = getattr(response, "status_code", 0) or 0
    if status_code < 400:
        return

    try:
        payload = response.json()
    except Exception:
        payload = None

    response_text = _safe_str(getattr(response, "text", ""))
    detail = _extract_bfl_error_message(payload, response_text or f"BFL returned HTTP {status_code}")

    raise BflApiError(
        step=step,
        message="BFL request failed",
        status_code=status_code,
        detail=detail,
        request_url=request_url,
        response_body=_serialize_payload(payload) or response_text,
    )


class BflClient:
    """Async client for Black Forest Labs FLUX.2 operations."""

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model_id: Optional[str] = None,
    ):
        self.api_key = api_key or _resolve_bfl_api_key()
        self.base_url = (base_url or _resolve_bfl_base_url()).rstrip("/")
        self.model_id = (model_id or _resolve_bfl_model_id()).strip() or DEFAULT_BFL_MODEL_ID

    def _headers(self) -> dict[str, str]:
        return {
            "accept": "application/json",
            "x-key": self.api_key,
        }

    async def submit_flux_edit(
        self,
        *,
        prompt: str,
        reference_image: bytes,
        additional_reference_images: list[bytes] | None = None,
        width: int | None = None,
        height: int | None = None,
        safety_tolerance: int = 2,
        prompt_upsampling: bool = False,
        seed: Optional[int] = None,
    ) -> BflAsyncTask:
        request_url = f"{self.base_url}/v1/{self.model_id}"
        payload: dict[str, Any] = {
            "prompt": prompt,
            "input_image": base64.b64encode(reference_image).decode("utf-8"),
            "safety_tolerance": safety_tolerance,
            "output_format": DEFAULT_OUTPUT_FORMAT,
        }
        if self.model_id == BFL_FLEX_MODEL_ID:
            payload["prompt_upsampling"] = prompt_upsampling
        else:
            payload["disable_pup"] = not prompt_upsampling

        for index, image_bytes in enumerate(additional_reference_images or [], start=2):
            payload[f"input_image_{index}"] = base64.b64encode(image_bytes).decode("utf-8")

        if width is not None and height is not None:
            payload["width"] = width
            payload["height"] = height

        if seed is not None:
            payload["seed"] = seed

        try:
            async with httpx.AsyncClient(timeout=BFL_SUBMIT_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    request_url,
                    headers={
                        **self._headers(),
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except httpx.TimeoutException as exc:
            raise BflApiError(
                step="submit_flux_edit",
                message="Timed out submitting FLUX.2 request",
                status_code=504,
                detail=str(exc),
                request_url=request_url,
            ) from exc
        except httpx.RequestError as exc:
            raise BflApiError(
                step="submit_flux_edit",
                message="Failed to reach BFL API",
                status_code=502,
                detail=str(exc),
                request_url=request_url,
            ) from exc

        _raise_for_http_error(response, step="submit_flux_edit", request_url=request_url)

        try:
            data = response.json()
        except ValueError as exc:
            raise BflApiError(
                step="submit_flux_edit",
                message="BFL returned invalid JSON",
                status_code=502,
                detail=str(exc),
                request_url=request_url,
                response_body=_safe_str(getattr(response, "text", "")),
            ) from exc

        request_id = _safe_str(data.get("id")) if isinstance(data, dict) else ""
        polling_url = _safe_str(data.get("polling_url")) if isinstance(data, dict) else ""
        if not request_id or not polling_url:
            raise BflApiError(
                step="submit_flux_edit",
                message="BFL response is missing async task metadata",
                status_code=502,
                detail="Expected both id and polling_url in the submission response.",
                request_url=request_url,
                response_body=_serialize_payload(data),
            )

        return BflAsyncTask(
            request_id=request_id,
            polling_url=polling_url,
            cost=_safe_float(data.get("cost")) if isinstance(data, dict) else None,
            input_mp=_safe_float(data.get("input_mp")) if isinstance(data, dict) else None,
            output_mp=_safe_float(data.get("output_mp")) if isinstance(data, dict) else None,
        )

    async def poll_result_url(self, *, polling_url: str) -> str:
        deadline = time.monotonic() + BFL_TOTAL_POLL_SECONDS

        while True:
            if time.monotonic() > deadline:
                raise BflApiError(
                    step="poll_flux_edit",
                    message="Timed out waiting for FLUX.2 result",
                    status_code=504,
                    request_url=polling_url,
                )

            try:
                async with httpx.AsyncClient(timeout=BFL_POLL_TIMEOUT_SECONDS) as client:
                    response = await client.get(
                        polling_url,
                        headers=self._headers(),
                    )
            except httpx.TimeoutException as exc:
                raise BflApiError(
                    step="poll_flux_edit",
                    message="Timed out polling FLUX.2 request",
                    status_code=504,
                    detail=str(exc),
                    request_url=polling_url,
                ) from exc
            except httpx.RequestError as exc:
                raise BflApiError(
                    step="poll_flux_edit",
                    message="Failed while polling BFL API",
                    status_code=502,
                    detail=str(exc),
                    request_url=polling_url,
                ) from exc

            _raise_for_http_error(response, step="poll_flux_edit", request_url=polling_url)

            try:
                data = response.json()
            except ValueError as exc:
                raise BflApiError(
                    step="poll_flux_edit",
                    message="BFL polling returned invalid JSON",
                    status_code=502,
                    detail=str(exc),
                    request_url=polling_url,
                    response_body=_safe_str(getattr(response, "text", "")),
                ) from exc

            status = _safe_str(data.get("status")) if isinstance(data, dict) else ""
            normalized_status = status.lower()

            if normalized_status == "ready":
                result = data.get("result") if isinstance(data, dict) else {}
                sample_url = _safe_str(result.get("sample")) if isinstance(result, dict) else ""
                if not sample_url:
                    raise BflApiError(
                        step="poll_flux_edit",
                        message="BFL result is missing the generated image URL",
                        status_code=502,
                        detail="Expected result.sample when task status is Ready.",
                        request_url=polling_url,
                        response_body=_serialize_payload(data),
                        bfl_status=status,
                    )
                return sample_url

            if normalized_status in {"pending", "processing", "submitted"}:
                await asyncio.sleep(BFL_POLL_INTERVAL_SECONDS)
                continue

            if normalized_status in {
                "request moderated",
                "content moderated",
            }:
                detail = (
                    "The prompt or reference image was flagged before processing began."
                    if normalized_status == "request moderated"
                    else "The generated image was flagged after processing completed."
                )
                raise BflApiError(
                    step="poll_flux_edit",
                    message="BFL moderated this request",
                    status_code=422,
                    detail=detail,
                    request_url=polling_url,
                    response_body=_serialize_payload(data),
                    bfl_status=status,
                )

            if normalized_status in {"error", "failed", "task not found"}:
                detail = _extract_bfl_error_message(
                    data,
                    f"BFL returned status {status or 'unknown'} during polling.",
                )
                raise BflApiError(
                    step="poll_flux_edit",
                    message="BFL failed to complete the request",
                    status_code=502,
                    detail=detail,
                    request_url=polling_url,
                    response_body=_serialize_payload(data),
                    bfl_status=status,
                )

            raise BflApiError(
                step="poll_flux_edit",
                message="BFL returned an unknown polling status",
                status_code=502,
                detail=status or "Empty status value.",
                request_url=polling_url,
                response_body=_serialize_payload(data),
                bfl_status=status,
            )

    async def download_result_image(
        self,
        *,
        result_url: str,
    ) -> tuple[bytes, str]:
        try:
            async with httpx.AsyncClient(
                timeout=BFL_DOWNLOAD_TIMEOUT_SECONDS,
                follow_redirects=True,
            ) as client:
                response = await client.get(result_url)
        except httpx.TimeoutException as exc:
            raise BflApiError(
                step="download_flux_image",
                message="Timed out downloading FLUX.2 result image",
                status_code=504,
                detail=str(exc),
                request_url=result_url,
            ) from exc
        except httpx.RequestError as exc:
            raise BflApiError(
                step="download_flux_image",
                message="Failed to download FLUX.2 result image",
                status_code=502,
                detail=str(exc),
                request_url=result_url,
            ) from exc

        status_code = getattr(response, "status_code", 0) or 0
        if status_code >= 400:
            raise BflApiError(
                step="download_flux_image",
                message="Failed to download FLUX.2 result image",
                status_code=504 if status_code == 504 else 502,
                detail=f"Delivery URL returned HTTP {status_code}",
                request_url=result_url,
                response_body=_safe_str(getattr(response, "text", "")),
            )

        content = getattr(response, "content", b"")
        if not content:
            raise BflApiError(
                step="download_flux_image",
                message="Downloaded FLUX.2 result image is empty",
                status_code=502,
                request_url=result_url,
            )

        content_type = _safe_str(getattr(response, "headers", {}).get("content-type")) or "image/png"
        return content, content_type.split(";")[0].strip().lower() or "image/png"

    async def generate_flux_edit(
        self,
        *,
        prompt: str,
        reference_image: bytes,
        additional_reference_images: list[bytes] | None = None,
        width: int | None = None,
        height: int | None = None,
        safety_tolerance: int = 2,
        prompt_upsampling: bool = False,
        seed: Optional[int] = None,
    ) -> BflGeneratedImage:
        task = await self.submit_flux_edit(
            prompt=prompt,
            reference_image=reference_image,
            additional_reference_images=additional_reference_images,
            width=width,
            height=height,
            safety_tolerance=safety_tolerance,
            prompt_upsampling=prompt_upsampling,
            seed=seed,
        )
        result_url = await self.poll_result_url(polling_url=task.polling_url)
        bytes_content, content_type = await self.download_result_image(result_url=result_url)

        return BflGeneratedImage(
            request_id=task.request_id,
            model_id=self.model_id,
            bytes_content=bytes_content,
            content_type=content_type,
            output_format=DEFAULT_OUTPUT_FORMAT,
            cost=task.cost,
            input_mp=task.input_mp,
            output_mp=task.output_mp,
        )
