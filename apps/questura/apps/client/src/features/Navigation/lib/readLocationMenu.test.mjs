import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  LOCATION_MENU_REVALIDATE_SECONDS,
  LOCATION_MENU_TIMEOUT_MS,
  readLocationMenu,
} from './readLocationMenu.ts'

const MENU = { countries: [{ locationKey: 'peru', label: 'Peru', countryCode: 'PE', href: '/peru', cities: [] }] }

test('a healthy menu is returned whole and stays on the long cache', async () => {
  const menu = await readLocationMenu('https://api.example.com', async (url, options) => {
    assert.equal(url, 'https://api.example.com/api/public/locations/menu')
    assert.equal(options.next.revalidate, LOCATION_MENU_REVALIDATE_SECONDS)
    assert.equal(options.credentials, undefined)
    return Response.json(MENU)
  })

  assert.deepEqual(menu, MENU)
})

// The shell waits on this read. Without a deadline a backend that accepts the
// connection and then stops answering holds the navbar, the page and the footer
// open for as long as the socket lives.
test('a backend that never answers cannot hold the shell past the deadline', async () => {
  const started = Date.now()

  const menu = await readLocationMenu(
    'https://api.example.com',
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason))
      }),
    80,
  )

  assert.equal(menu, null)
  assert.ok(Date.now() - started < 1000, 'the read must abort, not wait for the backend')
})

test('the deadline is a real AbortSignal, not an unused option', async () => {
  await readLocationMenu('https://api.example.com', async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal)
    assert.equal(options.signal.aborted, false)
    return Response.json(MENU)
  })
})

// Every one of these returns null, which is the signal the client uses to fetch
// the menu when the reader opens it. None of them is cached: Next only writes a
// 200 into the data cache, so the next render retries instead of serving an
// hour of nothing.
test('unavailable, malformed and thrown responses all degrade to the open-on-click fallback', async () => {
  const requests = [
    async () => Response.json({}, { status: 500 }),
    async () => Response.json({}, { status: 404 }),
    async () => Response.json({ countries: 'not an array' }),
    async () => Response.json({}),
    async () => new Response('<html>gateway</html>', { headers: { 'content-type': 'text/html' } }),
    async () => {
      throw new TypeError('fetch failed')
    },
  ]

  for (const request of requests) {
    assert.equal(await readLocationMenu('https://api.example.com', request), null)
  }
})

test('the default deadline is bounded and comfortably above a healthy read', () => {
  assert.ok(LOCATION_MENU_TIMEOUT_MS > 360, 'must not abort a read the backend would have answered')
  assert.ok(LOCATION_MENU_TIMEOUT_MS <= 3000, 'must not become a second unbounded wait')
})

// A guard, not a style rule. The whole point of this file is that the shell's
// await is bounded; a future edit that drops the signal restores the hang
// silently, because a healthy backend never shows the difference.
test('the shell read always carries a deadline', () => {
  const source = readFileSync(fileURLToPath(new URL('./readLocationMenu.ts', import.meta.url)), 'utf8')
  assert.match(source, /signal:\s*AbortSignal\.timeout\(/)
})
