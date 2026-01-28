from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from features.translation.schema import (
    TranslationRequest,
    TranslationResponse,
    TranslationStats,
    OverallStats,
    TranslateReviewsRequest,
    TranslateReviewsResponse,
    TranslateReviewsItem,
)
from features.translation.service.content_translator import ContentTranslator
from features.translation.service.translator import get_translator

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


@router.post("/reviews", response_model=TranslateReviewsResponse)
def translate_reviews(request: TranslateReviewsRequest) -> TranslateReviewsResponse:
    """
    Translate review text and title fields to English.
    """
    translator = get_translator()
    total = len(request.reviews)
    translated = 0
    already_english = 0
    errors = 0
    skipped = 0

    translated_reviews: list[TranslateReviewsItem] = []

    for review in request.reviews:
        review_data = review.dict()
        has_field = False
        has_error = False
        has_translation = False
        has_already_english = False

        for field in request.fields_to_translate:
            value = review_data.get(field)
            if value is None or (isinstance(value, str) and not value.strip()):
                continue

            has_field = True
            translated_text, status = translator.translate_text(
                value,
                source=request.source_language or "auto",
                target="en",
            )

            if status == "translated":
                has_translation = True
                review_data[field] = translated_text
            elif status == "already_english":
                has_already_english = True
                review_data[field] = value
            elif status == "empty":
                review_data[field] = value
            else:
                has_error = True
                review_data[field] = value

        if not has_field:
            skipped += 1
        elif has_error:
            errors += 1
        elif has_translation:
            translated += 1
        elif has_already_english:
            already_english += 1
        else:
            skipped += 1

        translated_reviews.append(TranslateReviewsItem(**review_data))

    stats = TranslationStats(
        total=total,
        translated=translated,
        already_english=already_english,
        errors=errors,
        skipped=skipped,
    )

    return TranslateReviewsResponse(
        reviews=translated_reviews,
        stats=stats,
        message=f"Translated {translated} reviews, {already_english} already in English",
    )
