import { expect, test as base, type Page } from '@playwright/test'

/**
 * Who signs in, and what they should see. Defaults are the readiness
 * sandbox's synthetic readers (`server/scripts/readiness/launch-corpus.ts`);
 * launch day overrides them with a dedicated account.
 */
export const ACCOUNTS = {
  member: {
    email: process.env.E2E_MEMBER_EMAIL ?? 'member-a@example.com',
    password: process.env.E2E_MEMBER_PASSWORD ?? 'Readiness-Synthetic-2026!',
  },
  /** A second member, so no one address goes over its sign-in-check limit (5 a minute). */
  memberB: {
    email: process.env.E2E_MEMBER_B_EMAIL ?? 'member-b@example.com',
    password: process.env.E2E_MEMBER_B_PASSWORD ?? 'Readiness-Synthetic-2026!',
  },
  nonmember: {
    email: process.env.E2E_NONMEMBER_EMAIL ?? 'nonmember@example.com',
    password: process.env.E2E_NONMEMBER_PASSWORD ?? 'Readiness-Synthetic-2026!',
  },
}

export const MEMBER_ARTICLE = {
  path: process.env.E2E_MEMBER_ARTICLE ?? '/zz-launch/harbor/food-and-drink/launch-article-00',
  /** Text only a member sees. The sandbox seeds a marker; launch day passes one. */
  memberOnlyText: process.env.E2E_MEMBER_TEXT ?? 'MEMBERONLY-ART-00',
}

export const SANDBOX = !process.env.E2E_BASE_URL

let caller = 0

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    // In the sandbox every browser request comes from 127.0.0.1, so all tests
    // would share one sign-in budget. The proxy header gives each test its
    // own caller, the way distinct visitors arrive through Cloudflare. Added
    // at the network layer, after the browser's CORS decision. Never on the
    // real site: there Cloudflare overwrites it anyway.
    if (SANDBOX) {
      caller += 1
      const address = `198.18.${100 + Math.floor(caller / 250)}.${(caller % 250) + 1}`
      await page.route('**/api/**', (route) =>
        route.continue({ headers: { ...route.request().headers(), 'cf-connecting-ip': address } }),
      )
    }
    await use(page)
  },
})

export { expect }

export async function signIn(page: Page, account: { email: string; password: string }) {
  await page.getByRole('button', { name: 'Sign in' }).first().click()
  await page.locator('input[name=email]').fill(account.email)
  await page.getByRole('button', { name: /continue/i }).click()
  await page.locator('input[name=password]').fill(account.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click()
}

export async function expectSignedIn(page: Page) {
  await expect(page.getByRole('button', { name: 'Open user menu' }).locator('visible=true').first()).toBeVisible()
}

/** Signs out through the user menu and waits for the signed-out header. */
export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Open user menu' }).locator('visible=true').first().click()
  await page.getByRole('button', { name: 'Logout' }).or(page.getByRole('link', { name: 'Logout' })).first().click()
  await expect(page.getByRole('button', { name: 'Open user menu' }).locator('visible=true')).toHaveCount(0)
}
