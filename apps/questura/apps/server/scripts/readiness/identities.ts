import { connect } from 'node:net'

import type { LaunchManifest } from './launch-corpus'
import { SYNTHETIC_PASSWORD } from './launch-corpus'

/**
 * Real sessions for the synthetic readers, made the way a browser makes them
 * (surge plan L01).
 *
 * Each identity signs in through `POST /api/visitor-auth/sign-in/email` on
 * the running sandbox backend: real password verification, a real signed
 * session cookie, real rate limits. Nothing mocks `/api/me`. The expired
 * identity signs in and then has its session removed from the session store
 * — in production mode Better Auth keeps sessions in Redis with a TTL, and an
 * expired session is exactly an absent key — so its cookie is well-formed and
 * correctly signed and still proves nobody.
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

/** Expire a session the way its TTL would: the store forgets it. */
export async function expireSession(redisUrl: string, cookie: string): Promise<void> {
  const value = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
  const token = value.split('.')[0]!
  const answer = await redisCommand(redisUrl, ['DEL', token])
  if (!answer.startsWith(':1')) throw new Error('The expired identity’s session was not in the session store.')
}

export async function signInAll(
  manifest: Pick<LaunchManifest, 'identities'>,
  options: { backend: string; origin: string; redisUrl: string },
): Promise<SessionJar> {
  const jar: SessionJar = new Map()
  for (const [index, identity] of manifest.identities.entries()) {
    const cookie = await signIn(options.backend, options.origin, identity.email, `192.0.2.${10 + index}`)
    jar.set(identity.label, cookie)
    if (identity.label === 'expired') await expireSession(options.redisUrl, cookie)
  }
  return jar
}

/** For evidence: which identity, never the cookie. */
export function redact(cookie: string | undefined): string {
  if (!cookie) return 'none'
  const [name] = cookie.split('=')
  return `${name}=<redacted ${cookie.length - (name?.length ?? 0) - 1} chars>`
}
