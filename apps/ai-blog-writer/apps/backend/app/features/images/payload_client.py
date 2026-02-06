"""Payload CMS API client for uploading images and creating MediaSets."""

import json
import os
from typing import Optional
import aiohttp

from .image_processor import ImageVariantType, ProcessedVariant


PAYLOAD_API_URL = os.getenv("PAYLOAD_API_URL", "http://localhost:4000")


class PayloadClient:
    """Async client for Payload CMS media operations."""
    
    def __init__(self, jwt_token: Optional[str] = None):
        self.api_url = PAYLOAD_API_URL.rstrip('/')
        self.jwt_token = jwt_token
    
    def _get_headers(self) -> dict:
        """Get request headers with auth if available."""
        headers = {}
        if self.jwt_token:
            # Location Manager uses JWT format, not Bearer
            headers['Authorization'] = f'JWT {self.jwt_token}'
        return headers
    
    async def upload_image(
        self,
        variant: ProcessedVariant,
        alt_text: str,
        media_set_id: Optional[str] = None
    ) -> str:
        """
        Upload a single image variant to Payload CMS media-assets.
        
        Args:
            variant: The processed image variant
            alt_text: Alt text for the image
            media_set_id: Optional MediaSet ID to link this variant to
            
        Returns:
            The created media-asset ID
        """
        url = f"{self.api_url}/api/media-assets"
        headers = self._get_headers()
        
        # Prepare multipart form data (match Location Manager format exactly)
        # Field order matters: file first, then _payload
        data = aiohttp.FormData()
        
        # Add the file FIRST (important!)
        data.add_field(
            'file',
            variant.buffer,
            filename=variant.filename,
            content_type=variant.content_type
        )
        
        # Build _payload object with metadata (match Location Manager exactly)
        payload = {
            'alt_text': alt_text,
            'photographer_credit': '',  # Always included even if empty
            'variant': variant.variant_type.value,
        }
        if media_set_id:
            # Payload expects relationship IDs as integers, not strings
            payload['mediaSet'] = int(media_set_id)
            print(f"[Payload] Adding mediaSet to payload: {media_set_id}")
        
        # Add _payload as JSON string
        payload_json = json.dumps(payload)
        print(f"[Payload] _payload: {payload_json}")
        data.add_field('_payload', payload_json)
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, data=data) as response:
                response_text = await response.text()
                print(f"[Payload] Upload response status: {response.status}")
                print(f"[Payload] Upload response body: {response_text[:500]}")
                
                if response.status >= 400:
                    raise Exception(f"Failed to upload image: {response.status} - {response_text}")
                
                result = json.loads(response_text)
                asset_id = result.get('doc', {}).get('id')
                print(f"[Payload] Got asset_id: {asset_id}")
                return str(asset_id) if asset_id else None
    
    async def create_media_set(
        self,
        title: str,
        alt_text: str,
        external_ref: str,
    ) -> str:
        """
        Create a MediaSet in Payload CMS.
        Matches Location Manager: only title, alt_text, externalRef (NO variant fields!)
        Variants are linked automatically when uploading media-assets with mediaSet field.
        
        Args:
            title: Title for the media set
            alt_text: Alt text for the images
            external_ref: Unique external reference
            
        Returns:
            The created MediaSet ID
        """
        url = f"{self.api_url}/api/media-sets"
        headers = {**self._get_headers(), 'Content-Type': 'application/json'}
        
        # Match Location Manager PayloadMediaSetData exactly
        payload = {
            'title': title,
            'alt_text': alt_text,
            'externalRef': external_ref,
        }
        
        print(f"[Payload] Creating MediaSet with: {payload}")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                response_text = await response.text()
                print(f"[Payload] MediaSet create response: {response.status} - {response_text[:200]}")
                
                if response.status >= 400:
                    raise Exception(f"Failed to create MediaSet: {response.status} - {response_text}")
                
                result = json.loads(response_text)
                media_set_id = str(result['doc']['id'])
                print(f"[Payload] Created MediaSet: {media_set_id}")
                return media_set_id
    
    async def find_media_set_by_external_ref(self, external_ref: str) -> Optional[dict]:
        """
        Find a MediaSet by its external reference.
        
        Args:
            external_ref: The external reference to search for
            
        Returns:
            The MediaSet document if found, None otherwise
        """
        url = f"{self.api_url}/api/media-sets"
        headers = self._get_headers()
        params = {
            'where[externalRef][equals]': external_ref,
            'limit': 1
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, params=params) as response:
                if response.status >= 400:
                    error_text = await response.text()
                    raise Exception(f"Failed to find MediaSet: {response.status} - {error_text}")
                
                result = await response.json()
                docs = result.get('docs', [])
                return docs[0] if docs else None


async def upload_image_set(
    jwt_token: str,
    external_ref: str,
    alt_text: str,
    variants: dict[ImageVariantType, ProcessedVariant]
) -> dict:
    """
    Upload all image variants and create a MediaSet (server-side processing).
    Matches Location Manager flow:
    1. Create MediaSet first (empty, no variants)
    2. Upload all variants with mediaSet reference
    
    Args:
        jwt_token: JWT token for Payload authentication
        external_ref: Unique reference (e.g., staged article ID)
        alt_text: Alt text for the images
        variants: Dictionary of processed variants
        
    Returns:
        Dictionary with mediaSetId and variantAssetIds
    """
    client = PayloadClient(jwt_token)

    # Check if MediaSet already exists
    existing = await client.find_media_set_by_external_ref(external_ref)
    if existing:
        # Only return early if MediaSet is complete (all variants uploaded)
        if existing.get('status') == 'complete':
            return {
                "mediaSetId": str(existing['id']),
                "variantAssetIds": {}
            }
        # MediaSet exists but is partial - use it and upload variants
        media_set_id = str(existing['id'])
        print(f"[Payload] Found partial MediaSet: {media_set_id}, uploading variants")
    else:
        # ⭐ STEP 1: Create MediaSet first (empty, like Location Manager)
        media_set_id = await client.create_media_set(
            title=external_ref,
            alt_text=alt_text,
            external_ref=external_ref,
        )
    
    # ⭐ STEP 2: Upload all variants with mediaSet reference
    variant_asset_ids = {}
    
    for variant_type in [ImageVariantType.THUMBNAIL, ImageVariantType.SQUARE, 
                         ImageVariantType.WIDE, ImageVariantType.PORTRAIT, ImageVariantType.HERO]:
        asset_id = await client.upload_image(variants[variant_type], alt_text, media_set_id)
        variant_asset_ids[variant_type.value] = asset_id
    
    return {
        "mediaSetId": media_set_id,
        "variantAssetIds": variant_asset_ids
    }
