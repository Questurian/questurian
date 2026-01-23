"""Get full HTML of one article to analyze structure."""

import asyncio
from playwright.async_api import async_playwright


async def get_article_html():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        page.set_default_timeout(60000)

        await page.goto('https://elcomercio.pe/archivo/gastronomia/', wait_until='domcontentloaded', timeout=60000)
        await asyncio.sleep(3)

        articles = await page.query_selector_all('.story-item')
        if articles:
            html = await articles[0].inner_html()
            print("=== FULL HTML OF FIRST ARTICLE ===")
            print(html)
        else:
            print("No articles found")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(get_article_html())
