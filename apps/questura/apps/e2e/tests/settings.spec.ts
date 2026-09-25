import {
  HOME_PATH,
  NEW_PASSWORD,
  SANDBOX,
  allowProblems,
  expect,
  expectSignedIn,
  expectSignedOut,
  freshEmail,
  gated,
  signIn,
  signUp,
  test,
} from './fixtures'
import { mailTo } from './sandbox'

/**
 * Journeys 6 and 7 (launch fix plan item 8): changing the password and
 * changing the email address from the account page. They create readers, so
 * they run in the sandbox only, with the fake mailbox on :3192.
 */

test.skip(!SANDBOX, 'creates readers: sandbox only')

test('journey 6: changing the password keeps this browser signed in, signs the other one out, and retires the old password', async ({ page, browser }) => {
  const email = freshEmail('chpw')
  const changed = 'Journey-Changed-2026!'

  // Signed in here, and on a second device.
  await page.goto(HOME_PATH)
  await signUp(page, email)
  const other = await gated(await browser.newContext())
  const phone = await other.newPage()
  await phone.goto(HOME_PATH)
  await signIn(phone, { email, password: NEW_PASSWORD })
  await expectSignedIn(phone)

  const since = new Date().toISOString()
  await page.goto('/account')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/account/change-password')
  await page.locator('input[name=currentPassword]').fill(NEW_PASSWORD)
  await page.locator('input[name=newPassword]').fill(changed)
  await page.locator('input[name=confirmNewPassword]').fill(changed)
  await page.getByRole('button', { name: 'Change Password', exact: true }).click()

  await expect(page).toHaveURL((url) => url.pathname === '/account')
  await expect(page.getByText('Password changed successfully!')).toBeVisible()
  // This browser keeps a session the server still honours: without its cached
  // copy, it is the session store answering.
  await page.context().clearCookies({ name: /questura_visitor\.session_data/ })
  await page.reload()
  await expectSignedIn(page)
  await expect(page.getByRole('heading', { name: 'Your Account' })).toBeVisible()

  // The security notice reaches the reader (decision D4).
  await mailTo(email, /password/i, since)

  // The other device's session ended with the change. Its signed five-minute
  // copy (`cookieCache` in better-auth.ts, a documented trade-off that item 14
  // revisits) is dropped, as five minutes would; the session cookie itself is
  // kept, so it is the server refusing it.
  await other.clearCookies({ name: /questura_visitor\.session_data/ })
  expect((await other.cookies()).some((c) => c.name.includes('questura_visitor.session_token'))).toBe(true)
  await phone.reload()
  await expectSignedOut(phone)

  // The old password no longer signs in; the new one does. Refusing it is the
  // API's 401, which is what this journey expects to see.
  allowProblems(phone, /^http 401: POST \S+\/api\/visitor-auth\/sign-in\/email$/, 'the old password is refused')
  await signIn(phone, { email, password: NEW_PASSWORD })
  await expect(phone.locator('input[name=password]')).toBeVisible()
  await expect(phone.getByText(/invalid|incorrect/i).first()).toBeVisible()
  await expectSignedOut(phone)
  await phone.goto(HOME_PATH)
  await signIn(phone, { email, password: changed })
  await expectSignedIn(phone)
  await other.close()
})

test('journey 7: changing the email address through the mailbox moves the sign-in to the new address and tells the old one', async ({ page }) => {
  const email = freshEmail('chmail-old')
  const moved = freshEmail('chmail-new')

  await page.goto(HOME_PATH)
  await signUp(page, email)
  await page.goto('/account')
  await expect(page.getByText(email).first()).toBeVisible()

  await page.getByRole('button', { name: 'Edit', exact: true }).locator('visible=true').first().click()
  await expect(page).toHaveURL((url) => url.pathname === '/account/change-email')
  await page.locator('input[name=password]').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.locator('input[type=email]').fill(moved)
  const since = new Date().toISOString()
  await page.getByRole('button', { name: 'Send verification link' }).click()
  await expect(page.getByText(`We've sent a verification link to ${moved}`, { exact: false })).toBeVisible()

  // Nothing has changed until the link is followed.
  await page.goto('/account')
  await expect(page.getByText(email).first()).toBeVisible()

  const mail = await mailTo(moved, /verif|confirm|email/i, since)
  const link = mail.links.find((href) => href.includes('verify-email'))
  expect(link, `a verify-email link in ${JSON.stringify(mail.links)}`).toBeTruthy()
  await page.goto(link!)
  await expect(page).toHaveURL((url) => url.pathname === '/account/email-changed-success')
  await expect(page.getByRole('heading', { name: 'Email Changed Successfully' })).toBeVisible()

  await page.goto('/account')
  await expect(page.getByText(moved).first()).toBeVisible()
  await expect(page.getByText(email)).toHaveCount(0)

  // The old address is told (decision D4).
  await mailTo(email, /email/i, since)

  // The new address signs in; the reader is the same one.
  await page.context().clearCookies()
  await page.goto(HOME_PATH)
  await expectSignedOut(page)
  await signIn(page, { email: moved, password: NEW_PASSWORD })
  await expectSignedIn(page)
})
