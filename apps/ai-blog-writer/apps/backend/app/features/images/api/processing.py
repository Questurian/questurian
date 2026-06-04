"""Local image processing routes."""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ..image_processor import process_image_variants
from ..shared import _raise_http_error, _read_upload_file, logger

router = APIRouter()


@router.post("/process-only")
async def process_image_only(
    file: UploadFile = File(...),
    alt_text: str = Form(default="", description="Alt text for accessibility"),
) -> JSONResponse:
    """Process an image into all required variants without uploading to Payload."""
    content = await _read_upload_file(file, step="validate_file")

    try:
        variants = process_image_variants(
            source_buffer=content,
            original_filename=file.filename or "upload.jpg",
            alt_text=alt_text,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to process image in /images/process-only")
        _raise_http_error(
            status_code=500,
            message="Failed to process image",
            step="process_image_variants",
            detail=str(exc),
        )

    return JSONResponse(
        {
            "success": True,
            "original_filename": file.filename,
            "original_size": len(content),
            "variants": {
                variant_type.value: {
                    "filename": variant.filename,
                    "width": variant.width,
                    "height": variant.height,
                    "content_type": variant.content_type,
                    "size": variant.file_size,
                }
                for variant_type, variant in variants.items()
            },
        }
    )
