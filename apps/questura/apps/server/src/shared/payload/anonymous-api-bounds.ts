import { APIError, type CollectionBeforeOperationHook, type Config, type Plugin } from 'payload'

import { checkPublicReadRateLimit } from '@/shared/http/public-read-rate-limit'

/**
 * Bounds on what an anonymous caller may ask of Payload's own REST and
 * GraphQL mounts.
 *
 * The public site never reads through them — it has `/api/public/*`, which is
 * rate limited, admitted, counted and cached. But the mounts are open, and a
 * dozen collections are readable anonymously. Measured on a local production
 * build (docs/capacity/STATUS.md, CAP-04): `GET /api/locations?limit=1000&depth=10`
 * returned **271 MB in 1.3 s** to an anonymous caller, and
 * `single-type-listicles?limit=100&depth=10` ran 8.7 s before failing. One
 * request, no limit, no bound: a bandwidth bill and a database outage for the
 * price of a URL.
 *
 * Anonymous reads are rate limited per IP (`payloadApi` scope) and clamped to `ANONYMOUS_MAX_LIMIT` documents and
 * `ANONYMOUS_MAX_DEPTH` levels, with pagination forced on (`pagination=false`
 * would otherwise return every row). Signed-in staff and service accounts —
 * the admin, the writer, Location Manager — are untouched: they authenticate,
 * and they use `limit` up to 200 and `depth` up to 2 today. The Local API
 * (`payloadAPI: 'local'`) is untouched.
 *
 * Whether these collections should be anonymously readable at all is a
 * separate access decision per collection; this only makes the current
 * access affordable.
 */

export const ANONYMOUS_MAX_LIMIT = 100
export const ANONYMOUS_MAX_DEPTH = 2

/**
 * The route wrapper (`mount-bounds.ts`) already charged this request to the
 * caller's `payloadApi` bucket. It marks the request it hands Payload so this
 * hook does not charge it again — one logical request, one token.
 *
 * The mark is a per-process random value, and the route deletes any incoming
 * copy before setting its own, so a caller cannot send it to skip the limit.
 * Without the mark (a regenerated route file, a mount nobody wrapped) the hook
 * charges as before: defence in depth, not a second budget.
 */
const COUNTED_HEADER = 'x-questura-mount-counted'
const store = globalThis as unknown as { __questuraMountCountedMark?: string }

function countedMark(): string {
  return (store.__questuraMountCountedMark ??= crypto.randomUUID())
}

export function markRouteCounted(headers: Headers): void {
  headers.set(COUNTED_HEADER, countedMark())
}

function routeCounted(headers: Headers | undefined): boolean {
  return headers?.get(COUNTED_HEADER) === countedMark()
}

type ReadArgs = { limit?: number; depth?: number; pagination?: boolean }

function isExternalAnonymous(req: { payloadAPI?: string; user?: unknown } | undefined): boolean {
  if (!req) return false
  if (req.payloadAPI !== 'REST' && req.payloadAPI !== 'GraphQL') return false
  return !req.user
}

export function clampAnonymousRead<T extends ReadArgs>(args: T): T {
  const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : ANONYMOUS_MAX_LIMIT
  const depth = typeof args.depth === 'number' && args.depth >= 0 ? args.depth : ANONYMOUS_MAX_DEPTH
  return {
    ...args,
    limit: Math.min(limit, ANONYMOUS_MAX_LIMIT),
    depth: Math.min(depth, ANONYMOUS_MAX_DEPTH),
    pagination: true,
  }
}

export const boundAnonymousReads: CollectionBeforeOperationHook = async ({ args, operation, req }) => {
  if (operation !== 'read' || !isExternalAnonymous(req)) return args

  // The same per-IP limiter as the public reads, in its own bucket. Fails
  // open with the rest of them if Redis is down; the clamp below still holds.
  if (routeCounted(req.headers)) return clampAnonymousRead(args as ReadArgs) as typeof args
  const limit = await checkPublicReadRateLimit(req.headers, 'payloadApi')
  if (!limit.allowed) throw new APIError('Too many requests. Please try again shortly.', 429)

  return clampAnonymousRead(args as ReadArgs) as typeof args
}

/** Adds the hook to every collection, first, so nothing reads before the clamp. */
export const anonymousApiBoundsPlugin: Plugin = (config: Config): Config => ({
  ...config,
  collections: (config.collections ?? []).map((collection) => ({
    ...collection,
    hooks: {
      ...collection.hooks,
      beforeOperation: [boundAnonymousReads, ...(collection.hooks?.beforeOperation ?? [])],
    },
  })),
})
