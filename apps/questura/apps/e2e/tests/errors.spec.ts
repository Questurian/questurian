import { SANDBOX, allowProblems, expect, test } from './fixtures'
import { edgeFault } from './sandbox'

/**
 * Journey 10 (launch fix plan item 8): what a reader sees when a page is not
 * there, and when the API is down while an article is being put together.
 *
 * The missing pages only read, so they also run against the real site. The
 * outage is made at the sandbox's front door (`front-door-edge.ts`), so it
 * runs in the sandbox only.
 */

const suffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

for (const [label, path] of [
  ['a made-up address', () => `/no-such-place-${suffix()}`],
  ['a missing article in a real city', () => `/zz-launch/harbor/food-and-drink/no-such-article-${suffix()}`],
] as const) {
  test(`journey 10: ${label} is a real 404, with the site's navigation`, async ({ page }) => {
    const missing = path()
    if (!SANDBOX && missing.startsWith('/zz-launch')) test.skip(true, 'the sandbox city exists only in the sandbox')
    allowProblems(page, new RegExp(`^http 404: GET \\S+${missing}(\\?_rsc=\\S+)?$`), 'the page this journey asks for does not exist')

    const response = await page.goto(missing)
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
    await expect(page.getByText('Page Not Found')).toBeVisible()
    // The site's own chrome: its menu and its footer, so the reader can go on.
    await expect(page.getByRole('button', { name: 'Open menu modal' }).locator('visible=true').first()).toBeVisible()
    await expect(page.locator('footer')).toBeVisible()
    await page.getByRole('link', { name: 'Return to Home' }).click()
    await expect(page).not.toHaveURL((url) => url.pathname === missing)
  })
}

test('journey 10: an article the API cannot serve (503) shows the error page, not a blank one', async ({ page }) => {
  test.skip(!SANDBOX, 'breaks the API on purpose: sandbox only')
  // Never prerendered, so the page is put together on demand, from the API.
  const article = `/zz-launch/harbor/food-and-drink/api-down-${suffix()}`
  allowProblems(page, new RegExp(`^http 500: GET \\S+${article}$`), 'the page this journey breaks answers 500')
  await edgeFault({ status: 503, match: encodeURIComponent(article) })
  try {
    const response = await page.goto(article)
    expect(response?.status()).toBe(500)
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible()
    await expect(page.getByText('This page could not be shown just now.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to the homepage' })).toHaveAttribute('href', '/')
    // Not blank, and not Next's bare built-in page.
    await expect(page.getByText('Internal Server Error')).toHaveCount(0)
    expect((await page.locator('body').innerText()).trim().length).toBeGreaterThan(40)
  } finally {
    await edgeFault(null)
  }

  // Once the API is back the same address is an ordinary 404 again.
  allowProblems(page, new RegExp(`^http 404: GET \\S+${article}(\\?_rsc=\\S+)?$`), 'with the API back, the made-up article is missing')
  expect((await page.goto(article))?.status()).toBe(404)
})
