import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { renderHeaders } from './public-cache.ts'
import { sendWorkerReport } from '../observability/errorReport.ts'

// Launch fix plan item 10 (ADR-0016): with the API's front door locked, every
// server-side call from this site to the API carries the origin secret, read
// from a Worker secret. Whether Cloudflare's Transform Rule adds it to the
// Worker's own subrequests is a platform unknown (plan PL1), so the site does
// not rely on it.

const SECRET = 'origin-secret-for-client-tests-0123456789'

function withEnv(env, run) {
  const saved = {}
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return run()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('renderHeaders sends the origin secret and the render token when set, trimmed', () => {
  withEnv({ ORIGIN_AUTH_SECRET: ` ${SECRET} `, QUESTURA_RENDER_TOKEN: 'render-token-0123456789abcdef0123456789' }, () => {
    assert.deepEqual(renderHeaders(), {
      'x-questura-origin-auth': SECRET,
      'x-questura-render-token': 'render-token-0123456789abcdef0123456789',
    })
  })
})

test('renderHeaders sends nothing it does not have (development, the browser bundle)', () => {
  withEnv({ ORIGIN_AUTH_SECRET: undefined, QUESTURA_RENDER_TOKEN: undefined }, () => {
    assert.deepEqual(renderHeaders(), {})
  })
  withEnv({ ORIGIN_AUTH_SECRET: '   ', QUESTURA_RENDER_TOKEN: undefined }, () => {
    assert.deepEqual(renderHeaders(), {})
  })
})

test("the Worker's error report carries the caller's headers, and keeps its own content type", async () => {
  let posted
  await sendWorkerReport(
    { source: 'worker', boundary: 'request', message: 'x' },
    {
      backendUrl: 'https://api.questurian.invalid',
      headers: { 'x-questura-origin-auth': SECRET, 'content-type': 'text/plain' },
      fetch: async (url, init) => (posted = { url, init }),
    },
  )
  assert.equal(posted.init.headers['x-questura-origin-auth'], SECRET)
  assert.equal(posted.init.headers['content-type'], 'application/json')
})

// Every server-side fetch to the API goes through renderHeaders (directly or
// via publicFetchOptions). The readiness front-door check proves the pages
// render; this catches a new call site before the sandbox runs.
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Files that call fetch without renderHeaders, and why that is right. */
const NOT_SERVER_SIDE = new Map([
  // The browser's API client (hooks, stores). Browsers reach the API through
  // Cloudflare, which adds the header; the secret must never be in a bundle.
  ['lib/api/api-client.ts', 'browser client'],
  // Takes the headers from its caller (instrumentation.ts passes renderHeaders).
  ['lib/observability/errorReport.ts', 'caller supplies headers'],
])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(full)
  }
  return out
}

test('every server-side fetch to the API sends renderHeaders', () => {
  const offenders = []
  for (const file of walk(SRC)) {
    const source = readFileSync(file, 'utf8')
    if (!/\bfetch\(/.test(source)) continue
    if (/^\s*['"]use client['"]/.test(source)) continue
    const name = relative(SRC, file)
    if (NOT_SERVER_SIDE.has(name)) continue
    if (!/renderHeaders\(|publicFetchOptions\(/.test(source)) offenders.push(name)
  }
  assert.deepEqual(offenders, [], `server-side fetch without renderHeaders: ${offenders.join(', ')}`)
})

test('the origin secret is never a public variable', () => {
  for (const file of walk(SRC)) {
    assert.ok(!/NEXT_PUBLIC_ORIGIN_AUTH/.test(readFileSync(file, 'utf8')), relative(SRC, file))
  }
})
