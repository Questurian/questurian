"""
Helper script to inspect El Comercio page and identify correct CSS selectors.
Run this to see the HTML structure and find the right selectors.
"""

import asyncio
from playwright.async_api import async_playwright


async def inspect_page():
    """Fetch page with Playwright and show HTML structure."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        page.set_default_timeout(60000)  # 60 second timeout

        print("Loading page...")
        try:
            await page.goto('https://elcomercio.pe/archivo/gastronomia/', wait_until='domcontentloaded', timeout=60000)
        except Exception as e:
            print(f"Page load error (continuing anyway): {e}")

        # Wait a bit for content to render
        await asyncio.sleep(3)

        # Scroll to trigger infinite scroll
        print("Scrolling to load more articles...")
        for i in range(3):
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            await asyncio.sleep(2)

        print("\n=== Looking for article containers ===")

        # Try multiple possible selectors for article containers
        selectors_to_try = [
            'article',
            '.story-card',
            '.article-item',
            '.card',
            '.post',
            '[class*="story"]',
            '[class*="article"]',
            '[class*="card"]',
        ]

        for selector in selectors_to_try:
            try:
                elements = await page.query_selector_all(selector)
                if elements:
                    print(f"\n✓ Found {len(elements)} elements with selector: {selector}")

                    # Get HTML of first element
                    if elements:
                        html = await elements[0].inner_html()
                        print(f"First element HTML (truncated):")
                        print(html[:500])
                        print("...")
            except Exception as e:
                print(f"✗ Selector '{selector}' error: {e}")

        # Get page content sample
        print("\n=== Page body sample ===")
        body_html = await page.content()
        print(body_html[:1000])

        await browser.close()


if __name__ == "__main__":
    asyncio.run(inspect_page())
