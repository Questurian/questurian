from typing import Optional
from urllib.parse import urljoin

import feedparser

from features.feed.schema.models import FeedEntry, FeedMeta, FeedResponse
from lib.dates import to_isoformat
from utils.html_cleaning import extract_first_image_url


def _get_field(obj, key: str) -> Optional[str]:
    if obj is None:
        return None
    if hasattr(obj, "get"):
        return obj.get(key)
    return getattr(obj, key, None)


def _entry_content(entry) -> Optional[str]:
    content = _get_field(entry, "content")
    if isinstance(content, list) and content:
        first = content[0]
        if isinstance(first, dict):
            return first.get("value")
        return getattr(first, "value", None)
    return None


def _entry_image(entry) -> Optional[str]:
    """Extract image URL from RSS entry.

    Checks multiple sources in order of preference:
    1. media:thumbnail
    2. media:content
    3. enclosures (image/* MIME types)
    """
    # Try media_thumbnail
    media_thumbnail = _get_field(entry, "media_thumbnail")
    if media_thumbnail:
        if isinstance(media_thumbnail, list) and media_thumbnail:
            thumb = media_thumbnail[0]
            if isinstance(thumb, dict):
                url = thumb.get("url")
                if url:
                    return url

    # Try media_content
    media_content = _get_field(entry, "media_content")
    if media_content:
        if isinstance(media_content, list):
            for item in media_content:
                if isinstance(item, dict):
                    medium = item.get("medium")
                    url = item.get("url")
                    # Prefer items explicitly marked as image
                    if medium == "image" and url:
                        return url
                    # Fallback to any media_content with URL
                    if url and not medium:
                        return url

    # Try enclosures (podcasts, media files)
    enclosures = _get_field(entry, "enclosures")
    if enclosures and isinstance(enclosures, list):
        for enclosure in enclosures:
            if isinstance(enclosure, dict):
                url = enclosure.get("url") or enclosure.get("href")
                mime_type = enclosure.get("type", "")
                if url and mime_type.startswith("image/"):
                    return url

    return None


def parse_feed(url: str) -> FeedResponse:
    feed = feedparser.parse(url)

    meta = FeedMeta(
        title=_get_field(feed.feed, "title"),
        link=_get_field(feed.feed, "link"),
        subtitle=_get_field(feed.feed, "subtitle")
        or _get_field(feed.feed, "description"),
        language=_get_field(feed.feed, "language"),
        updated=to_isoformat(_get_field(feed.feed, "updated_parsed")),
        published=to_isoformat(_get_field(feed.feed, "published_parsed")),
        author=_get_field(feed.feed, "author"),
    )

    entries = []
    feed_link = _get_field(feed.feed, "link")

    for entry in feed.entries:
        entry_id = (
            _get_field(entry, "id")
            or _get_field(entry, "guid")
            or _get_field(entry, "link")
        )
        entry_link = _get_field(entry, "link")
        summary = _get_field(entry, "summary") or _get_field(entry, "description")
        content = _entry_content(entry)
        image_url = _entry_image(entry)
        if not image_url:
            image_url = extract_first_image_url(content) or extract_first_image_url(summary)
        if image_url:
            base_url = entry_link or feed_link
            if base_url:
                image_url = urljoin(base_url, image_url)
        entries.append(
            FeedEntry(
                id=entry_id,
                title=_get_field(entry, "title"),
                link=entry_link,
                summary=summary,
                content=content,
                published=to_isoformat(_get_field(entry, "published_parsed")),
                updated=to_isoformat(_get_field(entry, "updated_parsed")),
                author=_get_field(entry, "author"),
                image_url=image_url,
            )
        )

    bozo = bool(getattr(feed, "bozo", False))
    bozo_exception = None
    if bozo:
        exception = getattr(feed, "bozo_exception", None)
        bozo_exception = str(exception) if exception else None

    return FeedResponse(
        feed=meta,
        entries=entries,
        bozo=bozo,
        bozo_exception=bozo_exception,
    )
