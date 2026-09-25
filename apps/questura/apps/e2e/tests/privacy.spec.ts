import { allowProblems, expect, test } from './fixtures'

/**
 * The privacy text (launch fix plan item 14, decision D2). `/join` linked to
 * `/privacy` before the page existed, so every buyer who clicked it got a 404.
 * Read-only: also runs against the real site.
 */

test('the privacy page answers from the join page and says how to have an account deleted', async ({ page }) => {
  // `/terms` and `/faq`, linked beside Privacy on /join, do not exist yet
  // (owner content); Next prefetches them and gets a 404.
  allowProblems(page, /^http 404: GET \S+\/(terms|faq)(\?_rsc=\S+)?$/, '/terms and /faq are not written yet')
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
