import type { Page } from '@playwright/test'

import { ACCOUNTS, HOME_PATH, MEMBER_ARTICLE, SANDBOX, expect, expectSignedIn, freshEmail, signIn, signUp, test } from './fixtures'

/**
 * `/account` threw React error #418 (a hydration mismatch) in the production
 * build (launch fix plan item 8). The page's Suspense boundary hydrates in its
 * own pass; by then the navbar's `/api/me` had answered, so a signed-out
 * reader's first client render was `null` where the server had sent a
 * spinner. `useAuth` now answers as the server did while hydrating.
 *
 * The console gate fails any page error; these name the #418 case outright,
 * opening `/account` as a fresh page load, which is what hydrates.
 */

function pageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test('#418: a signed-out reader opening /account hydrates cleanly and is sent to sign in', async ({ page }) => {
  const errors = pageErrors(page)
  // Warm the identity lookup first, as a reader arriving from an article does.
  await page.goto(MEMBER_ARTICLE.path)
  await page.goto('/account')
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).not.toBe('/account')
  expect(errors.filter((message) => /#418|hydrat/i.test(message))).toEqual([])
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

    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Your Account' })).toBeVisible()
    await expect(page.getByText(account.email).first()).toBeVisible()
    expect(errors.filter((message) => /#418|hydrat/i.test(message))).toEqual([])
  })
}

test('#418: a reader reloading /account over and over never gets a hydration error', async ({ page }) => {
  // The second cause (launch fix plan item 8b): Next streamed metadata into a
  // hidden <div> ahead of <html>, and on a fast load it was sometimes missing
  // from the client's tree when hydration began. About one load in thirty
  // threw #418 at the (private) layout's first element. Fixed by blocking
  // metadata for every reader (`htmlLimitedBots` in next.config.ts).
  test.skip(!SANDBOX, 'creates a reader: sandbox only')
  const errors = pageErrors(page)
  await page.goto(HOME_PATH)
  await signUp(page, freshEmail('reload'))
  for (let load = 0; load < 25; load += 1) {
    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Your Account' })).toBeVisible()
  }
  expect(errors.filter((message) => /#418|hydrat/i.test(message))).toEqual([])
})
