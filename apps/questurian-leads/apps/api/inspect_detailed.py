"""
Detailed inspection of El Comercio article structure.
"""

import asyncio
from playwright.async_api import async_playwright


async def inspect_articles():
    """Get detailed info about first few articles."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        page.set_default_timeout(60000)

        print("Loading page...")
        await page.goto('https://elcomercio.pe/archivo/gastronomia/', wait_until='domcontentloaded', timeout=60000)
        await asyncio.sleep(3)

        # Scroll once
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        await asyncio.sleep(2)

        # Find article containers
        print("\n=== Analyzing article structure ===")
        articles = await page.query_selector_all('.story-item')
        print(f"Found {len(articles)} .story-item elements")

        # Analyze first 3 articles
        for i, article in enumerate(articles[:3]):
            print(f"\n--- Article {i+1} ---")

            # Try to get title
            title_elem = await article.query_selector('h2, h3, .story-item__title, [itemprop="headline"]')
            if title_elem:
                title = await title_elem.inner_text()
                print(f"Title: {title.strip()[:80]}...")

            # Try to get URL
            link_elem = await article.query_selector('a[itemprop="url"], a.story-item__title-link, a')
            if link_elem:
                url = await link_elem.get_attribute('href')
                print(f"URL: {url}")

            # Try to get date
            date_elem = await article.query_selector('.story-item__date-time, time, [itemprop="datePublished"]')
            if date_elem:
                date_text = await date_elem.inner_text()
                print(f"Date: {date_text}")

            # Try to get image
            img_elem = await article.query_selector('img')
            if img_elem:
                img_src = await img_elem.get_attribute('src')
                img_data_src = await img_elem.get_attribute('data-src')
                print(f"Image src: {img_src}")
                print(f"Image data-src: {img_data_src}")

            # Try to get excerpt/description
            desc_elem = await article.query_selector('.story-item__description, [itemprop="description"], p')
            if desc_elem:
                desc = await desc_elem.inner_text()
                print(f"Excerpt: {desc.strip()[:100]}...")

            # Get full HTML for debugging
            html = await article.inner_html()
            print(f"\nFull HTML (first 500 chars):")
            print(html[:500])
            print("...")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(inspect_articles())
