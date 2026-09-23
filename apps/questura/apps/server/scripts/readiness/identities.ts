import { connect } from 'node:net'

import { Pool } from 'pg'

import type { LaunchManifest } from './launch-corpus'
import { SYNTHETIC_PASSWORD } from './launch-corpus'

/**
 * Real sessions for the synthetic readers, made the way a browser makes them
 * (surge plan L01).
 *
 * Each identity signs in through `POST /api/visitor-auth/sign-in/email` on
 * the running sandbox backend: real password verification, a real signed
 * session cookie, real rate limits. Nothing mocks `/api/me`. The expired
 * identity signs in and then has its session expired the way time would do
 * it: the stored `expiresAt` moves into the past, and the Redis copy (whose
 * TTL would have lapsed at the same moment) is removed. Its cookie is
 * well-formed and correctly signed and still proves nobody.
 *
 * Deleting only the Redis key used to be enough. Since sessions are also
 * stored in Postgres (`storeSessionInDatabase`), a Redis miss falls back to
 * the table, deliberately, so a Redis flush signs nobody out. Removing the
 * key alone now models a Redis flush, not an expiry.
 *
 * Session keys are the bare token: Better Auth's secondary storage does not
 * apply `REDIS_KEY_PREFIX`. That is why the sandbox runs its own Redis on
 * 6390 rather than trusting a prefix for isolation (surge plan L00).
 *
 * Cookies exist only in memory for the run that made them. They are never
 * written to the manifest, a log or an evidence file; `redact()` is what
 * evidence uses instead.
 */

export type SessionJar = Map<string, string>

function sessionCookie(setCookie: string[]): string | null {
  for (const header of setCookie) {
    const pair = header.split(';')[0]!.trim()
    if (/^(__Secure-)?questura_visitor\.session_token=/.test(pair)) return pair
  }
  return null
}

export async function signIn(backend: string, origin: string, email: string, clientAddress: string): Promise<string> {
  const response = await fetch(`${backend}/api/visitor-auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      // Synthetic client address (RFC 5737 TEST-NET), so sign-ins do not all
      // land in one limiter bucket.
      'cf-connecting-ip': clientAddress,
    },
    body: JSON.stringify({ email, password: SYNTHETIC_PASSWORD }),
    redirect: 'manual',
  })
  const cookie = sessionCookie(response.headers.getSetCookie())
  if (!response.ok || !cookie) {
    throw new Error(`Sign-in for ${email} failed: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`)
  }
  return cookie
}

/** One RESP command against the sandbox Redis (loopback, never 6379). */
function redisCommand(redisUrl: string, parts: string[]): Promise<string> {
  const url = new URL(redisUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port === '6379' || !url.port) {
    throw new Error('Refusing to touch a Redis that is not the sandbox’s own.')
  }
  const payload = `*${parts.length}\r\n` + parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: Number(url.port) }, () => socket.write(payload))
    socket.once('data', (chunk) => {
      socket.end()
      resolve(chunk.toString())
    })
    socket.once('error', reject)
    socket.setTimeout(3_000, () => {
      socket.destroy()
      reject(new Error('Redis did not answer.'))
    })
  })
}

export type SessionStores = { redisUrl: string; databaseUri: string }

/** Expire a session the way time would: past `expiresAt`, Redis copy gone. */
export async function expireSession(stores: SessionStores, cookie: string): Promise<void> {
  const value = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
  const token = value.split('.')[0]!

  if (new URL(stores.databaseUri).pathname !== '/questura_readiness') {
    throw new Error('Refusing to touch a database that is not the sandbox’s own.')
  }
  const pool = new Pool({ connectionString: stores.databaseUri, max: 1 })
  try {
    const updated = await pool.query(
      `UPDATE visitor_auth_sessions SET "expiresAt" = now() - interval '1 minute' WHERE token = $1`,
      [token],
    )
    if (updated.rowCount !== 1) throw new Error('The expired identity’s session was not in the sessions table.')
  } finally {
    await pool.end()
  }

  const answer = await redisCommand(stores.redisUrl, ['DEL', token])
  if (!answer.startsWith(':1')) throw new Error('The expired identity’s session was not in the session store.')
}

export async function signInAll(
  manifest: Pick<LaunchManifest, 'identities'>,
  options: { backend: string; origin: string } & SessionStores,
): Promise<SessionJar> {
  const jar: SessionJar = new Map()
  for (const [index, identity] of manifest.identities.entries()) {
    const cookie = await signIn(options.backend, options.origin, identity.email, `192.0.2.${10 + index}`)
    jar.set(identity.label, cookie)
    if (identity.label === 'expired') await expireSession(options, cookie)
  }
  return jar
}

/** For evidence: which identity, never the cookie. */
export function redact(cookie: string | undefined): string {
  if (!cookie) return 'none'
  const [name] = cookie.split('=')
  return `${name}=<redacted ${cookie.length - (name?.length ?? 0) - 1} chars>`
}

/**
 * Many sessions per signed-in identity, each signed in from its own
 * synthetic address, so a load run is many readers rather than one reader
 * whose cookie every virtual user shares. Sharing one session made the
 * per-session guard (120 requests/min) throttle the harness, correctly — one
 * real reader does not make hundreds of private requests a minute.
 */
export async function signInMany(
  manifest: Pick<LaunchManifest, 'identities'>,
  options: { backend: string; origin: string; perIdentity: number } & SessionStores,
): Promise<Record<string, string[]>> {
  const sessions: Record<string, string[]> = {}
  let address = 0
  for (const identity of manifest.identities) {
    const count = identity.label === 'expired' ? 1 : options.perIdentity
    sessions[identity.label] = []
    for (let index = 0; index < count; index += 1) {
      address += 1
      const client = `198.51.100.${(address % 250) + 1}`
      const cookie = await signIn(options.backend, options.origin, identity.email, client)
      if (identity.label === 'expired') await expireSession(options, cookie)
      sessions[identity.label]!.push(cookie)
    }
  }
  return sessions
}
