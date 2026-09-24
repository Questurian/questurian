/**
 * Sends the sandbox backend's calls to Google and Resend to the fake provider
 * (`oauth-fake.ts`) instead. Harness only: loaded into the readiness stack's
 * backend with `NODE_OPTIONS=--require <this file>` (`apps.ts`), never part
 * of the app.
 *
 * Better Auth's Google provider has its endpoints written into it, and the
 * app deliberately has no setting that moves them: a production switch that
 * sends Google sign-in elsewhere would be the backdoor the linking checks are
 * there to rule out. So the re-aiming happens here, in the process, on
 * `globalThis.fetch` (which Better Auth's `betterFetch`, Payload's Resend
 * adapter and Next's own patched fetch all end in), for exactly these URLs.
 *
 * Active only when `READINESS_SANDBOX=1` and `READINESS_FAKE_PROVIDER_URL` is
 * `http://127.0.0.1:<port>`. Anything else is left alone, and the socket guard
 * (`deny-outbound.cjs`) still refuses it.
 */
'use strict'

const target = process.env.READINESS_FAKE_PROVIDER_URL || ''

const ROUTES = new Map([
  ['https://oauth2.googleapis.com/token', '/google/token'],
  ['https://www.googleapis.com/oauth2/v3/certs', '/google/certs'],
  ['https://openidconnect.googleapis.com/v1/userinfo', '/google/userinfo'],
  ['https://www.googleapis.com/oauth2/v3/userinfo', '/google/userinfo'],
  ['https://api.resend.com/emails', '/resend/emails'],
])

function reroute(raw, base) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const path = ROUTES.get(`${url.origin}${url.pathname}`)
  if (!path) return null
  const next = new URL(path, base)
  next.search = url.search
  return next.toString()
}

if (process.env.READINESS_SANDBOX === '1' && target) {
  const base = new URL(target)
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port) {
    throw new Error('READINESS_FAKE_PROVIDER_URL must be http://127.0.0.1:<port>.')
  }
  const original = globalThis.fetch
  globalThis.fetch = function readinessFakeProviderFetch(input, init) {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input && input.url
    const next = raw ? reroute(raw, base) : null
    if (!next) return original(input, init)
    if (typeof input === 'string' || input instanceof URL) return original(next, init)
    return original(new Request(next, input), init)
  }
}

module.exports = { reroute, ROUTES }
