import { APP_CONFIG } from '@/shared/config'

import { visitorAuthRedis } from './redis-secondary-storage'

/**
 * Revoked sessions, made to stick within about a second.
 *
 * Better Auth hands each reader a signed copy of their session in a cookie
 * (`cookieCache` in `better-auth.ts`) and trusts it for five minutes, so most
 * `/api/me` calls skip the session store. Left alone, that meant a session
 * revoked elsewhere — a password change or reset, "sign out of all devices",
 * a sign-out — kept working for up to five minutes on the device holding the
 * copy.
 *
 * The fix keeps the cache and adds one fact beside it: *which readers had a
 * session revoked in the last few minutes*. It is one small Redis sorted set
 * (user id → when), shared by every instance. Each instance keeps its own
 * snapshot of the set and refreshes it at most once a second, whatever the
 * traffic, so the cost is one Redis round trip per instance per second rather
 * than one per request. A reader on the list is looked up in the session store
 * instead of trusting their cookie copy, until the list forgets them (the
 * cache's five minutes plus a margin, after which no copy made before the
 * revocation can still be alive).
 *
 * Revocations are rare and every entry is one reader, so the set stays tiny.
 * Being on the list only ever costs that reader a store lookup; it never signs
 * anybody out on its own.
 *
 * If Redis cannot be read, the last snapshot stays in use and the next attempt
 * waits a second: a Redis outage must not add a timeout to every identity
 * check. A revocation made during that outage is still enforced by the store
 * lookup at the five-minute mark, as before this existed.
 */

/** How long Better Auth trusts its signed session cookie, in seconds. */
export const SESSION_COOKIE_CACHE_SECONDS = 5 * 60

/** A revocation is remembered for the cookie cache's lifetime plus a margin for clocks and slow requests. */
export const REVOCATION_WINDOW_MS = (SESSION_COOKIE_CACHE_SECONDS + 60) * 1000

const KEY = 'questura:visitor-auth:session-revocations'

function readPollMs(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.VISITOR_SESSION_REVOCATION_POLL_MS)
  return Number.isInteger(value) && value >= 100 && value <= 10_000 ? value : 1_000
}

export type RevocationStore = {
  /** Remember that `userId` had sessions revoked at `at` (ms). */
  record(userId: string, at: number): Promise<void>
  /** Every reader revoked at or after `fromMs`, with when. */
  since(fromMs: number): Promise<Array<[userId: string, at: number]>>
}

export function redisRevocationStore(redis = visitorAuthRedis): RevocationStore {
  return {
    async record(userId, at) {
      const client = redis()
      // GT: a late write from a slow instance never moves a revocation back in time.
      await client
        .multi()
        .zadd(KEY, 'GT', at, userId)
        .zremrangebyscore(KEY, '-inf', at - REVOCATION_WINDOW_MS)
        .pexpire(KEY, REVOCATION_WINDOW_MS)
        .exec()
    },
    async since(fromMs) {
      const flat = await redis().zrangebyscore(KEY, fromMs, '+inf', 'WITHSCORES')
      const rows: Array<[string, number]> = []
      for (let i = 0; i + 1 < flat.length; i += 2) rows.push([flat[i]!, Number(flat[i + 1])])
      return rows
    },
  }
}

/** One process only: for a local run without Redis, where there is only one process. */
export function memoryRevocationStore(): RevocationStore {
  const entries = new Map<string, number>()
  return {
    async record(userId, at) {
      entries.set(userId, Math.max(at, entries.get(userId) ?? 0))
    },
    async since(fromMs) {
      return [...entries].filter(([, at]) => at >= fromMs)
    },
  }
}

export type RevocationRegistry = {
  /** Call after sessions of `userId` were revoked. Never throws. */
  record(userId: string): Promise<void>
  /** Whether `userId` had a session revoked recently enough that a cookie copy may predate it. */
  isRecentlyRevoked(userId: string): Promise<boolean>
}

export function createRevocationRegistry(options: {
  store: RevocationStore
  pollMs?: number
  now?: () => number
  log?: (message: string) => void
}): RevocationRegistry {
  const { store } = options
  const pollMs = options.pollMs ?? readPollMs()
  const now = options.now ?? Date.now
  const log = options.log ?? ((message: string) => console.error(message))

  let snapshot = new Map<string, number>()
  // Written by this instance: kept even if the shared write failed.
  const local = new Map<string, number>()
  let fetchedAt = Number.NEGATIVE_INFINITY
  let inflight: Promise<void> | null = null
  let failing = false

  const refresh = async (): Promise<void> => {
    const started = now()
    try {
      const rows = await store.since(started - REVOCATION_WINDOW_MS)
      const next = new Map(rows)
      for (const [userId, at] of local) {
        if (at >= started - REVOCATION_WINDOW_MS && at > (next.get(userId) ?? 0)) next.set(userId, at)
      }
      snapshot = next
      if (failing) log('visitor session revocations: reading the shared list again')
      failing = false
    } catch (error) {
      if (!failing) {
        log(
          `visitor session revocations: could not read the shared list, keeping the last one (${
            error instanceof Error ? error.message : String(error)
          })`,
        )
      }
      failing = true
    } finally {
      fetchedAt = started
    }
  }

  return {
    async record(userId) {
      const at = now()
      local.set(userId, at)
      snapshot.set(userId, at)
      for (const [id, when] of local) if (when < at - REVOCATION_WINDOW_MS) local.delete(id)
      try {
        await store.record(userId, at)
      } catch (error) {
        // The sessions are already gone from the store; only other instances'
        // cookie copies can outlive them now, and only for the cache's five minutes.
        log(
          `visitor session revocations: could not share a revocation (${
            error instanceof Error ? error.message : String(error)
          })`,
        )
      }
    },

    async isRecentlyRevoked(userId) {
      if (now() - fetchedAt >= pollMs) {
        inflight ??= refresh().finally(() => {
          inflight = null
        })
        await inflight
      }
      const at = snapshot.get(userId)
      return at !== undefined && at >= now() - REVOCATION_WINDOW_MS
    },
  }
}

export const sessionRevocations: RevocationRegistry = createRevocationRegistry({
  store: APP_CONFIG.redis.url ? redisRevocationStore() : memoryRevocationStore(),
})
