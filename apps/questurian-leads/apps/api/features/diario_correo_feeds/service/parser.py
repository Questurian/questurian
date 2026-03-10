from __future__ import annotations

from typing import Any, Optional
import json
import re
import urllib.parse

FUSION_CONTENT_CACHE_PATTERN = re.compile(
    r"Fusion\.contentCache=({.*?});(?:\s*Fusion\.|\s*$)",
    re.S,
)


def extract_content_cache(html: str) -> Optional[dict[str, Any]]:
    scripts = re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)
    script = next((s for s in scripts if "Fusion.contentCache" in s), "")
    if not script:
        return None

    match = FUSION_CONTENT_CACHE_PATTERN.search(script)
    if not match:
        return None

    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


def get_section_feed(cache: dict[str, Any], section: str) -> Optional[dict[str, Any]]:
    feeds = cache.get("story-feed-by-section", {})
    if not feeds:
        return None

    for key, value in feeds.items():
        if f'"section":"{section}"' in key and '"feedOffset":0' in key:
            return value.get("data")

    for key, value in feeds.items():
        if section in key:
            return value.get("data")

    return None


def get_title(element: dict[str, Any]) -> Optional[str]:
    headlines = element.get("headlines", {}) if isinstance(element, dict) else {}
    return headlines.get("basic") or headlines.get("web") or headlines.get("mobile")


def get_excerpt(element: dict[str, Any]) -> Optional[str]:
    description = element.get("description", {}) if isinstance(element, dict) else {}
    excerpt = description.get("basic")
    if not excerpt:
        subheadlines = element.get("subheadlines", {}) if isinstance(element, dict) else {}
        excerpt = subheadlines.get("basic")
    return excerpt.strip()[:500] if excerpt else None


def get_image_url(element: dict[str, Any], base_url: str) -> Optional[str]:
    promo_items = element.get("promo_items", {}) if isinstance(element, dict) else {}
    if not isinstance(promo_items, dict):
        return None

    basic = promo_items.get("basic")
    if not isinstance(basic, dict):
        return None

    image_url = basic.get("url")
    if not image_url:
        resized = basic.get("resized_urls", {})
        if isinstance(resized, dict):
            for key in (
                "landscape_md",
                "landscape_s",
                "landscape_xs",
                "landscape_l",
                "story_small",
                "content",
            ):
                if resized.get(key):
                    image_url = resized[key]
                    break

    if image_url and image_url.startswith("/"):
        image_url = urllib.parse.urljoin(base_url, image_url)

    return image_url


def extract_section_items(html: str, *, feed_url: str, section_slug: str) -> list[dict]:
    cache = extract_content_cache(html)
    if not cache:
        return []

    section = f"/{section_slug.lstrip('/')}"
    feed_data = get_section_feed(cache, section)
    if not feed_data:
        return []

    items: list[dict] = []
    for element in feed_data.get("content_elements", []):
        if element.get("type") != "story":
            continue

        title = get_title(element)
        url = element.get("website_url") or element.get("canonical_url")
        if url and not url.startswith("http"):
            url = urllib.parse.urljoin(feed_url, url)

        if title and url:
            items.append(
                {
                    "url": url,
                    "title": title.strip(),
                    "published_at": (
                        element.get("display_date")
                        or element.get("publish_date")
                        or element.get("first_publish_date")
                    ),
                    "section": section_slug,
                    "image_url": get_image_url(element, feed_url),
                    "excerpt": get_excerpt(element),
                    "language": "es",
                    "source": "diariocorreo",
                }
            )

    return items
