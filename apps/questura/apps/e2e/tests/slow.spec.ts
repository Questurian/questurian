import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SANDBOX, expect, test } from './fixtures'
import { browseJourney } from './journeys'

/**
 * Journey 12 (launch fix plan item 8): journey 1 on a slow phone connection
 * and a slow processor, as Chrome's DevTools "Slow 3G" preset (2 s round
 * trip, about 50 KB/s each way) plus a CPU four times slower. The bar: every
 * page still whole, every image decoding, no JavaScript error (the console
 * gate), and the walk done inside its budget.
 *
 * In the sandbox the budget is a speed budget (launch fix plan item 13): the
 * slowest walk measured on a GitHub runner plus 10%
 * (apps/questura/perf/budgets.json, `journey12`); the walk takes ~40 s
 * there. Against the real site it stays the generous 180 s it was: real
 * pages and a real network are another measurement.
 *
 * Chromium only: the throttling is the DevTools protocol's. Read-only, so it
 * also runs on the real site.
 */

const SLOW_3G = { offline: false, latency: 2_000, downloadThroughput: 50_000, uploadThroughput: 50_000 }
const HERE = dirname(fileURLToPath(import.meta.url))
const BUDGET_MS = SANDBOX
  ? (JSON.parse(readFileSync(resolve(HERE, '../../../perf/budgets.json'), 'utf8')) as { journey12: { budgetMs: number } }).journey12.budgetMs
  : 180_000

test('journey 12: journey 1 on Slow 3G with a 4× slower CPU stays whole, error-free and inside the budget', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium', 'network and CPU throttling are the DevTools protocol: desktop Chromium only')
  test.setTimeout(BUDGET_MS + 60_000)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', SLOW_3G)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  const started = Date.now()
  await browseJourney(page, {
    expect: expect.configure({ timeout: 60_000 }),
    imageTimeout: 90_000,
  })
  const took = Date.now() - started
  testInfo.annotations.push({ type: 'slow 3G journey 1', description: `${Math.round(took / 1000)} s of ${BUDGET_MS / 1000} s` })
  expect(took, 'journey 1 on Slow 3G + 4× CPU').toBeLessThan(BUDGET_MS)
})
