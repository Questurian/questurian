from __future__ import annotations

from typing import Any, Optional
import json
from parsel import Selector
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


def _clean_text(value: str | None) -> Optional[str]:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    return cleaned or None


def _clean_joined_text(values: list[str]) -> Optional[str]:
    return _clean_text(" ".join(value.strip() for value in values if value and value.strip()))


def _first_attr(selector: Selector, queries: list[str]) -> Optional[str]:
    for query in queries:
        value = selector.css(query).get()
        cleaned = _clean_text(value)
        if cleaned:
            return cleaned
    return None


def _first_text(selector: Selector, queries: list[str]) -> Optional[str]:
    for query in queries:
        value = _clean_joined_text(selector.css(query).getall())
        if value:
            return value
    return None


def _parse_srcset(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    first_candidate = value.split(",")[0].strip()
    if not first_candidate:
        return None
    return first_candidate.split(" ")[0].strip() or None


def extract_section_items_from_dom(html: str, *, feed_url: str, section_slug: str) -> list[dict]:
    selector = Selector(text=html)
    section_path = f"/{section_slug.lstrip('/')}/"
    containers = selector.css("article, .story-card, .article-item, .news-item, .post-item")
    items: list[dict] = []
    seen_urls: set[str] = set()

    for container in containers:
        url = _first_attr(
            container,
            [
                f'a[href*="{section_path}"]::attr(href)',
                "h2 a::attr(href)",
                "h3 a::attr(href)",
                "a::attr(href)",
            ],
        )
        if not url:
            continue

        absolute_url = urllib.parse.urljoin(feed_url, url)
        if section_path.rstrip("/") not in absolute_url:
            continue
        if absolute_url in seen_urls:
            continue

        title = _first_text(
            container,
            [
                f'a[href*="{section_path}"]::text',
                f'a[href*="{section_path}"] *::text',
                "h2 a::text",
                "h2 a *::text",
                "h3 a::text",
                "h3 a *::text",
                "a::text",
                "a *::text",
            ],
        )
        if not title:
            continue

        published_at = _first_attr(
            container,
            [
                "time::attr(datetime)",
            ],
        ) or _first_text(
            container,
            [
                "time::text",
                "time *::text",
                '[class*="date"]::text',
                '[class*="date"] *::text',
                '[class*="time"]::text',
                '[class*="time"] *::text',
            ],
        )
        image_url = _first_attr(
            container,
            [
                "img::attr(src)",
                "img::attr(data-src)",
                "img::attr(data-original)",
            ],
        )
        if not image_url:
            image_url = _parse_srcset(_first_attr(container, ["source::attr(srcset)"]))

        excerpt = _first_text(
            container,
            [
                '[class*="subtitle"]::text',
                '[class*="subtitle"] *::text',
                '[class*="summary"]::text',
                '[class*="summary"] *::text',
                '[class*="description"]::text',
                '[class*="description"] *::text',
                "p::text",
                "p *::text",
            ],
        )

        items.append(
            {
                "url": absolute_url,
                "title": title,
                "published_at": published_at,
                "section": section_slug,
                "image_url": (
                    urllib.parse.urljoin(feed_url, image_url)
                    if image_url and image_url.startswith("/")
                    else image_url
                ),
                "excerpt": excerpt[:500] if excerpt else None,
                "language": "es",
                "source": "diariocorreo",
            }
        )
        seen_urls.add(absolute_url)

    return items


def extract_section_items(html: str, *, feed_url: str, section_slug: str) -> list[dict]:
    cache = extract_content_cache(html)
    if cache:
        section = f"/{section_slug.lstrip('/')}"
        feed_data = get_section_feed(cache, section)
        if feed_data:
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
            if items:
                return items

    return extract_section_items_from_dom(html, feed_url=feed_url, section_slug=section_slug)
