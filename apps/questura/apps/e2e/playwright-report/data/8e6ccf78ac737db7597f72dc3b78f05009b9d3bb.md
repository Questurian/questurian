# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: membership.spec.ts >> a member signs in and the article opens, then signs out and it locks again
- Location: tests/membership.spec.ts:15:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Sign in' }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('button', { name: 'Sign in' }).first() with timeout 5000ms
  - waiting for getByRole('button', { name: 'Sign in' }).first()

```

```yaml
- heading "404" [level=1]
- paragraph: Page Not Found
- paragraph: The page you're looking for doesn't exist or has been moved.
- link "Return to Home":
  - /url: /
- status
- alert
```

# Test source

```ts
  1  | import { ACCOUNTS, MEMBER_ARTICLE, expect, expectSignedIn, signIn, signOut, test } from './fixtures'
  2  | 
  3  | /**
  4  |  * The paywall, in a real browser. Cookies, redirects and each engine's own
  5  |  * cookie and tracking rules only show up here, not in route tests.
  6  |  */
  7  | 
  8  | test('an anonymous reader sees the paywall and no member text', async ({ page }) => {
  9  |   await page.goto(MEMBER_ARTICLE.path)
  10 | 
  11 |   await expect(page.locator('[data-paywalled]')).toBeVisible()
  12 |   await expect(page.getByText(MEMBER_ARTICLE.memberOnlyText)).toHaveCount(0)
  13 | })
  14 | 
  15 | test('a member signs in and the article opens, then signs out and it locks again', async ({ page, context }) => {
  16 |   await page.goto(MEMBER_ARTICLE.path)
  17 |   await signIn(page, ACCOUNTS.member)
  18 |   await expectSignedIn(page)
  19 | 
  20 |   await page.reload()
  21 |   await expect(page.getByText(MEMBER_ARTICLE.memberOnlyText).first()).toBeVisible()
  22 |   await expect(page.locator('[data-paywalled]')).toHaveCount(0)
  23 | 
  24 |   await signOut(page)
> 25 |   await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible()
     |                                                                       ^ Error: expect(locator).toBeVisible() failed
  26 |   const sessionCookies = (await context.cookies()).filter((c) => c.name.includes('questura_visitor.session'))
  27 |   expect(sessionCookies).toEqual([])
  28 | 
  29 |   await page.reload()
  30 |   await expect(page.locator('[data-paywalled]')).toBeVisible()
  31 |   await expect(page.getByText(MEMBER_ARTICLE.memberOnlyText)).toHaveCount(0)
  32 | })
  33 | 
  34 | test('a signed-in non-member still sees the paywall', async ({ page }) => {
  35 |   await page.goto(MEMBER_ARTICLE.path)
  36 |   await signIn(page, ACCOUNTS.nonmember)
  37 |   await expectSignedIn(page)
  38 | 
  39 |   await page.reload()
  40 |   await expect(page.locator('[data-paywalled]')).toBeVisible()
  41 |   await expect(page.getByText(MEMBER_ARTICLE.memberOnlyText)).toHaveCount(0)
  42 | })
  43 | 
```