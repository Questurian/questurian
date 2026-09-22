import { NextResponse, type NextRequest } from 'next/server'

import { AdmissionRefused } from '@/shared/http/admission'
import { admitPublicWork, overloadedResponse } from '@/shared/http/public-read'
import {
  checkPublicReadRateLimit,
  publicReadRateLimitResponse,
} from '@/shared/http/public-read-rate-limit'

import { isDisabledStaff } from '@/features/auth/lib/staff-status'

import { ANONYMOUS_MAX_DEPTH, ANONYMOUS_MAX_LIMIT, markRouteCounted } from './anonymous-api-bounds'

/**
 * Bounds on Payload's own mounts, applied to the whole request.
 *
 * `anonymous-api-bounds.ts` clamps each *collection read* through a
 * `beforeOperation` hook. Three things it cannot reach:
 *
 *  - **Globals.** The plugin decorates collections. `/api/globals/main-homepage`
 *    is anonymously readable and takes `depth` from the query string, so it
 *    was unbounded by exactly the mechanism that bounds everything else.
 *  - **The request, as opposed to the read.** A hook admits nothing: there
 *    was no limit on how many of these could run at once, so the mount could
 *    hold the whole Payload pool while `/api/public/*` queued behind it.
 *  - **GraphQL.** One POST can carry many aliased root fields. Clamping each
 *    to a hundred documents bounds each read and not the request.
 *
 * So the bound moves to the route, where it can hold a slot for as long as
 * the SQL actually takes — the hook could only take one and give it back
 * before the read ran.
 *
 * The generated route files say not to modify them, and they mean it: Payload
 * rewrites them. The durable strategy is that they stay two lines long —
 * import this and export it — and `mount-bounds.test.ts` fails if a
 * regeneration drops the import. A test is a more reliable guard than a
 * comment in a file that is designed to be overwritten.
 */

/**
 * Who is calling a Payload mount, decided by proving it rather than by
 * noticing a header.
 *
 * This used to be a presence check: any `Authorization` or `x-api-key` header,
 * or a cookie whose text mentioned a session, skipped the rate limit, the
 * URL clamp and whole-request admission. Payload's strategies answer a bad
 * credential with `{ user: null }` rather than a refusal, so a made-up header
 * bought an anonymous read with none of the anonymous bounds. The discovery
 * probe that found it (2026-09-22, finding 1) is the reason these tests
 * assert on what the handler received, not on what the header looked like.
 *
 *  - `anonymous`: nothing Payload could authenticate was presented.
 *  - `unverified`: something was presented and it proved nobody — forged,
 *    expired, revoked, or a disabled staff account. Treated exactly as
 *    anonymous, with the credential removed before Payload sees it so it is
 *    not verified a second time.
 *  - `staff` / `service`: a verified, active identity. Its reads keep their
 *    own limits, inside a finite gate of their own.
 */
export type MountCaller = 'anonymous' | 'unverified' | 'staff' | 'service'

/** The subset of a Payload user this decision reads. */
export type MountIdentity = { collection?: string; status?: string | null } | null

/**
 * Resolve the identity Payload would resolve for these headers. The default
 * asks Payload itself (`payload.auth`), which runs the same JWT and API-key
 * strategies the REST and GraphQL handlers run.
 */
export type ResolveMountIdentity = (headers: Headers) => Promise<MountIdentity>

const defaultResolveIdentity: ResolveMountIdentity = async (headers) => {
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@/payload.config')])
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers })
  return (user as MountIdentity) ?? null
}

/** Payload's own session cookie. Visitor (Better Auth) cookies authenticate nothing here. */
const PAYLOAD_COOKIE = 'payload-token'

function cookiePairs(header: string | null): Array<[string, string]> {
  if (!header) return []
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf('=')
      return at < 0 ? [part, ''] : [part.slice(0, at).trim(), part.slice(at + 1)]
    })
}

/**
 * True when the request carries something Payload would try to authenticate:
 * an `Authorization` header (JWT or API key) or a cookie *named* exactly
 * `payload-token`. A cookie that merely mentions a session in its text is not
 * a credential, and neither is a visitor session — Payload has no strategy
 * for either, so treating them as one only ever bought a bypass.
 */
export function presentsCredential(req: Pick<Request, 'headers'>): boolean {
  if (req.headers.get('authorization')) return true
  return cookiePairs(req.headers.get('cookie')).some(([name]) => name === PAYLOAD_COOKIE)
}

/**
 * Verify, once, who is calling. Throws when the verification itself fails
 * (database or Payload unavailable) — the caller answers 503 rather than
 * guessing, because guessing "anonymous" would hand a staff read clamped,
 * access-filtered results that look like real data.
 */
export async function classifyMountCaller(
  req: Pick<Request, 'headers'>,
  resolveIdentity: ResolveMountIdentity = defaultResolveIdentity,
): Promise<MountCaller> {
  if (!presentsCredential(req)) return 'anonymous'

  const identity = await resolveIdentity(req.headers)
  if (!identity) return 'unverified'
  if (identity.collection === 'service-accounts') return 'service'
  if (identity.collection === 'users' && !isDisabledStaff(identity)) return 'staff'
  return 'unverified'
}

/**
 * The request Payload should see for an anonymous read: no credential it
 * would verify again, and the mark that says the route has already counted
 * this request against the caller's rate limit (so the collection hook, which
 * stays as defence in depth, does not count it a second time).
 */
function anonymousHeaders(source: Headers): Headers {
  const headers = new Headers(source)
  headers.delete('authorization')
  const kept = cookiePairs(source.get('cookie')).filter(([name]) => name !== PAYLOAD_COOKIE)
  if (kept.length > 0) headers.set('cookie', kept.map(([name, value]) => `${name}=${value}`).join('; '))
  else headers.delete('cookie')
  markRouteCounted(headers)
  return headers
}

/**
 * Cap what an anonymous caller may ask for, in the URL, before Payload parses
 * it. `pagination=false` is the important one: it means "every row", and a
 * global or a collection that slipped past the hook would honour it.
 */
export function clampMountQuery(url: URL): URL {
  const bounded = new URL(url)
  const params = bounded.searchParams

  // An absent parameter is not a zero. `Number(null)` is 0, which is a
  // perfectly valid depth, so reading it that way would leave an unasked-for
  // depth unset and the mount's own default in charge.
  const asked = (name: string): number | null => {
    const raw = params.get(name)
    if (raw === null || raw.trim() === '') return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : Number.NaN
  }

  const depth = asked('depth')
  if (depth === null || Number.isNaN(depth) || depth > ANONYMOUS_MAX_DEPTH || depth < 0) {
    params.set('depth', String(ANONYMOUS_MAX_DEPTH))
  }

  const limit = asked('limit')
  if (limit === null || Number.isNaN(limit) || limit > ANONYMOUS_MAX_LIMIT || limit <= 0) {
    params.set('limit', String(ANONYMOUS_MAX_LIMIT))
  }

  params.set('pagination', 'true')

  return bounded
}

type Handler = (req: NextRequest, context: unknown) => Promise<Response> | Response

export type MountBoundsOptions = { resolveIdentity?: ResolveMountIdentity }

function refusal(error: unknown): Response | null {
  return error instanceof AdmissionRefused ? overloadedResponse(error) : null
}

function verificationUnavailable(): Response {
  return NextResponse.json(
    { message: 'Could not verify credentials. Please try again shortly.' },
    { status: 503, headers: { 'Retry-After': '1', 'Cache-Control': 'no-store' } },
  )
}

/**
 * Verify a presented credential inside its own gate, so a flood of invented
 * ones is a bounded amount of JWT and API-key work that cannot take the
 * public query gate's slots. `null` means verification itself failed.
 */
async function verifiedCaller(
  req: NextRequest,
  resolveIdentity: ResolveMountIdentity | undefined,
  signal: AbortSignal | undefined,
): Promise<MountCaller | null> {
  if (!presentsCredential(req)) return 'anonymous'
  try {
    return await admitPublicWork('credential', () => classifyMountCaller(req, resolveIdentity), signal)
  } catch (error) {
    if (error instanceof AdmissionRefused) throw error
    return null
  }
}

/**
 * Bound every read of the REST mount, whoever makes it.
 *
 * Order, and why:
 *
 *  1. Ingress admission, before anything that can wait on a dependency —
 *     the rate limiter is a Redis call and credential verification can be a
 *     database query, so both sit inside a gate that can say no first.
 *  2. Verify a presented credential once, in the `credential` gate.
 *  3. A verified staff or service caller keeps its own limits, inside the
 *     finite `staff` gate. Payload authenticates it again in the handler;
 *     that second check is one JWT or one indexed API-key lookup, bounded by
 *     the same gate, and Payload's REST handler offers no way to pass a
 *     resolved user in.
 *  4. Everyone else — no credential, or one that proved nobody — is one
 *     anonymous policy: per-IP limit, URL clamp, credential removed, and the
 *     `query` gate held until the handler has finished.
 *
 * Only GET. The mount also serves sign-in and other writes, which have their
 * own limits and must not be refused by a gate meant for reads.
 */
export function boundedRestRead(handler: Handler, options: MountBoundsOptions = {}): Handler {
  return async (req: NextRequest, context: unknown) => {
    if (req.method !== 'GET') return handler(req, context)
    const signal = req.signal ?? undefined

    try {
      return await admitPublicWork(
        'ingress',
        async () => {
          const caller = await verifiedCaller(req, options.resolveIdentity, signal)
          if (caller === null) return verificationUnavailable()

          if (caller === 'staff' || caller === 'service') {
            return admitPublicWork('staff', async () => handler(req, context), signal)
          }

          const limit = await checkPublicReadRateLimit(req.headers, 'payloadApi')
          if (!limit.allowed) return publicReadRateLimitResponse(limit.retryAfterSeconds)

          const clamped = clampMountQuery(new URL(req.url))
          // Rebuilt from method and headers rather than copied from `req`:
          // copying carries the abort signal across a Request boundary, and
          // the two sides do not always agree that an AbortSignal is an
          // AbortSignal. The signal is handed to the gate directly below.
          const bounded = new Request(clamped, {
            method: 'GET',
            headers: anonymousHeaders(req.headers),
          }) as NextRequest

          // The slot is held for the whole request, so it is released when the
          // SQL has finished rather than when the hook returned.
          return admitPublicWork('query', async () => handler(bounded, context), signal)
        },
        signal,
      )
    } catch (error) {
      const refused = refusal(error)
      if (refused) return refused
      throw error
    }
  }
}

/** Payload turns a POST carrying either header into a read (`handleEndpoints`). */
function overridesToRead(req: Pick<Request, 'method' | 'headers'>): boolean {
  if (req.method !== 'POST') return false
  return (
    req.headers.get('x-payload-http-method-override') === 'GET' ||
    req.headers.get('x-http-method-override') === 'GET'
  )
}

/**
 * The REST mount's POST, with its one disguised read bounded.
 *
 * Payload accepts `POST` plus `X-Payload-HTTP-Method-Override: GET` (or
 * `X-HTTP-Method-Override`) as a read with its query in the body — the admin
 * uses it for relationship pickers. Without this wrapper that read skipped
 * every route bound, because only `GET` was wrapped. A verified staff or
 * service caller keeps it, inside the `staff` gate. Anyone else is refused:
 * the public site never reads through the mount, and a body-borne query
 * cannot be clamped the way a URL can.
 *
 * Every other POST — sign-in, creates, uploads — passes straight through to
 * Payload and its own limits.
 */
export function boundedRestPost(handler: Handler, options: MountBoundsOptions = {}): Handler {
  return async (req: NextRequest, context: unknown) => {
    if (!overridesToRead(req)) return handler(req, context)
    const signal = req.signal ?? undefined

    try {
      return await admitPublicWork(
        'ingress',
        async () => {
          const caller = await verifiedCaller(req, options.resolveIdentity, signal)
          if (caller === null) return verificationUnavailable()
          if (caller !== 'staff' && caller !== 'service') {
            return NextResponse.json(
              { message: 'Method-override reads need a staff or service credential. Use GET.' },
              { status: 401, headers: { 'Cache-Control': 'no-store' } },
            )
          }
          return admitPublicWork('staff', async () => handler(req, context), signal)
        },
        signal,
      )
    } catch (error) {
      const refused = refusal(error)
      if (refused) return refused
      throw error
    }
  }
}

function graphQLRefusal(): Response {
  return NextResponse.json(
    {
      errors: [
        {
          message:
            'Anonymous GraphQL is closed. The public site reads through /api/public/*; staff and service accounts authenticate.',
        },
      ],
    },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * Anonymous GraphQL is closed — and "anonymous" means "proved nobody", not
 * "sent no header".
 *
 * Nothing in this repository calls `/api/graphql` — not the client, not the
 * writer, not Location Manager, which syncs over REST. It exists because
 * Payload mounts it. Meanwhile one POST can carry many aliased root fields,
 * fragments and relationship selections, so a per-read clamp bounds each read
 * and not the request.
 *
 * The refusal happens here, before GraphQL parses anything. Payload itself
 * would not refuse: a strategy that resolves nobody leaves `user: null` and
 * the query runs as a public read. So a credential is verified first (in the
 * bounded `credential` gate) and only a verified, active staff or service
 * identity reaches the handler, inside the `staff` gate.
 *
 * If a public GraphQL consumer ever appears, this is the file to reopen — and
 * a cost limiter becomes worth building at that point, not before.
 */
export function authenticatedGraphQLOnly(handler: Handler, options: MountBoundsOptions = {}): Handler {
  return async (req: NextRequest, context: unknown) => {
    if (!presentsCredential(req)) return graphQLRefusal()
    const signal = req.signal ?? undefined

    try {
      return await admitPublicWork(
        'ingress',
        async () => {
          const caller = await verifiedCaller(req, options.resolveIdentity, signal)
          if (caller === null) return verificationUnavailable()
          if (caller !== 'staff' && caller !== 'service') return graphQLRefusal()
          return admitPublicWork('staff', async () => handler(req, context), signal)
        },
        signal,
      )
    } catch (error) {
      const refused = refusal(error)
      if (refused) return refused
      throw error
    }
  }
}
