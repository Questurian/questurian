"""API routes for image processing and upload."""

from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Header
from fastapi.responses import JSONResponse

from .image_processor import process_image_variants, ImageVariantType
from .payload_client import upload_image_set, PayloadClient


router = APIRouter(prefix="/images", tags=["images"])


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    external_ref: str = Form(..., description="Unique reference for this image set (e.g., staged article ID)"),
    alt_text: str = Form(..., description="Alt text for accessibility"),
    authorization: Optional[str] = Header(None)
) -> JSONResponse:
    """
    Upload an image and process it into 5 variants server-side.
    
    The image will be:
    1. Processed into 5 variants (thumbnail, square, wide, portrait, hero)
    2. Converted to WebP format with 85% quality
    3. Uploaded to Payload CMS as media-assets
    4. Linked in a new MediaSet
    
    Returns the MediaSet ID which can be used for featured images in articles.
    """
    # Validate authorization
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header required with Bearer token")
    
    jwt_token = authorization.replace("Bearer ", "")
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Read file content
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    
    # Validate file size (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    
    try:
        # Process image into variants
        variants = process_image_variants(
            source_buffer=content,
            original_filename=file.filename,
            alt_text=alt_text
        )
        
        # Upload variants and create MediaSet
        result = await upload_image_set(
            jwt_token=jwt_token,
            external_ref=external_ref,
            alt_text=alt_text,
            variants=variants
        )
        
        return JSONResponse({
            "success": True,
            "mediaSetId": result["mediaSetId"],
            "externalRef": external_ref,
            "variantAssetIds": result.get("variantAssetIds", {}),
            "variants": {
                variant_type.value: {
                    "filename": variant.filename,
                    "width": variant.width,
                    "height": variant.height,
                    "size": variant.file_size
                }
                for variant_type, variant in variants.items()
            }
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process image: {str(e)}")


@router.post("/upload-variants")
async def upload_image_variants(
    variants: List[UploadFile] = File(..., description="The 5 variant image files"),
    variant_types: List[str] = Form(..., description="Types for each variant (thumbnail, square, wide, portrait, hero)"),
    external_ref: str = Form(..., description="Unique reference for this image set"),
    alt_text: str = Form(..., description="Alt text for accessibility"),
    authorization: Optional[str] = Header(None)
) -> JSONResponse:
    """
    Upload pre-processed image variants (client-side cropped) to Payload CMS.
    
    This endpoint accepts 5 already-cropped variant files and:
    1. Uploads each to Payload CMS as media-assets
    2. Creates a MediaSet linking all variants
    
    Use this after client-side cropping with react-easy-crop.
    
    Returns the MediaSet ID.
    """
    # Validate authorization
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header required with Bearer token")
    
    jwt_token = authorization.replace("Bearer ", "")
    
    # Validate counts match
    if len(variants) != len(variant_types):
        raise HTTPException(status_code=400, detail="Number of variants must match number of variant types")
    
    if len(variants) != 5:
        raise HTTPException(status_code=400, detail="Exactly 5 variants required")
    
    # Validate variant types
    valid_types = {'thumbnail', 'square', 'wide', 'portrait', 'hero'}
    if not all(t in valid_types for t in variant_types):
        raise HTTPException(status_code=400, detail=f"Invalid variant types. Must be: {valid_types}")
    
    try:
        client = PayloadClient(jwt_token)
        
        # Check if MediaSet already exists
        existing = await client.find_media_set_by_external_ref(external_ref)
        if existing:
            return JSONResponse({
                "success": True,
                "mediaSetId": str(existing['id']),
                "externalRef": external_ref,
                "variantAssetIds": {},
                "variants": {}
            })
        
        # Read all variant files and upload to Payload
        variant_files = []
        for variant_file, variant_type in zip(variants, variant_types):
            content = await variant_file.read()
            variant_files.append({
                'type': variant_type,
                'filename': variant_file.filename or f"{variant_type}.webp",
                'content': content,
                'content_type': variant_file.content_type or 'image/webp'
            })
        
        # Find thumbnail to create MediaSet first
        thumbnail_file = next((v for v in variant_files if v['type'] == 'thumbnail'), None)
        if not thumbnail_file:
            raise HTTPException(status_code=400, detail="Thumbnail variant required")
        
        # Upload thumbnail first to create MediaSet
        from .image_processor import ProcessedVariant
        thumbnail_variant = ProcessedVariant(
            variant_type=ImageVariantType.THUMBNAIL,
            buffer=thumbnail_file['content'],
            filename=thumbnail_file['filename'],
            width=150,
            height=150,
            content_type=thumbnail_file['content_type'],
            file_size=len(thumbnail_file['content'])
        )
        thumbnail_id = await client.upload_image(thumbnail_variant, alt_text)
        
        # Create MediaSet with thumbnail
        media_set_id = await client.create_media_set(
            external_ref=external_ref,
            alt_text=alt_text,
            thumbnail_id=thumbnail_id,
            square_id=thumbnail_id,
            wide_id=thumbnail_id,
            portrait_id=thumbnail_id,
            hero_id=thumbnail_id
        )
        
        # Upload remaining variants
        variant_asset_ids = {'thumbnail': thumbnail_id}
        variant_specs = {
            'thumbnail': (150, 150),
            'square': (600, 600),
            'wide': (1200, 675),
            'portrait': (600, 800),
            'hero': (1920, 1080)
        }
        
        for vf in variant_files:
            if vf['type'] == 'thumbnail':
                continue
                
            width, height = variant_specs[vf['type']]
            variant_obj = ProcessedVariant(
                variant_type=ImageVariantType(vf['type']),
                buffer=vf['content'],
                filename=vf['filename'],
                width=width,
                height=height,
                content_type=vf['content_type'],
                file_size=len(vf['content'])
            )
            asset_id = await client.upload_image(variant_obj, alt_text, media_set_id)
            variant_asset_ids[vf['type']] = asset_id
        
        return JSONResponse({
            "success": True,
            "mediaSetId": media_set_id,
            "externalRef": external_ref,
            "variantAssetIds": variant_asset_ids,
            "variants": {
                vf['type']: {
                    "filename": vf['filename'],
                    "size": len(vf['content'])
                }
                for vf in variant_files
            }
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload variants: {str(e)}")


@router.post("/process-only")
async def process_image_only(
    file: UploadFile = File(...),
    alt_text: str = Form(default="", description="Alt text for accessibility")
) -> JSONResponse:
    """
    Process an image into 5 variants without uploading to Payload.
    
    This is useful for testing the image processing pipeline.
    Returns metadata about the processed variants.
    """
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Read file content
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    
    # Validate file size (max 10MB)
    max_size = 10 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    
    try:
        # Process image into variants
        variants = process_image_variants(
            source_buffer=content,
            original_filename=file.filename,
            alt_text=alt_text
        )
        
        return JSONResponse({
            "success": True,
            "original_filename": file.filename,
            "original_size": len(content),
            "variants": {
                variant_type.value: {
                    "filename": variant.filename,
                    "width": variant.width,
                    "height": variant.height,
                    "content_type": variant.content_type,
                    "size": variant.file_size
                }
                for variant_type, variant in variants.items()
            }
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process image: {str(e)}")
