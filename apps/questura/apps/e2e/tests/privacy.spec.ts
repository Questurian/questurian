import { expect, test } from './fixtures'

/**
 * The privacy text, the terms and the membership FAQ (launch fix plan item 14,
 * decision D2, and handoff 3.3). `/join` linked to all three before any of
 * them existed, so every buyer who clicked one got a 404; Next also prefetched
 * them, so the join page itself logged 404s. Read-only: also runs against the
 * real site.
 */

test('the privacy page answers from the join page and says how to have an account deleted', async ({ page }) => {
  await page.goto('/join')
  await page.getByRole('link', { name: 'Privacy Policy' }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()

  const response = await page.request.get('/privacy')
  expect(response.status()).toBe(200)

  await expect(page.getByRole('heading', { name: 'Deleting your account' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'hello@questurian.com' })).toHaveAttribute('href', /^mailto:hello@questurian\.com/)
  await expect(page.getByText(/we delete your account within 30 days/)).toBeVisible()
})

test('the terms and the membership FAQ answer from the join page', async ({ page }) => {
  for (const { link, path, heading, says } of [
    { link: 'Terms of Service', path: '/terms', heading: 'Terms', says: /You keep access until the end of the period you have paid for/ },
    { link: 'Subscription FAQ', path: '/faq', heading: 'Membership questions', says: /You keep access until the end of the period you have paid for/ },
  ]) {
    await page.goto('/join')
    await page.getByRole('link', { name: link }).click()
    await expect(page).toHaveURL((url) => url.pathname === path)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    expect((await page.request.get(path)).status()).toBe(200)

    await expect(page.getByText(says)).toBeVisible()
    await expect(page.getByRole('link', { name: 'hello@questurian.com' }).first()).toHaveAttribute('href', /^mailto:hello@questurian\.com/)
  }
})
