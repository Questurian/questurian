import { expect, test } from './fixtures'

/**
 * Where `?returnTo=` may send a reader (#663). The browser's own URL parser
 * turns a backslash into a slash and drops tabs, so these would leave the
 * site if the guard trusted a prefix check.
 */
const OFF_SITE = ['/%5Cevil.example', '/%5C/evil.example', '/%09/evil.example', '//evil.example', 'https://evil.example']

for (const returnTo of OFF_SITE) {
  test(`the sign-in callback never follows returnTo=${returnTo} off the site`, async ({ page, baseURL }) => {
    await page.goto(`/auth?returnTo=${returnTo}`)
    await page.waitForLoadState('networkidle')

    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin)
  })
}
