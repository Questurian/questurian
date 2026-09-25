import { expect, test } from './fixtures'

/**
 * Where `?returnTo=` may send a reader (#663). The browser's own URL parser
 * turns a backslash into a slash and drops tabs, so these would leave the
 * site if the guard trusted a prefix check.
 *
 * Staying on the site is not enough: a page that never redirected at all would
 * pass that. The reader must land exactly where the safe fallback (`/`) takes
 * them (launch fix plan item 8), which on this site is wherever `/` itself
 * redirects: the default city.
 */
const OFF_SITE = ['/%5Cevil.example', '/%5C/evil.example', '/%09/evil.example', '//evil.example', 'https://evil.example']

for (const returnTo of OFF_SITE) {
  test(`the sign-in callback never follows returnTo=${returnTo}, and lands on the safe fallback`, async ({ page, baseURL }) => {
    const home = await page.request.get('/', { maxRedirects: 0 })
    const location = home.headers()['location']
    const fallback = location ? new URL(location, baseURL).pathname : '/'

    await page.goto(`/auth?returnTo=${returnTo}`)

    await expect(page).toHaveURL((url) => url.origin === new URL(baseURL!).origin && url.pathname === fallback, { timeout: 10_000 })
  })
}
