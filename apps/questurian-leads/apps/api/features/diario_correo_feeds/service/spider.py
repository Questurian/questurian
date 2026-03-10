"""
Scrapy spider for scraping Diario Correo Gastronomia articles.

This page embeds article data in a Fusion content cache JSON blob,
so we parse that instead of relying on brittle DOM selectors.
"""

import scrapy

from features.diario_correo_feeds.service.parser import extract_section_items


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
        items = extract_section_items(
            response.text,
            feed_url=response.url,
            section_slug="gastronomia",
        )
        if not items:
            self.logger.error("No Diario Correo items found in Fusion.contentCache")
            return

        self.logger.info("Found %s Diario Correo items", len(items))
        for item in items[:15]:
            yield item
