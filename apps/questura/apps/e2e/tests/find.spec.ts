import { HOME_PATH, SANDBOX, expect, freshEmail, signUp, test } from './fixtures'

/**
 * Journey 9 (launch fix plan item 8): a reader saves an article and removes
 * it again, and finds an article through search.
 *
 * Bookmarking creates a reader, so it runs in the sandbox only. Search only
 * reads: it also runs on the real site when `E2E_SEARCH_QUERY` names a query
 * with exactly one result and `E2E_SEARCH_PATH` the path it leads to.
 */

const SEARCH = {
  query: process.env.E2E_SEARCH_QUERY ?? (SANDBOX ? 'LM-ART-07' : ''),
  path: process.env.E2E_SEARCH_PATH ?? (SANDBOX ? '/zz-launch/hillside/neighbourhoods/launch-article-07' : ''),
}
/** A free article in the sandbox corpus, so its title and body are open to every reader. */
const FREE_ARTICLE = '/zz-launch/hillside/neighbourhoods/launch-article-07'

test('journey 9: a reader bookmarks an article, finds it in Bookmarks, removes it, and it is gone', async ({ page }) => {
  test.skip(!SANDBOX, 'creates a reader: sandbox only')
  await page.goto(HOME_PATH)
  await signUp(page, freshEmail('bookmark'))

  await page.goto(FREE_ARTICLE)
  const title = (await page.locator('h1').first().innerText()).trim()
  const save = page.getByRole('button', { name: 'Bookmark', exact: true }).locator('visible=true').first()
  await save.click()
  const saved = page.getByRole('button', { name: 'Bookmarked', exact: true }).locator('visible=true').first()
  await expect(saved).toHaveAttribute('aria-pressed', 'true')

  // Saved on the server, not only in this page.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Bookmarked', exact: true }).locator('visible=true').first()).toBeVisible()

  await page.goto('/account/bookmarks')
  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toHaveCount(1)
  await row.getByRole('button', { name: 'Bookmarked' }).click()
  // The row leaves the list (or shows unsaved while it goes).
  await expect(row.getByRole('button', { name: 'Bookmarked' })).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('Nothing saved yet')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0)

  await page.goto(FREE_ARTICLE)
  await expect(page.getByRole('button', { name: 'Bookmark', exact: true }).locator('visible=true').first()).toHaveAttribute('aria-pressed', 'false')
})

test('journey 9: search from the menu finds the article and opens it; a query with no match says so', async ({ page }) => {
  test.skip(!SEARCH.query || !SEARCH.path, 'set E2E_SEARCH_QUERY and E2E_SEARCH_PATH to run on the real site')
  await page.goto(HOME_PATH)
  await page.getByRole('button', { name: 'Open menu modal' }).locator('visible=true').first().click()
  const field = page.getByRole('searchbox', { name: 'Search articles' }).or(page.getByLabel('Search articles'))
  await field.first().fill(SEARCH.query)
  await field.first().press('Enter')

  await expect(page).toHaveURL((url) => url.pathname === '/search' && url.searchParams.get('q') === SEARCH.query)
  await expect(page.getByRole('heading', { name: `Search results for “${SEARCH.query}”` })).toBeVisible()
  await expect(page.getByText('1 result', { exact: true })).toBeVisible()

  await page.locator(`main a[href="${SEARCH.path}"]`).locator('visible=true').first().click()
  await expect(page).toHaveURL((url) => url.pathname === SEARCH.path)
  await expect(page.locator('h1').first()).toBeVisible()

  // The search page's own field: a query nothing matches.
  const nothing = `zq${Date.now().toString(36)}nothing`
  await page.goto(`/search?q=${SEARCH.query}`)
  const own = page.locator('main input[name=q]')
  await own.fill(nothing)
  await own.press('Enter')
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === nothing)
  await expect(page.getByText(`No results for “${nothing}”.`)).toBeVisible()
})
