from __future__ import annotations

from parsel import Selector
import urllib.parse


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    return cleaned or None


def _absolute_url(url: str | None, base_url: str) -> str | None:
    if not url:
        return None
    if url.startswith("http"):
        return url
    return urllib.parse.urljoin(base_url, url)


def extract_archive_items(html: str, base_url: str) -> list[dict]:
    selector = Selector(text=html)
    items: list[dict] = []

    for article in selector.css(".story-item"):
        title = _clean_text(article.css("a.story-item__title::text").get())
        url = article.css("a.story-item__title::attr(href)").get()
        published_at = _clean_text(article.css(".story-item__date-time::text").get())
        image_url = (
            article.css("img.story-item__img::attr(src)").get()
            or article.css("img.story-item__img::attr(data-src)").get()
        )
        excerpt = _clean_text(article.css("p.story-item__subtitle::text").get())

        if title and url:
            items.append(
                {
                    "url": _absolute_url(url, base_url),
                    "title": title,
                    "published_at": published_at,
                    "section": "gastronomia",
                    "image_url": _absolute_url(image_url, base_url),
                    "excerpt": excerpt[:500] if excerpt else None,
                    "language": "es",
                    "source": "elcomercio",
                }
            )

    return items
