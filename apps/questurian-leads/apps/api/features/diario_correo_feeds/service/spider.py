"""
Scrapy spider for scraping Diario Correo Gastronomia articles.

This page embeds article data in a Fusion content cache JSON blob,
so we parse that instead of relying on brittle DOM selectors.
"""

from typing import Dict, Any, Optional
import json
import re

import scrapy


class DiarioCorreoGastronomiaSpider(scrapy.Spider):
    """Spider for scraping Diario Correo Gastronomia section."""

    name = "diario_correo_gastronomia"

    custom_settings = {
        "DOWNLOAD_DELAY": 1,
        "CONCURRENT_REQUESTS": 1,
        "RETRY_ENABLED": True,
        "RETRY_TIMES": 3,
        "RETRY_HTTP_CODES": [500, 502, 503, 504, 408, 429],
        "DOWNLOAD_TIMEOUT": 30,
        "USER_AGENT": "Mozilla/5.0 (compatible; LeadsManager/1.0)",
    }

    start_urls = ["https://diariocorreo.pe/gastronomia/"]

    def parse(self, response):
        """
        Extract article data from Fusion.contentCache JSON.
        """
        script = self._find_content_cache_script(response.text)
        if not script:
            self.logger.error("No Fusion content cache script found")
            return

        cache = self._extract_content_cache(script)
        if not cache:
            return

        feed_data = self._get_section_feed(cache, section="/gastronomia")
        if not feed_data:
            self.logger.error("Gastronomia feed data not found in content cache")
            return

        elements = feed_data.get("content_elements", [])
        for element in elements[:15]:
            if element.get("type") != "story":
                continue

            title = self._get_title(element)
            url = element.get("website_url") or element.get("canonical_url")
            if url and not url.startswith("http"):
                url = response.urljoin(url)

            published_at = (
                element.get("display_date")
                or element.get("publish_date")
                or element.get("first_publish_date")
            )
            excerpt = self._get_excerpt(element)
            image_url = self._get_image_url(element, response)

            if title and url:
                yield {
                    "url": url,
                    "title": title.strip(),
                    "published_at": published_at,
                    "section": "gastronomia",
                    "image_url": image_url,
                    "excerpt": excerpt,
                    "language": "es",
                    "source": "diariocorreo",
                }
            else:
                self.logger.warning("Skipping article - missing title or URL")

    def _find_content_cache_script(self, html: str) -> str:
        scripts = re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)
        for script in scripts:
            if "Fusion.contentCache" in script:
                return script
        if scripts:
            return max(scripts, key=len)
        return ""

    def _extract_content_cache(self, script: str) -> Optional[Dict[str, Any]]:
        match = re.search(
            r"Fusion\\.contentCache=({.*?});(?:\\s*Fusion\\.|\\s*$)",
            script,
            re.S,
        )
        if not match:
            self.logger.error("Fusion.contentCache not found")
            return None
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError as exc:
            self.logger.error(f"Failed to parse Fusion content cache: {exc}")
            return None

    def _get_section_feed(self, cache: Dict[str, Any], section: str) -> Optional[Dict[str, Any]]:
        feeds = cache.get("story-feed-by-section", {})
        if not feeds:
            return None

        for key, value in feeds.items():
            if f'\"section\":\"{section}\"' in key and '\"feedOffset\":0' in key:
                return value.get("data")

        for key, value in feeds.items():
            if section in key:
                return value.get("data")

        return None

    def _get_title(self, element: Dict[str, Any]) -> Optional[str]:
        headlines = element.get("headlines", {}) if isinstance(element, dict) else {}
        return (
            headlines.get("basic")
            or headlines.get("web")
            or headlines.get("mobile")
        )

    def _get_excerpt(self, element: Dict[str, Any]) -> Optional[str]:
        description = element.get("description", {}) if isinstance(element, dict) else {}
        excerpt = description.get("basic")
        if not excerpt:
            subheadlines = element.get("subheadlines", {}) if isinstance(element, dict) else {}
            excerpt = subheadlines.get("basic")

        if excerpt:
            return excerpt.strip()[:500]
        return None

    def _get_image_url(self, element: Dict[str, Any], response) -> Optional[str]:
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
                for key in ("landscape_md", "landscape_s", "landscape_xs", "landscape_l", "story_small", "content"):
                    if resized.get(key):
                        image_url = resized[key]
                        break

        if image_url and image_url.startswith("/"):
            image_url = response.urljoin(image_url)

        return image_url
