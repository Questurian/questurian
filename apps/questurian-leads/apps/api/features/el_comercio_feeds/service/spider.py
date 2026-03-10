"""
Scrapy spider for scraping El Comercio Gastronomía articles.

IMPORTANT: The CSS selectors in this spider are PLACEHOLDERS and must be
verified by manually inspecting https://elcomercio.pe/archivo/gastronomia/
in a browser before use.

To inspect:
1. Open https://elcomercio.pe/archivo/gastronomia/ in Chrome
2. Open DevTools (F12) → Elements tab
3. Locate article cards and identify correct selectors for:
   - Article container
   - Title
   - URL
   - Published date
   - Image
   - Excerpt
4. Update the selectors below with the correct ones
"""

import scrapy
from scrapy_playwright.page import PageMethod

from features.el_comercio_feeds.service.parser import extract_archive_items


class ElComercioGastronomiaSpider(scrapy.Spider):
    """Spider for scraping El Comercio Gastronomía archive page."""

    name = "el_comercio_gastronomia"

    custom_settings = {
        'PLAYWRIGHT_LAUNCH_OPTIONS': {
            'headless': True,
        },
        'DOWNLOAD_DELAY': 2,  # Conservative delay (2 seconds)
        'CONCURRENT_REQUESTS': 1,  # Sequential requests only
        'RETRY_ENABLED': True,
        'RETRY_TIMES': 3,
        'RETRY_HTTP_CODES': [500, 502, 503, 504, 408, 429],
        'DOWNLOAD_TIMEOUT': 30,
        'USER_AGENT': 'Mozilla/5.0 (compatible; LeadsManager/1.0)',
    }

    def start_requests(self):
        """Start request with Playwright for JavaScript rendering."""
        yield scrapy.Request(
            url='https://elcomercio.pe/archivo/gastronomia/',
            meta={
                'playwright': True,
                'playwright_page_methods': [
                    # Wait for initial articles to load
                    PageMethod('wait_for_selector', 'article, .story-card, .article-item', timeout=10000),

                    # Scroll to load more articles (infinite scroll)
                    # Scroll 3 times with 2-second waits to ensure we get 15+ articles
                    PageMethod('evaluate', 'window.scrollTo(0, document.body.scrollHeight)'),
                    PageMethod('wait_for_timeout', 2000),

                    PageMethod('evaluate', 'window.scrollTo(0, document.body.scrollHeight)'),
                    PageMethod('wait_for_timeout', 2000),

                    PageMethod('evaluate', 'window.scrollTo(0, document.body.scrollHeight)'),
                    PageMethod('wait_for_timeout', 2000),
                ],
            },
            callback=self.parse,
            errback=self.errback_close_page,
        )

    def parse(self, response):
        items = extract_archive_items(response.text, response.url)
        self.logger.info("Found %s El Comercio archive items", len(items))
        for item in items[:15]:
            yield item

    async def errback_close_page(self, failure):
        """Close Playwright page on error."""
        page = failure.request.meta.get("playwright_page")
        if page:
            await page.close()
