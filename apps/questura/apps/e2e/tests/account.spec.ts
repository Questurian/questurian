import type { Page } from '@playwright/test'

import { ACCOUNTS, MEMBER_ARTICLE, SANDBOX, expect, expectSignedIn, signIn, test } from './fixtures'

/**
 * `/account` threw React error #418 (a hydration mismatch) in the production
 * build (launch fix plan item 8). The page's Suspense boundary hydrates in its
 * own pass; by then the navbar's `/api/me` had answered, so a signed-out
 * reader's first client render was `null` where the server had sent a
 * spinner. `useAuth` now answers as the server did while hydrating. That
 * cause failed every load.
 *
 * A second, rarer cause remains (part b): about one fast load in seventy,
 * React 19.1 replays a layout's <div> mid-hydration without rewinding its
 * hydration cursor and throws #418 at the layout's first element. React
 * recovers by rendering the page again in the browser; the reader sees the
 * page. No safe fix exists in this codebase (a Suspense boundary under the
 * layouts stops it but turns every 404 into a 200), so it is allowlisted in
 * `fixtures.ts` and these tests allow at most one #418 in four loads: the
 * first cause fails all four, the race almost never two.
 */

function pageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

const hydrationErrors = (errors: string[]) => errors.filter((message) => /#418|hydrat/i.test(message))
const LOADS = 4

test('#418: a signed-out reader opening /account hydrates cleanly and is sent to sign in', async ({ page }) => {
  const errors = pageErrors(page)
  for (let load = 0; load < LOADS; load += 1) {
    // Warm the identity lookup first, as a reader arriving from an article does.
    await page.goto(MEMBER_ARTICLE.path)
    await page.goto('/account')
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).not.toBe('/account')
  }
  expect(hydrationErrors(errors).length, JSON.stringify(hydrationErrors(errors))).toBeLessThanOrEqual(1)
})

for (const [label, account] of [
  // member-b in the sandbox, so member-a's sign-in budget (per account, per minute) is not spent twice over; launch day's one account otherwise.
  ['a member', SANDBOX ? ACCOUNTS.memberB : ACCOUNTS.member],
  ['a signed-in non-member', ACCOUNTS.nonmember],
] as const) {
  test(`#418: ${label} opening /account hydrates cleanly and sees the account`, async ({ page }) => {
    test.skip(!SANDBOX && label !== 'a member', 'launch day has one dedicated account')
    const errors = pageErrors(page)
    await page.goto(MEMBER_ARTICLE.path)
    await signIn(page, account)
    await expectSignedIn(page)

    for (let load = 0; load < LOADS; load += 1) {
      await page.goto('/account')
      await expect(page.getByRole('heading', { name: 'Your Account' })).toBeVisible()
      await expect(page.getByText(account.email).first()).toBeVisible()
    }
    expect(hydrationErrors(errors).length, JSON.stringify(hydrationErrors(errors))).toBeLessThanOrEqual(1)
  })
}
