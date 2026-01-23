from fastapi import APIRouter, HTTPException, Query

from features.feed.schema.models import FeedResponse
from features.feed.service.parser import parse_feed
from utils.validation import InvalidUrlError, validate_feed_url

router = APIRouter(prefix="/feed", tags=["feed"])


@router.get("", response_model=FeedResponse)
def get_feed(url: str = Query(..., description="Feed URL to parse")) -> FeedResponse:
    try:
        validated_url = validate_feed_url(url)
    except InvalidUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return parse_feed(validated_url)
