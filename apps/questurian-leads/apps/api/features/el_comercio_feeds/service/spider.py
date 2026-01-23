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
from typing import Dict, Any


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
        """
        Parse article data from the page.

        Selectors verified from actual El Comercio page structure:
        - Container: .story-item
        - Title: a.story-item__title
        - URL: a.story-item__title::attr(href)
        - Date: .story-item__date-time (format: DD/MM/YYYY)
        - Image: img.story-item__img::attr(src)
        - Excerpt: p.story-item__subtitle
        """

        # Get all article containers
        articles = response.css('.story-item')

        self.logger.info(f"Found {len(articles)} articles")

        # Limit to first 15 articles
        for article in articles[:15]:
            try:
                # Extract title
                title = article.css('a.story-item__title::text').get()

                # Extract URL
                url = article.css('a.story-item__title::attr(href)').get()

                # Make URL absolute if relative
                if url and not url.startswith('http'):
                    url = response.urljoin(url)

                # Extract date (format: DD/MM/YYYY)
                date_parts = article.css('.story-item__date-time::text').getall()
                published_at = date_parts[0] if date_parts else None

                # Extract image URL
                image_url = article.css('img.story-item__img::attr(src)').get()

                # Make image URL absolute if relative
                if image_url and not image_url.startswith('http'):
                    image_url = response.urljoin(image_url)

                # Extract excerpt/description
                excerpt = article.css('p.story-item__subtitle::text').get()

                # Truncate excerpt to ~100 words (500 characters)
                if excerpt:
                    excerpt = excerpt.strip()[:500]

                # Only yield if we have at least title and URL
                if title and url:
                    yield {
                        'url': url,
                        'title': title.strip() if title else None,
                        'published_at': published_at,  # Format: DD/MM/YYYY
                        'section': 'gastronomia',
                        'image_url': image_url,
                        'excerpt': excerpt,
                        'language': 'es',
                        'source': 'elcomercio'
                    }
                else:
                    self.logger.warning(f"Skipping article - missing title or URL")

            except Exception as e:
                # Skip individual article failures
                self.logger.error(f"Failed to parse article: {e}")
                continue

    async def errback_close_page(self, failure):
        """Close Playwright page on error."""
        page = failure.request.meta.get("playwright_page")
        if page:
            await page.close()
