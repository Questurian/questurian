import type { Page } from '@playwright/test'

import { MEMBER_ARTICLE, NEW_PASSWORD, SANDBOX, expect, expectSignedIn, freshEmail, test } from './fixtures'
import { FAKE_STRIPE, deliverWebhook, fakeStripe, mailTo } from './sandbox'

/**
 * Journey 2 (launch fix plan item 8): an anonymous reader hits the paywall,
 * joins, pays and is taken back to the article, now open.
 *
 * The first test only reads, so it also runs against the real site. The
 * purchase itself runs in the sandbox only: its "Stripe" is the fake on
 * :3191, and the payment is told to the app with a webhook signed with the
 * sandbox secret, as `readiness:purchase` does. A real Stripe page is never
 * reached; the test fails if one is asked for.
 */

const ARTICLE = MEMBER_ARTICLE.path

async function paywallToPlans(page: Page) {
  await page.goto(ARTICLE)
  await expect(page.locator('[data-paywalled]')).toBeVisible()
  await expect(page.getByText(MEMBER_ARTICLE.memberOnlyText)).toHaveCount(0)

  await page.getByRole('link', { name: 'Unlock the full guide' }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/join' && url.searchParams.get('returnTo') === ARTICLE)
  // The site always advertises the catalog prices (AGENTS.md, membership pricing).
  await expect(page.getByText('$12.99', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('$79.99', { exact: true }).first()).toBeVisible()
}

test('journey 2: the paywall leads to the plans, at the catalog prices, and the article travels along', async ({ page }) => {
  await paywallToPlans(page)

  await page.getByRole('link', { name: 'Continue with Monthly' }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/purchase/monthly' && url.searchParams.get('returnTo') === ARTICLE)
  await expect(page.getByRole('heading', { name: 'Complete Your Purchase' }).first()).toBeVisible()
})

test('journey 2: a new reader signs up, verifies, pays and lands back on the open article', async ({ page, context }) => {
  test.skip(!SANDBOX, 'writes: sandbox only')
  const email = freshEmail('buyer')
  const since = new Date().toISOString()

  // Never real Stripe, whatever the app asks for.
  let realStripe = 0
  await context.route(/^https:\/\/([a-z-]+\.)?stripe\.com\//, (route) => {
    realStripe += 1
    return route.fulfill({ status: 418, body: 'real Stripe is out of bounds in the sandbox' })
  })
  // The fake's hosted Checkout page is an address, not a page; stand one in.
  await context.route(`${FAKE_STRIPE}/__fake/pay/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Fake Checkout</title><h1>Fake Checkout</h1>' }),
  )

  await paywallToPlans(page)
  await page.getByRole('link', { name: 'Continue with Monthly' }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/purchase/monthly')

  // Sign up inside the purchase page.
  await page.locator('input[name=email]').fill(email)
  await page.getByRole('button', { name: /continue/i }).click()
  await page.locator('input[name=password]').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expectSignedIn(page)

  // The verification mail arrives in the fake mailbox; its link verifies.
  const verification = await mailTo(email, /verif/i, since)
  const link = verification.links.find((href) => href.includes('verify-email'))
  expect(link, `a verify-email link in ${JSON.stringify(verification.links)}`).toBeTruthy()
  await page.goto(link!)

  // Back to the purchase, as the reader would, and pay.
  await page.goto(`/purchase/monthly?returnTo=${encodeURIComponent(ARTICLE)}`)
  const subscribe = page.getByRole('button', { name: /^Subscribe Now/ })
  await expect(subscribe).toBeEnabled()
  await expect(page.getByText(/email isn.t verified/i)).toHaveCount(0)
  await subscribe.click()
  await page.waitForURL(new RegExp(`^${FAKE_STRIPE}/__fake/pay/`))
  const sessionId = new URL(page.url()).pathname.split('/').pop()!

  const paid = await fakeStripe(`/__fake/checkout/${sessionId}/complete`, { email })
  expect(await deliverWebhook('checkout.session.completed', paid.session)).toBe(200)

  // Stripe sends the buyer to the success URL, with the session id filled in.
  const session = paid.session as { success_url?: string }
  expect(session.success_url).toContain('/subscription/success')
  await page.goto(session.success_url!.replace('{CHECKOUT_SESSION_ID}', sessionId))

  // The success page waits for membership, then returns the reader to the article.
  await expect(page).toHaveURL((url) => url.pathname === ARTICLE, { timeout: 15_000 })
  await expect(page.getByText(MEMBER_ARTICLE.memberOnlyText).first()).toBeVisible()
  await expect(page.locator('[data-paywalled]')).toHaveCount(0)
  expect(realStripe).toBe(0)
})
