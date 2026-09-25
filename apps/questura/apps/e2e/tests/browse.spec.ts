import type { Page } from '@playwright/test'

import { HOME_PATH, expect, expectImagesDecode, test } from './fixtures'

/**
 * Journey 1 (launch fix plan item 8): a reader browses from the front page to
 * a city, an article and its author, then comes back. Read-only, so it also
 * runs against the real site (`E2E_BASE_URL`, where `/` redirects to the
 * default city).
 */

const segments = (path: string) => path.split('/').filter(Boolean).length
const pathOf = (page: Page) => new URL(page.url()).pathname

/** The first visible same-site link whose path has `count` segments (not an author page). */
async function linkWithSegments(page: Page, count: number, notTo: string) {
  const hrefs = await page.locator('a[href^="/"]').evaluateAll((anchors) =>
    anchors.filter((a) => (a as HTMLElement).offsetParent !== null).map((a) => a.getAttribute('href') ?? ''),
  )
  const href = hrefs.find((h) => {
    const path = h.split(/[?#]/)[0]!
    return segments(path) === count && !path.startsWith('/authors/') && path !== notTo
  })
  expect(href, `a visible link with ${count} path segments on ${pathOf(page)}`).toBeTruthy()
  return page.locator(`a[href="${href}"]`).locator('visible=true').first()
}

async function expectRealPage(page: Page) {
  const heading = page.locator('h1').first()
  await expect(heading).toBeVisible()
  await expect(heading).not.toHaveText('404')
}

test('journey 1: home → city → article → author → back, every page whole and every image decoding', async ({ page }) => {
  const home = await page.goto(HOME_PATH)
  expect(home?.status()).toBe(200)
  await expectRealPage(page)
  await expectImagesDecode(page)

  // The real site's home already is its default city.
  if (segments(pathOf(page)) !== 2) {
    await (await linkWithSegments(page, 2, pathOf(page))).click()
    await expect.poll(() => segments(pathOf(page))).toBe(2)
    await expectRealPage(page)
    await expectImagesDecode(page)
  }
  const city = pathOf(page)

  await (await linkWithSegments(page, 4, city)).click()
  await expect.poll(() => segments(pathOf(page))).toBe(4)
  const article = pathOf(page)
  await expectRealPage(page)
  await expectImagesDecode(page)

  await page.locator('a[href^="/authors/"]').locator('visible=true').first().click()
  await expect.poll(() => pathOf(page)).toMatch(/^\/authors\/[^/]+$/)
  await expectRealPage(page)

  await page.goBack()
  await expect.poll(() => pathOf(page)).toBe(article)
  await expectRealPage(page)

  await page.goBack()
  await expect.poll(() => pathOf(page)).toBe(city)
  await expectRealPage(page)
})
