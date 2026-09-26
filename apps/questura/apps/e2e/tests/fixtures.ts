import { randomInt } from 'node:crypto'

import { expect, test as base, type BrowserContext, type Page } from '@playwright/test'

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

/**
 * Where browsing starts. The real site's `/` redirects to its default city;
 * the sandbox has no such city, so it starts on its test country.
 */
export const HOME_PATH = process.env.E2E_HOME_PATH ?? (SANDBOX ? '/zz-launch' : '/')

/** A password the sign-up form accepts (8+, upper case, number, symbol). */
export const NEW_PASSWORD = 'Journey-Synthetic-2026!'

/** A fresh address per call, so reruns never collide with an earlier sign-up. */
export function freshEmail(label: string): string {
  return `e2e-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.com`
}

// ---------------------------------------------------------------- console gate

/**
 * Every page in every spec fails on console errors, uncaught page errors and
 * failed requests (launch fix plan item 8). What is expected is listed here or
 * in the test that expects it (`allowProblems`), each with its reason.
 *
 * A failed request is a network failure (`requestfailed`) or a response of 400
 * or more. Chromium also logs the latter as "Failed to load resource"; that
 * console line is left to the response check, which names the URL and works
 * the same in Firefox (which logs nothing).
 */
/** `once`: allowed a single time per browser context; a second match is a failure. */
type Allowance = { pattern: RegExp; why: string; once?: boolean }

const ALWAYS_ALLOWED: Allowance[] = [
  {
    // Leaving a page cancels what it still had in flight: Next's prefetches of
    // the links it rendered, a request the page no longer needs. Chromium
    // reports the cancellation as ERR_ABORTED, Firefox as NS_BINDING_ABORTED.
    // A request that fails for any other reason is still a failure.
    pattern: /^failed: \S+ \S+ (net::ERR_ABORTED|NS_BINDING_ABORTED)$/,
    why: 'a request cancelled by leaving the page',
  },
  {
    // Next's router says so when a page's navigation or prefetch data did not
    // arrive and it loads the page the ordinary way instead. Firefox logs it
    // for prefetches cut off by leaving the page. A server error behind it is
    // still caught, by the response check.
    pattern: /^console: Failed to fetch RSC payload for \S+\. Falling back to browser navigation\./,
    why: 'Next falling back to an ordinary page load',
  },
  {
    // Firefox logs a web font it was still downloading when leaving the page
    // cut it off. 2152398850 is NS_BINDING_ABORTED (0x804B0002), the same
    // cancellation as above; a font that fails for any other reason (404,
    // decode error) has another status, or none, and still fails.
    pattern: /^console: \[JavaScript Error: "downloadable font: download failed \(.*\): status=2152398850 source: \S+"\]/,
    why: 'a font download cancelled by leaving the page',
  },
  {
    // React 19.1 sometimes replays a layout's <div> mid-hydration without
    // rewinding its hydration cursor (a client component's code arriving at
    // that moment), throws #418 and recovers by rendering the page again in
    // the browser; the reader still gets the page (launch fix plan item 8b:
    // 3 in 168 fast /account loads, also seen once on /zz-launch in Firefox).
    // No safe fix exists here: a Suspense boundary under the layouts stops it
    // but turns every 404 into a 200. Allowed once per context only, so a real
    // mismatch, which fails every load, still fails the gate; account.spec.ts
    // checks /account over repeated loads.
    pattern: /^pageerror: Minified React error #418;/,
    why: 'a rare, recovered React hydration race',
    once: true,
  },
  ...(SANDBOX
    ? [
        {
          // `/` redirects to the default city, /peru/lima, which only the real
          // site has. The sandbox's corpus is its own test cities.
          pattern: /^http 404: GET \S+\/peru\/lima(\?_rsc=\S+)?$|\(on \/peru\/lima\)$/,
          why: 'the sandbox has no default city',
        },
      ]
    : []),
]

const gates = new WeakMap<BrowserContext, { problems: string[]; allowed: Allowance[] }>()

function gateFor(context: BrowserContext) {
  let gate = gates.get(context)
  if (!gate) {
    gate = { problems: [], allowed: [...ALWAYS_ALLOWED] }
    gates.set(context, gate)
  }
  return gate
}

function watch(page: Page): void {
  const gate = gateFor(page.context())
  const where = () => {
    try {
      return new URL(page.url()).pathname
    } catch {
      return page.url()
    }
  }
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (/^Failed to load resource: the server responded with a status of \d+/.test(text)) return
    gate.problems.push(`console: ${text} (on ${where()})`)
  })
  page.on('pageerror', (error) => gate.problems.push(`pageerror: ${error.message} (on ${where()})`))
  page.on('requestfailed', (request) =>
    gate.problems.push(`failed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'unknown'}`),
  )
  page.on('response', (response) => {
    if (response.status() >= 400) gate.problems.push(`http ${response.status()}: ${response.request().method()} ${response.url()}`)
  })
}

/**
 * Watch every page a context opens (popups included) and give it a sandbox
 * caller address. Tests that make a second context call this on it.
 */
export async function gated(context: BrowserContext): Promise<BrowserContext> {
  if (gates.has(context)) return context
  gateFor(context)
  watched.push(context)
  context.on('page', watch)
  for (const page of context.pages()) watch(page)
  if (SANDBOX) {
    // In the sandbox every browser request comes from 127.0.0.1, so all tests
    // would share one sign-in budget. The proxy header gives each context its
    // own caller, the way distinct visitors arrive through Cloudflare. Added
    // at the network layer, after the browser's CORS decision. Never on the
    // real site: there Cloudflare overwrites it anyway.
    // Random, not counted: each spec file runs in a fresh worker, so a
    // counter handed every file the same few addresses and the per-address
    // limits (password reset: 5 a minute) failed the later ones.
    const address = `198.18.${randomInt(0, 256)}.${randomInt(1, 255)}`
    // Not the addresses a browser reaches by following a redirect (Google's
    // callback, a mail link): Chromium restarts a redirect chain from the
    // previous address when one of its hops is intercepted at all.
    await context.route(
      (url) => url.pathname.startsWith('/api/') && !REDIRECT_TARGETS.test(url.pathname),
      (route) => route.continue({ headers: { ...route.request().headers(), 'cf-connecting-ip': address } }),
    )
  }
  return context
}

/** Expect these problems in this context (a 404 page, a refused password). Say why. */
export function allowProblems(target: Page | BrowserContext, pattern: RegExp, why: string): void {
  const context = 'newPage' in target ? target : target.context()
  gateFor(context).allowed.push({ pattern, why })
}

export function unexpectedProblems(context: BrowserContext): string[] {
  const gate = gates.get(context)
  if (!gate) return []
  const spent = new Set<Allowance>()
  return gate.problems.filter((problem) => {
    const allowance = gate.allowed.find((each) => each.pattern.test(problem) && !(each.once && spent.has(each)))
    if (allowance?.once) spent.add(allowance)
    return !allowance
  })
}

const REDIRECT_TARGETS = /^\/api\/visitor-auth\/(callback\/|verify-email|reset-password\/)/
/** Every context gated during the current test, its own and any it made. */
let watched: BrowserContext[] = []

export const test = base.extend({
  context: async ({ context }, use) => {
    watched = []
    await use(await gated(context))
    const problems = watched.flatMap((each) => unexpectedProblems(each))
    expect(problems, 'console errors, page errors or failed requests').toEqual([])
  },
})

export { expect }

// ---------------------------------------------------------------- helpers

/** The header's Sign in button that is on screen (phone and desktop headers differ). */
export function signInButton(page: Page) {
  return page.getByRole('button', { name: 'Sign in' }).locator('visible=true').first()
}

export async function signIn(page: Page, account: { email: string; password: string }) {
  await signInButton(page).click()
  await page.locator('input[name=email]').fill(account.email)
  await page.getByRole('button', { name: /continue/i }).click()
  await page.locator('input[name=password]').fill(account.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click()
}

/** Creates a password account from the header and waits for the signed-in header. */
export async function signUp(page: Page, email: string, password = NEW_PASSWORD) {
  await signInButton(page).click()
  await page.locator('input[name=email]').fill(email)
  await page.getByRole('button', { name: /continue/i }).click()
  await page.locator('input[name=password]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expectSignedIn(page)
}

export async function expectSignedIn(page: Page) {
  await expect(page.getByRole('button', { name: 'Open user menu' }).locator('visible=true').first()).toBeVisible()
}

export async function expectSignedOut(page: Page) {
  await expect(page.getByRole('button', { name: 'Sign in' }).locator('visible=true').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open user menu' }).locator('visible=true')).toHaveCount(0)
}

/**
 * The context still holds both session cookies, the token and Better Auth's
 * signed five-minute copy (`session_data`), so a signed-out answer after a
 * revocation is the server refusing a cached session, not a missing cookie.
 */
export async function expectCacheCopyKept(context: BrowserContext) {
  const names = (await context.cookies()).map((cookie) => cookie.name)
  expect(names.some((name) => name.includes('questura_visitor.session_token')), `session token in ${names}`).toBe(true)
  expect(names.some((name) => name.includes('questura_visitor.session_data')), `session cache copy in ${names}`).toBe(true)
}

/** Signs out through the user menu and waits for the signed-out header. */
export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Open user menu' }).locator('visible=true').first().click()
  await page.getByRole('button', { name: 'Logout' }).or(page.getByRole('link', { name: 'Logout' })).first().click()
  await expect(page.getByRole('button', { name: 'Open user menu' }).locator('visible=true')).toHaveCount(0)
}

/**
 * Every photo on the page actually decodes (launch fix plan item 8: the
 * sandbox's used to point at a host that does not exist). Scrolls through the
 * page first so lazy images load, then expects at least one image and no
 * broken one.
 */
export async function expectImagesDecode(page: Page, timeout = 10_000) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += Math.max(200, window.innerHeight / 2)) {
      window.scrollTo(0, y)
      await new Promise((done) => setTimeout(done, 40))
    }
    window.scrollTo(0, 0)
  })
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const photos = [...document.images].filter((image) => image.currentSrc && !image.currentSrc.startsWith('data:'))
          return {
            count: photos.length,
            broken: photos.filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.currentSrc),
          }
        }),
      { message: 'every image on the page decodes', timeout },
    )
    .toEqual({ count: expect.any(Number), broken: [] })
  const count = await page.evaluate(() => [...document.images].filter((image) => image.currentSrc && !image.currentSrc.startsWith('data:')).length)
  expect(count, 'the page shows at least one image').toBeGreaterThan(0)
}

/**
 * The page fits the screen: nothing sticks out sideways, so a phone reader
 * never scrolls horizontally (launch fix plan item 8, journey 11). Cheap, so
 * the journeys check it on every page and every screen size.
 */
export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth, widest } = await page.evaluate(() => {
    const root = document.documentElement
    // The element sticking out furthest, to name it in the failure.
    let widest = ''
    let right = root.clientWidth
    for (const element of document.body.querySelectorAll('*')) {
      const box = element.getBoundingClientRect()
      if (box.width > 0 && box.right > right + 1) {
        right = box.right
        widest = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}.${String(element.className).split(' ').slice(0, 3).join('.')} (right edge ${Math.round(box.right)}px)`
      }
    }
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, widest }
  })
  expect(scrollWidth, `no horizontal scroll on ${new URL(page.url()).pathname}${widest ? `; widest: ${widest}` : ''}`).toBeLessThanOrEqual(clientWidth)
}
