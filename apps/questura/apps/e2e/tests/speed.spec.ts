import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { devices, type CDPSession, type Page } from '@playwright/test'

import { expect, gated, test, unexpectedProblems } from './fixtures'

/**
 * Speed budgets (launch fix plan item 13): home, a city, an article and /join
 * loaded cold on a throttled phone, each held to the budgets in
 * apps/questura/perf/budgets.json (`pages`).
 *
 * Per route, three cold loads in fresh contexts; the median of each number
 * is what is checked, so one slow sample on a shared runner does not fail CI
 * and a real regression still does:
 *  - LCP, from the `largest-contentful-paint` entries;
 *  - CLS, the largest session window of `layout-shift` entries, as Google
 *    computes it;
 *  - an INP proxy: the longest event-timing entry for one scripted tap on the
 *    page's heading;
 *  - image bytes fetched before the `load` event (what is above the fold).
 * JavaScript and CSS bytes are reported, not budgeted here: the build check
 * (`check:first-load-js`) holds JavaScript per route exactly, and the
 * browser's number also counts the chunks Next prefetches for links.
 *
 * Each route prints one `SPEED {…}` line, which is how the committed budgets
 * were set (docs/launch-day.md, "Speed budgets"). Chromium only: throttling is
 * the DevTools protocol's. Sandbox only: the budgets describe its corpus.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
/** `overCap`: why this route's budget sits above the cap (a known, named problem), if it does. */
type RouteBudget = { path: string; lcpMs: number; cls: number; inpMs: number; imageKb: number; overCap?: string }
type PageBudgets = {
  profile: { latencyMs: number; downloadKbps: number; uploadKbps: number; cpuSlowdown: number; device: string }
  caps: { lcpMs: number; cls: number }
  routes: Record<string, RouteBudget>
}
const BUDGETS = (JSON.parse(readFileSync(resolve(HERE, '../../../perf/budgets.json'), 'utf8')) as { pages: PageBudgets }).pages

const SAMPLES = 3
const { defaultBrowserType: _engine, ...PHONE } = devices[BUDGETS.profile.device as 'Pixel 7']

type Sample = { lcpMs: number; cls: number; inpMs: number; imageKb: number; jsKb: number; cssKb: number }

/** Bytes on the wire by resource type, for requests sent before the load event. */
async function recordBytes(cdp: CDPSession) {
  const requests = new Map<string, { type: string; sentAt: number; bytes: number }>()
  let loadAt = Infinity
  cdp.on('Network.requestWillBeSent', (event) => {
    requests.set(event.requestId, { type: event.type ?? 'Other', sentAt: event.timestamp, bytes: 0 })
  })
  cdp.on('Network.loadingFinished', (event) => {
    const request = requests.get(event.requestId)
    if (request) request.bytes = event.encodedDataLength
  })
  cdp.on('Page.loadEventFired', (event) => {
    loadAt = Math.min(loadAt, event.timestamp)
  })
  await cdp.send('Page.enable')
  return (type: string, beforeLoad: boolean) =>
    [...requests.values()]
      .filter((request) => request.type === type && (!beforeLoad || request.sentAt <= loadAt))
      .reduce((sum, request) => sum + request.bytes, 0) / 1000
}

async function observeVitals(page: Page) {
  await page.addInitScript(() => {
    const vitals = { lcp: 0, cls: 0, inp: 0 }
    ;(window as unknown as { __speed: typeof vitals }).__speed = vitals
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) vitals.lcp = entry.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    // Session windows: shifts less than 1 s apart, at most 5 s long.
    let window_ = 0
    let first = 0
    let last = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        if (entry.hadRecentInput) continue
        if (window_ && entry.startTime - last < 1000 && entry.startTime - first < 5000) {
          window_ += entry.value
        } else {
          window_ = entry.value
          first = entry.startTime
        }
        last = entry.startTime
        vitals.cls = Math.max(vitals.cls, window_)
      }
    }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) vitals.inp = Math.max(vitals.inp, entry.duration)
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit)
  })
}

const readVitals = (page: Page) => page.evaluate(() => (window as unknown as { __speed: { lcp: number; cls: number; inp: number } }).__speed)

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!

test.describe('speed budgets', () => {
  test.skip(!!process.env.E2E_BASE_URL, 'the budgets describe the sandbox corpus')

  test('every budget is under its cap, or says why it is not', () => {
    for (const [name, budget] of Object.entries(BUDGETS.routes)) {
      const over = budget.lcpMs > BUDGETS.caps.lcpMs || budget.cls > BUDGETS.caps.cls
      expect(!over || Boolean(budget.overCap), `${name}: over the cap (LCP ${BUDGETS.caps.lcpMs} ms, CLS ${BUDGETS.caps.cls}) with no overCap reason`).toBe(true)
      if (over) console.log(`SPEED over the cap: ${name} (${budget.path}): ${budget.overCap}`)
    }
  })

  for (const [name, budget] of Object.entries(BUDGETS.routes)) {
    test(`speed: ${name} (${budget.path}) on a throttled phone stays inside its budget`, async ({ browser, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium', 'throttling is the DevTools protocol: the Chromium project only')
      test.setTimeout(SAMPLES * 90_000)
      const samples: Sample[] = []

      for (let run = 0; run < SAMPLES; run += 1) {
        // Not the `context` fixture: each sample needs a cold one. Same address
        // and outbound block as the project's own contexts.
        const { baseURL, proxy } = testInfo.project.use
        const context = await gated(await browser.newContext({ ...PHONE, baseURL, proxy }))
        try {
          const page = await context.newPage()
          const cdp = await context.newCDPSession(page)
          await cdp.send('Network.enable')
          await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
          await cdp.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: BUDGETS.profile.latencyMs,
            downloadThroughput: (BUDGETS.profile.downloadKbps * 1000) / 8,
            uploadThroughput: (BUDGETS.profile.uploadKbps * 1000) / 8,
          })
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: BUDGETS.profile.cpuSlowdown })
          const bytes = await recordBytes(cdp)
          await observeVitals(page)

          const response = await page.goto(budget.path, { waitUntil: 'load', timeout: 60_000 })
          expect(response?.status(), `${budget.path} answers`).toBe(200)
          // LCP can still move until the page settles; give it a moment.
          await page.waitForTimeout(1_500)
          const heading = page.locator('h1').first()
          await expect(heading).toBeVisible()
          // A tap on the heading's middle, straight to the touchscreen: no
          // actionability wait, so an overlay can never stall the sample.
          const box = await heading.boundingBox()
          if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
          await page.waitForTimeout(500)

          const vitals = await readVitals(page)
          samples.push({
            lcpMs: Math.round(vitals.lcp),
            cls: Math.round(vitals.cls * 10_000) / 10_000,
            inpMs: Math.round(vitals.inp),
            imageKb: Math.round(bytes('Image', true) * 10) / 10,
            jsKb: Math.round(bytes('Script', false) * 10) / 10,
            cssKb: Math.round(bytes('Stylesheet', false) * 10) / 10,
          })
          expect(unexpectedProblems(context), 'console errors, page errors or failed requests').toEqual([])
        } finally {
          await context.close()
        }
      }

      const result = Object.fromEntries(
        (Object.keys(samples[0]!) as Array<keyof Sample>).map((key) => [key, median(samples.map((sample) => sample[key]))]),
      ) as Sample
      console.log(`SPEED ${JSON.stringify({ route: name, path: budget.path, median: result, samples })}`)
      testInfo.annotations.push({ type: `speed ${name}`, description: JSON.stringify(result) })

      expect.soft(result.lcpMs, `LCP (ms), budget ${budget.lcpMs}`).toBeLessThanOrEqual(budget.lcpMs)
      expect.soft(result.cls, `CLS, budget ${budget.cls}`).toBeLessThanOrEqual(budget.cls)
      expect.soft(result.inpMs, `INP proxy (ms), budget ${budget.inpMs}`).toBeLessThanOrEqual(budget.inpMs)
      expect.soft(result.imageKb, `image kB before load, budget ${budget.imageKb}`).toBeLessThanOrEqual(budget.imageKb)
    })
  }
})

/**
 * Real readers' numbers reach the API (launch fix plan item 13): hiding a
 * page sends its Core Web Vitals to `/api/web-vitals`, without cookies, and
 * the API takes them.
 */
test('web vitals: hiding a page sends its LCP to the API beacon', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium', 'LCP is reported by Chromium; one engine proves the wiring')
  test.skip(!!process.env.E2E_BASE_URL, 'the sandbox only: the real site keeps its logs for real readers')

  await page.goto('/join')
  await expect(page.locator('h1').first()).toBeVisible()
  // LCP is final at the first input; a tap makes INP too.
  await page.locator('h1').first().click()
  const beacon = page.waitForRequest((request) => request.url().endsWith('/api/web-vitals') && request.method() === 'POST')
  // Hide the page as switching tabs does. Headless Chromium never hides a
  // page, and a browser test cannot see a request sent while a document
  // unloads (the pagehide path), so the page is told it is hidden.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const request = await beacon
  const body = JSON.parse(request.postData() ?? '{}') as { path?: string; metrics?: Array<{ name: string; value: number }> }
  expect(body.path).toBe('/join')
  expect(body.metrics?.map((metric) => metric.name)).toContain('LCP')
  expect((await request.allHeaders()).cookie, 'the beacon carries no cookie').toBeUndefined()
  const response = await request.response()
  if (response) expect(response.status()).toBe(204)
})
