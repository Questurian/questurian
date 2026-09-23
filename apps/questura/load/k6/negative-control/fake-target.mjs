#!/usr/bin/env node
// A frontend and backend that can be told to be subtly wrong.
//
// L13's question is not "does the proof pass against a healthy target" — it
// is "would the proof notice if the target were broken in the ways that
// actually matter". Those failures are hard to arrange on a real system and
// trivial here: serve a different article's HTML, redirect somewhere else,
// tell a member they are anonymous, put a member's body in front of an
// anonymous reader, mark a private response cacheable, answer 503 slowly.
//
// Each fault is a named mode. `run.mjs` starts this server in each mode in
// turn and asserts that k6 exits nonzero. A mode that passes is a gate that
// does not work.
//
// Loopback only, no dependencies, nothing paid.

import { createServer } from 'node:http'

const FAULT = process.env.FAULT || 'none'
const PORT = Number(process.env.PORT || 3199)

const RIGHT_PAGE = '<!doctype html><html><body><h1>Lima</h1><span data-revision="lima-r7">ok</span></body></html>'
const WRONG_PAGE = '<!doctype html><html><body><h1>Medellín</h1><span data-revision="medellin-r3">ok</span></body></html>'
const MEMBER_BODY = 'MEMBER-ONLY-BODY-TEXT'

function pageHeaders(extra = {}) {
  return { 'content-type': 'text/html', 'cache-control': 'public, s-maxage=3600', ...extra }
}

const BOOTED_AT = Date.now()
const BOOT_ID = new Date(BOOTED_AT).toISOString()

/**
 * The backend's per-instance telemetry (`/api/internal/db-stats`), faked so
 * the supervisor's resource and telemetry rules can be shown to fire:
 *
 *   queue-growth      pool waiters climb steadily and never drain
 *   benign-spike      a short burst of waiters that drains to zero
 *   telemetry-missing the endpoint fails
 *   unknown-instance  the endpoint answers as a different process
 */
function dbStats(res) {
  const elapsedS = (Date.now() - BOOTED_AT) / 1000
  if (FAULT === 'telemetry-missing') {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end('{}')
    return
  }
  let waiting = 0
  if (FAULT === 'queue-growth') waiting = Math.floor(elapsedS * 3)
  if (FAULT === 'benign-spike') waiting = elapsedS > 2 && elapsedS < 4 ? 8 : 0
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(
    JSON.stringify({
      takenAt: new Date().toISOString(),
      instance: { id: FAULT === 'unknown-instance' ? 'stranger' : 'fake-1', startedAt: BOOT_ID },
      payloadPool: { total: 10, idle: 0, waiting },
      visitorAuthPool: { total: 5, idle: 5, waiting: 0 },
      admission: { query: { queued: 0 } },
    }),
  )
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname

  if (path === '/api/internal/db-stats') {
    dbStats(res)
    return
  }

  if (FAULT === 'slow') {
    setTimeout(() => {
      res.writeHead(200, pageHeaders())
      res.end(RIGHT_PAGE)
    }, 2_000)
    return
  }

  if (FAULT === 'all-503') {
    res.writeHead(503, { 'retry-after': '1', 'cache-control': 'no-store' })
    res.end('busy')
    return
  }

  if (path === '/api/me') {
    const signedIn = Boolean(req.headers.cookie)
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' }

    if (FAULT === 'identity-lies') {
      // A member's session silently stopped working.
      res.writeHead(200, headers)
      res.end(JSON.stringify({ authenticated: false, member: false }))
      return
    }
    if (FAULT === 'private-is-cacheable') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=60' })
      res.end(JSON.stringify({ authenticated: signedIn, member: signedIn }))
      return
    }
    res.writeHead(200, headers)
    res.end(JSON.stringify({ authenticated: signedIn, member: signedIn }))
    return
  }

  if (path === '/old-lima') {
    const destination = FAULT === 'wrong-redirect' ? '/somewhere-else' : '/peru/lima'
    res.writeHead(308, { Location: destination })
    res.end()
    return
  }

  if (path.startsWith('/api/public/')) {
    if (FAULT === 'slow-503') {
      setTimeout(() => {
        res.writeHead(503, { 'retry-after': '5', 'cache-control': 'no-store' })
        res.end('overloaded')
      }, 4_000)
      return
    }
    if (FAULT === 'refusal-without-retry-after') {
      res.writeHead(503, { 'cache-control': 'no-store' })
      res.end('overloaded')
      return
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // Everything else is the landing page.
  if (FAULT === 'wrong-content') {
    res.writeHead(200, pageHeaders())
    res.end(WRONG_PAGE)
    return
  }
  if (FAULT === 'member-body-to-anonymous') {
    res.writeHead(200, pageHeaders())
    res.end(RIGHT_PAGE.replace('</body>', `<p>${MEMBER_BODY}</p></body>`))
    return
  }
  if (FAULT === 'cacheable-with-cookie') {
    res.writeHead(200, pageHeaders({ 'set-cookie': 'session=abc; Path=/' }))
    res.end(RIGHT_PAGE)
    return
  }
  if (FAULT === 'reader-throttled') {
    res.writeHead(429, { 'retry-after': '1', 'cache-control': 'no-store' })
    res.end('slow down')
    return
  }

  res.writeHead(200, pageHeaders())
  res.end(RIGHT_PAGE)
})

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`fake-target listening on ${PORT} with FAULT=${FAULT}\n`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
