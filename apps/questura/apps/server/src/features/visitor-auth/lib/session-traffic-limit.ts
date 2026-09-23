import { getClientIp, hashIdentifier, incrementCounters } from '@/shared/lib/rate-limit-counter'
import { logger } from '@/shared/utils/logger'

/**
 * A cheap, pre-authentication limit on session-bearing traffic.
 *
 * `/api/me`, bookmark refs and the saved-items list resolve a session before
 * they know who is asking. Nothing limited how often one caller could make
 * them do it: a valid-looking session flood could hold the private gate
 * continuously (discovery finding 2). This runs *before* the session lookup,
 * so it is keyed on what is known without the database:
 *
 *  - **the session token**, hashed. One browser tab is one token, so this is
 *    the closest thing to "one reader" available before authentication. A
 *    caller rotating invented tokens gets a fresh bucket each time — but an
 *    invented token fails Better Auth's signature check before any query, so
 *    rotation buys CPU, not database work.
 *  - **the client address**, hashed, as a coarse guardrail. A phone carrier
 *    or campus puts many readers behind one address, so this limit is
 *    deliberately high: it stops one address from monopolising the gate, not
 *    one person from reading.
 *
 * Fails **open**, with a stated reason: these are identity and saved-state
 * reads, and the private admission gate bounds them whether or not Redis
 * answers. A counter outage is not evidence of abuse, and refusing every
 * signed-in reader for it would be a self-inflicted logout. Member bodies and
 * bookmark writes keep their own fail-closed limits.
 */

const WINDOW_SECONDS = 60
/** Per token per minute. A reader's page asks two or three private questions. */
const DEFAULT_PER_SESSION = 120
/** Per address per minute: twenty a second, for everyone behind one NAT together. */
const DEFAULT_PER_IP = 1_200

function limit(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw || !/^\d+$/.test(raw)) return fallback
  const value = Number(raw)
  return value > 0 ? value : fallback
}

export type SessionTrafficDecision =
  | { allowed: true; degraded?: 'counter-unavailable' }
  | { allowed: false; retryAfterSeconds: number; scope: 'session' | 'ip' }

export async function checkSessionTrafficLimit(headers: Headers, token: string): Promise<SessionTrafficDecision> {
  const sessionKey = `private:rate-limit:session:${hashIdentifier(token)}`
  const ipKey = `private:rate-limit:ip:${hashIdentifier(getClientIp(headers))}`

  let session
  let ip
  try {
    // Both buckets in one script: one Redis round trip per private request.
    ;[session, ip] = await incrementCounters([sessionKey, ipKey], WINDOW_SECONDS)
  } catch (error) {
    logger.warn('Session traffic limit unavailable; admitting behind the private gate', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { allowed: true, degraded: 'counter-unavailable' }
  }

  if (session.count > limit('SESSION_TRAFFIC_PER_SESSION', DEFAULT_PER_SESSION)) {
    return { allowed: false, retryAfterSeconds: session.ttlSeconds, scope: 'session' }
  }
  if (ip.count > limit('SESSION_TRAFFIC_PER_IP', DEFAULT_PER_IP)) {
    return { allowed: false, retryAfterSeconds: ip.ttlSeconds, scope: 'ip' }
  }
  return { allowed: true }
}
