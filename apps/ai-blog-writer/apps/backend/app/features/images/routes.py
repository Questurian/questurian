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
    print(f"[upload-variants] Received request: {len(variants)} files, types={variant_types}, ref={external_ref}")
    
    # Validate authorization
    if not authorization or not authorization.startswith("Bearer "):
        print("[upload-variants] Missing authorization header")
        raise HTTPException(status_code=401, detail="Authorization header required with Bearer token")
    
    jwt_token = authorization.replace("Bearer ", "")
    
    # Validate counts match
    if len(variants) != len(variant_types):
        print(f"[upload-variants] Mismatch: {len(variants)} files vs {len(variant_types)} types")
        raise HTTPException(status_code=400, detail="Number of variants must match number of variant types")
    
    if len(variants) != 5:
        print(f"[upload-variants] Wrong number of variants: {len(variants)}")
        raise HTTPException(status_code=400, detail="Exactly 5 variants required")
    
    # Validate variant types
    valid_types = {'thumbnail', 'square', 'wide', 'portrait', 'hero'}
    if not all(t in valid_types for t in variant_types):
        raise HTTPException(status_code=400, detail=f"Invalid variant types. Must be: {valid_types}")
    
    try:
        client = PayloadClient(jwt_token)

        # Read all variant files first (before any API calls)
        variant_files = []
        for variant_file, variant_type in zip(variants, variant_types):
            content = await variant_file.read()
            variant_files.append({
                'type': variant_type,
                'filename': variant_file.filename or f"{variant_type}.webp",
                'content': content,
                'content_type': variant_file.content_type or 'image/webp'
            })

        # Check if MediaSet already exists
        existing = await client.find_media_set_by_external_ref(external_ref)
        if existing:
            # Only return early if MediaSet is complete (all variants uploaded)
            if existing.get('status') == 'complete':
                print(f"[upload-variants] MediaSet {existing['id']} is complete, returning early")
                return JSONResponse({
                    "success": True,
                    "mediaSetId": str(existing['id']),
                    "externalRef": external_ref,
                    "variantAssetIds": {},
                    "variants": {}
                })
            # MediaSet exists but is partial - use it and upload variants
            media_set_id = str(existing['id'])
            print(f"[upload-variants] Found partial MediaSet: {media_set_id}, uploading variants")
        else:
            # ⭐ STEP 1: Create MediaSet FIRST (matches Location Manager exactly)
            # Only title, alt_text, externalRef - NO variant fields!
            print(f"[upload-variants] Creating MediaSet with externalRef: {external_ref}")
            media_set_id = await client.create_media_set(
                title=external_ref,  # Use external_ref as title
                alt_text=alt_text,
                external_ref=external_ref,
            )
            print(f"[upload-variants] Created MediaSet: {media_set_id}")
        
        # ⭐ STEP 2: Upload all variants with mediaSet reference
        from .image_processor import ProcessedVariant
        variant_asset_ids = {}
        variant_specs = {
            'thumbnail': (1200, 800),   # 3:2
            'square': (1080, 1080),     # 1:1
            'wide': (1920, 1080),       # 16:9
            'portrait': (1200, 1500),   # 4:5
            'hero': (2100, 900)         # 21:9
        }
        
        # Define upload order
        upload_order = ['thumbnail', 'square', 'wide', 'portrait', 'hero']
        
        for variant_type in upload_order:
            vf = next((v for v in variant_files if v['type'] == variant_type), None)
            if not vf:
                print(f"[upload-variants] Warning: Missing variant {variant_type}")
                continue
            
            width, height = variant_specs[variant_type]
            variant_obj = ProcessedVariant(
                variant_type=ImageVariantType(variant_type),
                buffer=vf['content'],
                filename=vf['filename'],
                width=width,
                height=height,
                content_type=vf['content_type'],
                file_size=len(vf['content'])
            )
            
            print(f"[upload-variants] Uploading {variant_type} to mediaSet {media_set_id}")
            try:
                asset_id = await client.upload_image(variant_obj, alt_text, media_set_id)
                if asset_id:
                    variant_asset_ids[variant_type] = asset_id
                    print(f"[upload-variants] Uploaded {variant_type}: {asset_id}")
                else:
                    print(f"[upload-variants] ERROR: No asset_id returned for {variant_type}")
            except Exception as e:
                print(f"[upload-variants] ERROR uploading {variant_type}: {e}")
                raise
        
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
