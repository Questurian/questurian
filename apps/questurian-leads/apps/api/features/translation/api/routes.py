from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from features.translation.schema import (
    TranslationRequest,
    TranslationResponse,
    TranslationStats,
    OverallStats
)
from features.translation.service.content_translator import ContentTranslator

router = APIRouter(prefix="/translate", tags=["translation"])


@router.post("/batch", response_model=TranslationResponse)
def translate_batch(request: TranslationRequest) -> TranslationResponse:
    """
    Trigger batch translation for a specific content type.

    - **content_type**: Type of content to translate (leads, instagram_posts, reddit_posts)
    - **feed_id**: Optional feed ID to filter content
    - **limit**: Optional limit on number of items to translate
    """
    translator = ContentTranslator()

    try:
        if request.content_type == "leads":
            stats = translator.translate_leads(feed_id=request.feed_id, limit=request.limit)
        elif request.content_type == "instagram_posts":
            stats = translator.translate_instagram_posts(feed_id=request.feed_id, limit=request.limit)
        elif request.content_type == "reddit_posts":
            stats = translator.translate_reddit_posts(feed_id=request.feed_id, limit=request.limit)
        else:
            raise HTTPException(status_code=400, detail=f"Invalid content_type: {request.content_type}")

        return TranslationResponse(
            content_type=request.content_type,
            stats=TranslationStats(**stats),
            message=f"Translated {stats['translated']} items, {stats['already_english']} were already in English"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")


@router.post("/leads", response_model=TranslationResponse)
def translate_leads(
    feed_id: Optional[int] = Query(None, description="Filter by feed ID"),
    limit: Optional[int] = Query(None, description="Maximum items to translate")
) -> TranslationResponse:
    """Translate RSS leads (convenience endpoint)."""
    translator = ContentTranslator()
    stats = translator.translate_leads(feed_id=feed_id, limit=limit)

    return TranslationResponse(
        content_type="leads",
        stats=TranslationStats(**stats),
        message=f"Translated {stats['translated']} leads"
    )


@router.post("/instagram-posts", response_model=TranslationResponse)
def translate_instagram_posts(
    feed_id: Optional[int] = Query(None, description="Filter by Instagram feed ID"),
    limit: Optional[int] = Query(None, description="Maximum items to translate")
) -> TranslationResponse:
    """Translate Instagram posts."""
    translator = ContentTranslator()
    stats = translator.translate_instagram_posts(feed_id=feed_id, limit=limit)

    return TranslationResponse(
        content_type="instagram_posts",
        stats=TranslationStats(**stats),
        message=f"Translated {stats['translated']} Instagram posts"
    )


@router.post("/reddit-posts", response_model=TranslationResponse)
def translate_reddit_posts(
    feed_id: Optional[int] = Query(None, description="Filter by Reddit feed ID"),
    limit: Optional[int] = Query(None, description="Maximum items to translate")
) -> TranslationResponse:
    """Translate Reddit posts."""
    translator = ContentTranslator()
    stats = translator.translate_reddit_posts(feed_id=feed_id, limit=limit)

    return TranslationResponse(
        content_type="reddit_posts",
        stats=TranslationStats(**stats),
        message=f"Translated {stats['translated']} Reddit posts"
    )


@router.get("/stats", response_model=OverallStats)
def get_translation_stats() -> OverallStats:
    """Get overall translation statistics across all content types."""
    translator = ContentTranslator()
    stats = translator.get_translation_stats()
    return OverallStats(**stats)


@router.post("/detect-languages")
def detect_missing_languages(force: bool = False):
    """
    Detect language for all content that has NULL detected_language.
    Set force=true to re-detect ALL content (useful for fixing incorrect detections).
    """
    translator = ContentTranslator()
    if force:
        result = translator.redetect_all_languages()
    else:
        result = translator.detect_missing_languages()
    return {
        "message": "Language detection complete",
        "leads_updated": result["leads_updated"],
        "instagram_updated": result["instagram_updated"],
        "reddit_updated": result["reddit_updated"]
    }
