"""Uploaded file byte validation."""

from typing import List

from fastapi import UploadFile

from .errors import _raise_http_error


MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_BFL_ADDITIONAL_REFERENCE_IMAGES = 7


async def _read_upload_file(file: UploadFile, step: str) -> bytes:
    """Read and validate uploaded file bytes."""
    if not file.filename:
        _raise_http_error(status_code=400, message='No file provided', step=step)
    content = await file.read()
    if not content:
        _raise_http_error(
            status_code=400, message='Empty file', step=step, filename=file.filename
        )
    if len(content) > MAX_FILE_SIZE:
        _raise_http_error(
            status_code=400,
            message='File too large (max 10MB)',
            step=step,
            filename=file.filename,
            size_bytes=len(content),
            max_size_bytes=MAX_FILE_SIZE,
        )
    return content


async def _read_additional_reference_images(files: List[UploadFile]) -> List[bytes]:
    normalized_files = [file for file in files if file and file.filename]
    if len(normalized_files) > MAX_BFL_ADDITIONAL_REFERENCE_IMAGES:
        _raise_http_error(
            status_code=400,
            message='FLUX.2 accepts up to 7 additional reference images',
            step='validate_additional_reference_images',
            additional_reference_count=len(normalized_files),
            max_additional_reference_images=MAX_BFL_ADDITIONAL_REFERENCE_IMAGES,
        )
    image_bytes: List[bytes] = []
    for file in normalized_files:
        image_bytes.append(
            await _read_upload_file(file, step='validate_additional_reference_image')
        )
    return image_bytes
