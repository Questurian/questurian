"""Payload CMS API client for uploading images and creating MediaSets."""

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
            headers['Authorization'] = f'Bearer {self.jwt_token}'
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
        
        # Prepare multipart form data
        data = aiohttp.FormData()
        data.add_field('alt', alt_text)
        data.add_field('variant', variant.variant_type.value)
        
        if media_set_id:
            data.add_field('mediaSet', media_set_id)
        
        # Add the file
        data.add_field(
            'file',
            variant.buffer,
            filename=variant.filename,
            content_type=variant.content_type
        )
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, data=data) as response:
                if response.status >= 400:
                    error_text = await response.text()
                    raise Exception(f"Failed to upload image: {response.status} - {error_text}")
                
                result = await response.json()
                return str(result['doc']['id'])
    
    async def create_media_set(
        self,
        external_ref: str,
        alt_text: str,
        thumbnail_id: str,
        square_id: str,
        wide_id: str,
        portrait_id: str,
        hero_id: str
    ) -> str:
        """
        Create a MediaSet in Payload CMS linking all 5 variants.
        
        Args:
            external_ref: Unique external reference (e.g., staged article ID)
            alt_text: Alt text for the images
            thumbnail_id: Media asset ID for thumbnail
            square_id: Media asset ID for square
            wide_id: Media asset ID for wide
            portrait_id: Media asset ID for portrait
            hero_id: Media asset ID for hero
            
        Returns:
            The created MediaSet ID
        """
        url = f"{self.api_url}/api/media-sets"
        headers = {**self._get_headers(), 'Content-Type': 'application/json'}
        
        payload = {
            'externalRef': external_ref,
            'alt': alt_text,
            'thumbnail': thumbnail_id,
            'square': square_id,
            'wide': wide_id,
            'portrait': portrait_id,
            'hero': hero_id,
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                if response.status >= 400:
                    error_text = await response.text()
                    raise Exception(f"Failed to create MediaSet: {response.status} - {error_text}")
                
                result = await response.json()
                return str(result['doc']['id'])
    
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
    Upload all image variants and create a MediaSet.
    
    This is the main entry point that:
    1. Checks if a MediaSet already exists for this external_ref
    2. Uploads all 5 variants to media-assets
    3. Creates a MediaSet linking all variants
    
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
        return {
            "mediaSetId": str(existing['id']),
            "variantAssetIds": {}
        }
    
    # Upload all variants
    # First upload - create MediaSet to get ID
    thumbnail_id = await client.upload_image(variants[ImageVariantType.THUMBNAIL], alt_text)
    
    # Create MediaSet with thumbnail
    media_set_id = await client.create_media_set(
        external_ref=external_ref,
        alt_text=alt_text,
        thumbnail_id=thumbnail_id,
        square_id=thumbnail_id,  # Temporary
        wide_id=thumbnail_id,
        portrait_id=thumbnail_id,
        hero_id=thumbnail_id
    )
    
    # Upload remaining variants linked to MediaSet
    square_id = await client.upload_image(
        variants[ImageVariantType.SQUARE], alt_text, media_set_id
    )
    wide_id = await client.upload_image(
        variants[ImageVariantType.WIDE], alt_text, media_set_id
    )
    portrait_id = await client.upload_image(
        variants[ImageVariantType.PORTRAIT], alt_text, media_set_id
    )
    hero_id = await client.upload_image(
        variants[ImageVariantType.HERO], alt_text, media_set_id
    )
    
    return {
        "mediaSetId": media_set_id,
        "variantAssetIds": {
            "thumbnail": thumbnail_id,
            "square": square_id,
            "wide": wide_id,
            "portrait": portrait_id,
            "hero": hero_id
        }
    }
