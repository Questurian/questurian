import {
  HOME_PATH,
  NEW_PASSWORD,
  SANDBOX,
  allowProblems,
  expect,
  expectCacheCopyKept,
  expectSignedIn,
  expectNoHorizontalScroll,
  expectSignedOut,
  freshEmail,
  gated,
  signIn,
  signInButton,
  signOut,
  signUp,
  test,
} from './fixtures'
import { FAKE_PROVIDER, expireTokensOf, mailTo } from './sandbox'

/**
 * Journeys 3–5 (launch fix plan item 8): signing up, Google, and a forgotten
 * password, in a real browser. They create readers, so they run in the
 * sandbox only, with fake Google and the fake mailbox on :3192.
 */

test.skip(!SANDBOX, 'creates readers: sandbox only')

test('journey 3: sign up with a password, sign out, sign back in, sign out', async ({ page, context }) => {
  const email = freshEmail('signup')
  await page.goto(HOME_PATH)
  await expectNoHorizontalScroll(page)
  await signUp(page, email)
  await expectNoHorizontalScroll(page)
  expect((await context.cookies()).some((c) => c.name.includes('questura_visitor.session_token'))).toBe(true)

  await signOut(page)
  await page.goto(HOME_PATH)
  await expectSignedOut(page)

  await signIn(page, { email, password: NEW_PASSWORD })
  await expectSignedIn(page)
  await page.reload()
  await expectSignedIn(page)
  await expectNoHorizontalScroll(page)

  await signOut(page)
  expect((await context.cookies()).filter((c) => c.name.includes('questura_visitor.session'))).toEqual([])
})

test('journey 4: sign in with Google (the fake provider) and land back where you started, signed in', async ({ page, context }) => {
  const identity = {
    sub: `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    email: freshEmail('google'),
    email_verified: true,
    name: 'Journey Google',
  }
  // The app hands the browser Google's consent screen. Here the fake answers
  // it (same query string, and who is signed in to "Google"), and the browser
  // is handed the callback the consent screen would have sent it to. Google
  // itself is never reached. (Letting the browser follow the fake's redirect
  // instead trips Chromium, which restarts a cross-site redirect chain into
  // the API host and fails the state check; Firefox follows it fine.)
  let consentScreens = 0
  await context.route('**/api/visitor-auth/sign-in/social', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as { url?: string }
    const google = new URL(body.url ?? '')
    expect(google.origin + google.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const consent = new URL(`${FAKE_PROVIDER}/o/oauth2/v2/auth${google.search}`)
    consent.searchParams.set('readiness_as', Buffer.from(JSON.stringify(identity)).toString('base64url'))
    const answered = await fetch(consent, { redirect: 'manual' })
    expect(answered.status, 'the fake consent screen accepts the request as Google would').toBe(302)
    consentScreens += 1
    await route.fulfill({ response, json: { ...body, url: answered.headers.get('location') } })
  })
  let realGoogle = 0
  await context.route(/^https:\/\/[a-z.]*google(apis)?\.com\//, (route) => {
    realGoogle += 1
    return route.abort()
  })

  await page.goto(HOME_PATH)
  const start = new URL(page.url()).pathname
  await signInButton(page).click()
  await page.getByRole('button', { name: /google/i }).first().click()

  await expect(page).toHaveURL((url) => url.pathname === start, { timeout: 15_000 })
  await expectSignedIn(page)
  expect(consentScreens).toBe(1)
  expect(realGoogle).toBe(0)
  await page.goto('/account')
  await expect(page.getByText(identity.email).first()).toBeVisible()
})

test('journey 5: a password reset signs out every session, its link works once, and an expired link is refused', async ({ page, browser }) => {
  const email = freshEmail('reset')
  const changed = 'Journey-Changed-2026!'

  // Signed in on one device.
  await page.goto(HOME_PATH)
  await signUp(page, email)

  // Forgotten on another.
  const other = await gated(await browser.newContext())
  const phone = await other.newPage()
  await phone.goto(HOME_PATH)
  const since = new Date().toISOString()
  await signInButton(phone).click()
  await phone.locator('input[name=email]').fill(email)
  await phone.getByRole('button', { name: /continue/i }).click()
  await phone.getByRole('button', { name: 'Forgot password?' }).click()
  await phone.getByRole('button', { name: 'Send reset link' }).click()

  const mail = await mailTo(email, /reset/i, since)
  const link = mail.links.find((href) => href.includes('reset-password'))
  expect(link, `a reset link in ${JSON.stringify(mail.links)}`).toBeTruthy()

  await phone.goto(link!)
  await expect(phone).toHaveURL((url) => url.pathname === '/auth/reset-password' && Boolean(url.searchParams.get('token')))
  await phone.locator('input[name=newPassword]').fill(changed)
  await phone.locator('input[name=confirmPassword]').fill(changed)
  await phone.getByRole('button', { name: 'Update password' }).click()
  await expect(phone.getByText('Your password has been updated.')).toBeVisible()

  // The first device's session ended with the reset, and it ends there at
  // once, although the device still holds its signed five-minute copy
  // (`cookieCache`): a reader with a revoked session is checked against the
  // session store (`session-revocations.ts`, launch fix plan item 14).
  await expectCacheCopyKept(page.context())
  await page.reload()
  await expectSignedOut(page)

  // The same link again: refused. Refusing a spent or expired token is the
  // API's 400, which is what this journey expects to see.
  allowProblems(phone, /^http 400: POST \S+\/api\/visitor-auth\/reset-password$/, 'a spent or expired reset link is refused')
  await phone.goto(link!)
  await phone.locator('input[name=newPassword]').fill('Journey-Again-2026!')
  await phone.locator('input[name=confirmPassword]').fill('Journey-Again-2026!')
  await phone.getByRole('button', { name: 'Update password' }).click()
  await expect(phone.getByText(/invalid or has expired|invalid token/i)).toBeVisible()
  await expect(phone.getByText('Your password has been updated.')).toHaveCount(0)

  // A fresh link that has expired: refused too.
  const again = new Date().toISOString()
  await phone.goto(HOME_PATH)
  await signInButton(phone).click()
  await phone.locator('input[name=email]').fill(email)
  await phone.getByRole('button', { name: /continue/i }).click()
  await phone.getByRole('button', { name: 'Forgot password?' }).click()
  await phone.getByRole('button', { name: 'Send reset link' }).click()
  const late = (await mailTo(email, /reset/i, again)).links.find((href) => href.includes('reset-password'))!
  expect(expireTokensOf(email)).toBeGreaterThan(0)
  await phone.goto(late)
  await phone.locator('input[name=newPassword]').fill('Journey-Late-2026!')
  await phone.locator('input[name=confirmPassword]').fill('Journey-Late-2026!')
  await phone.getByRole('button', { name: 'Update password' }).click()
  await expect(phone.getByText(/invalid or has expired|invalid token/i)).toBeVisible()

  // Only the one reset took: the new password signs in.
  await page.goto(HOME_PATH)
  await signIn(page, { email, password: changed })
  await expectSignedIn(page)
  await other.close()
})
