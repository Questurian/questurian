import { ACCOUNTS, MEMBER_ARTICLE, expect, expectSignedIn, signIn, signOut, test } from './fixtures'

/**
 * The paywall, in a real browser. Cookies, redirects and each engine's own
 * cookie and tracking rules only show up here, not in route tests.
 */

test('an anonymous reader sees the paywall and no member text', async ({ page }) => {
  await page.goto(MEMBER_ARTICLE.path)

  await expect(page.locator('[data-paywalled]')).toBeVisible()
  await expect(page.getByText(MEMBER_ARTICLE.memberOnlyText)).toHaveCount(0)
})

test('a member signs in and the article opens, then signs out and it locks again', async ({ page, context }) => {
  await page.goto(MEMBER_ARTICLE.path)
  await signIn(page, ACCOUNTS.member)
  await expectSignedIn(page)

  await page.reload()
  await expect(page.getByText(MEMBER_ARTICLE.memberOnlyText).first()).toBeVisible()
  await expect(page.locator('[data-paywalled]')).toHaveCount(0)

  await signOut(page)
  const sessionCookies = (await context.cookies()).filter((c) => c.name.includes('questura_visitor.session'))
  expect(sessionCookies).toEqual([])

  // Sign-out lands on the home page; come back to the article as a reader would.
  await page.goto(MEMBER_ARTICLE.path)
  await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible()
  await expect(page.locator('[data-paywalled]')).toBeVisible()
  await expect(page.getByText(MEMBER_ARTICLE.memberOnlyText)).toHaveCount(0)
})

test('a signed-in non-member still sees the paywall', async ({ page }) => {
  await page.goto(MEMBER_ARTICLE.path)
  await signIn(page, ACCOUNTS.nonmember)
  await expectSignedIn(page)

  await page.reload()
  await expect(page.locator('[data-paywalled]')).toBeVisible()
  await expect(page.getByText(MEMBER_ARTICLE.memberOnlyText)).toHaveCount(0)
})
