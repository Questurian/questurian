import { ACCOUNTS, MEMBER_ARTICLE, expect, expectSignedIn, signIn, test } from './fixtures'

/** The session cookie contract (launch harness B6), as the browser stores it. */

test('the session cookie is HttpOnly, Secure, SameSite=Lax, __Secure- prefixed, and unreadable from page JavaScript', async ({ page, context }) => {
  await page.goto(MEMBER_ARTICLE.path)
  await signIn(page, ACCOUNTS.member)
  await expectSignedIn(page)

  const session = (await context.cookies()).filter((c) => c.name.includes('questura_visitor.session_token'))
  expect(session).toHaveLength(1)
  const [cookie] = session
  expect(cookie!.name.startsWith('__Secure-')).toBe(true)
  expect(cookie!.httpOnly).toBe(true)
  expect(cookie!.secure).toBe(true)
  expect(cookie!.sameSite).toBe('Lax')

  expect(await page.evaluate(() => document.cookie)).not.toContain('session_token')
})

test('a wrong password signs nobody in and leaves no session cookie', async ({ page, context }) => {
  await page.goto(MEMBER_ARTICLE.path)
  await signIn(page, { email: ACCOUNTS.memberB.email, password: 'definitely-not-the-password-1' })

  await expect(page.locator('input[name=password]')).toBeVisible()
  const session = (await context.cookies()).filter((c) => c.name.includes('questura_visitor.session'))
  expect(session).toEqual([])
})
