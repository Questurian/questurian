import type { Expect, Page } from '@playwright/test'

import { HOME_PATH, expect as defaultExpect, expectImagesDecode, expectNoHorizontalScroll } from './fixtures'

/**
 * Journeys that more than one spec walks: journey 1 runs as itself
 * (`browse.spec.ts`), on phones (journey 11, the phone projects in
 * `playwright.config.ts`) and on a slow connection (journey 12,
 * `slow.spec.ts`). Not a spec file, so Playwright never collects it alone.
 */

const segments = (path: string) => path.split('/').filter(Boolean).length
const pathOf = (page: Page) => new URL(page.url()).pathname

/** The first visible same-site link whose path has `count` segments (not an author page). */
async function linkWithSegments(page: Page, count: number, notTo: string, expect: Expect) {
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

async function expectRealPage(page: Page, expect: Expect) {
  const heading = page.locator('h1').first()
  await expect(heading).toBeVisible()
  await expect(heading).not.toHaveText('404')
}

export type BrowseOptions = {
  /** An `expect` with longer timeouts, for a slow connection. */
  expect?: Expect
  /** How long every image on a page may take to decode. */
  imageTimeout?: number
}

/**
 * Journey 1: home → city → article → author → back, every page whole, every
 * image decoding and nothing sticking out sideways. Read-only, so it also runs
 * against the real site (`E2E_BASE_URL`, where `/` redirects to the default
 * city).
 */
export async function browseJourney(page: Page, { expect = defaultExpect, imageTimeout }: BrowseOptions = {}) {
  const whole = async () => {
    await expectRealPage(page, expect)
    await expectNoHorizontalScroll(page)
  }
  const home = await page.goto(HOME_PATH)
  expect(home?.status()).toBe(200)
  await whole()
  await expectImagesDecode(page, imageTimeout)

  // The real site's home already is its default city.
  if (segments(pathOf(page)) !== 2) {
    await (await linkWithSegments(page, 2, pathOf(page), expect)).click()
    await expect.poll(() => segments(pathOf(page))).toBe(2)
    await whole()
    await expectImagesDecode(page, imageTimeout)
  }
  const city = pathOf(page)

  await (await linkWithSegments(page, 4, city, expect)).click()
  await expect.poll(() => segments(pathOf(page))).toBe(4)
  const article = pathOf(page)
  await whole()
  await expectImagesDecode(page, imageTimeout)

  await page.locator('a[href^="/authors/"]').locator('visible=true').first().click()
  await expect.poll(() => pathOf(page)).toMatch(/^\/authors\/[^/]+$/)
  await whole()

  await page.goBack()
  await expect.poll(() => pathOf(page)).toBe(article)
  await expectRealPage(page, expect)

  await page.goBack()
  await expect.poll(() => pathOf(page)).toBe(city)
  await expectRealPage(page, expect)
}
