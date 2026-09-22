/**
 * Loopback only, enforced in the process rather than promised by a comment.
 *
 * Loaded into every sandbox process with `NODE_OPTIONS=--require <this file>`
 * (see `apps.ts` and `bootstrap.ts`). It wraps the one place every outbound
 * TCP connection in Node passes through — `net.Socket.prototype.connect`,
 * which `http`, `https`, `undici`/`fetch`, `pg` and `ioredis` all end in — and
 * refuses any destination that is not this machine. A missing credential can
 * then never turn into a real request to Stripe, Bunny, Google, Resend or an
 * OAuth provider: the attempt fails loudly at the socket and is recorded.
 *
 * Refused attempts are appended as JSON lines to `READINESS_OUTBOUND_LOG`
 * (host and port only — never a path, query or header), so a run can assert
 * afterwards that nothing tried.
 *
 * Names under `.localhost` (RFC 6761: always loopback) are connected to
 * 127.0.0.1 directly. The browser-facing sandbox origins are
 * `app.readiness.localhost` / `api.readiness.localhost`; a browser resolves
 * them to loopback on its own, and a Node process asking the OS resolver
 * might not, so the guard makes the two agree rather than refusing them.
 *
 * `READINESS_OUTBOUND_ALLOW` is a comma-separated host allowlist for the one
 * case that needs it: `next build` fetching Google Fonts for `next/font`.
 * Build only, stated in the run manifest, never set for a running server.
 */
'use strict'

const net = require('node:net')
const fs = require('node:fs')

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'])
const allow = new Set(
  (process.env.READINESS_OUTBOUND_ALLOW || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
)
const logPath = process.env.READINESS_OUTBOUND_LOG || ''

function destination(args) {
  const first = args[0]
  if (Array.isArray(first)) return destination(first)
  if (first && typeof first === 'object') {
    if (first.path) return { host: 'unix', port: 0, local: true }
    return { host: String(first.host || 'localhost').toLowerCase(), port: Number(first.port) || 0 }
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return { host: 'unix', port: 0, local: true }
  return { host: String(args[1] || 'localhost').toLowerCase(), port: Number(first) || 0 }
}

function record(entry) {
  if (!logPath) return
  try {
    fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...entry }) + '\n')
  } catch {
    // Recording must never be the thing that breaks the process.
  }
}

/**
 * The same connect call, aimed at 127.0.0.1. `net.connect` hands `connect`
 * a pre-normalised array tagged with an internal symbol, so that array is
 * edited in place rather than copied.
 */
function toLoopback(args) {
  const first = args[0]
  if (Array.isArray(first)) {
    if (first[0] && typeof first[0] === 'object') first[0] = { ...first[0], host: '127.0.0.1' }
    return args
  }
  if (first && typeof first === 'object') return [{ ...first, host: '127.0.0.1' }, ...args.slice(1)]
  return [args[0], '127.0.0.1', ...args.slice(2)]
}

const original = net.Socket.prototype.connect
net.Socket.prototype.connect = function guardedConnect(...args) {
  const target = destination(args)
  const host = target.host.replace(/^\[|\]$/g, '')
  if (target.local || LOOPBACK.has(host) || allow.has(host)) {
    return original.apply(this, args)
  }
  if (host.endsWith('.localhost')) {
    return original.apply(this, toLoopback(args))
  }
  record({ refused: true, host, port: target.port })
  const error = new Error(
    `Readiness sandbox refused an outbound connection to ${host}:${target.port}. ` +
      'Sandbox processes are loopback only (scripts/readiness/deny-outbound.cjs).',
  )
  error.code = 'EREADINESSOUTBOUND'
  process.nextTick(() => this.destroy(error))
  return this
}

module.exports = { LOOPBACK }
