import { NextRequest, NextResponse } from 'next/server'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import {
  authenticateRequest,
  getCorsHeaders,
  handleCorsOptions,
} from '@/features/auth/lib/auth-middleware'
import { getErrorMessage } from '@/shared/utils/api-response'

import type { LocationGridScope } from './location-grid/types'
import { resolveLocationGridScopeFromLocation } from './location-grid/service'
import type { LocationHomepageDoc } from './resolve-page-blocks/types'

/**
 * The shared shape of every `*-candidates` route. Each route is `GET q/page/limit →
 * search → JSON`, differing only in the search function, the fallback error message, and
 * (for the location family) how the homepage doc resolves into a `locationKey` or `scope`.
 * This module collapses those 14 near-identical route files behind two factories so the
 * `parsePositiveInt` / auth / CORS / error boilerplate lives in exactly one place.
 */

/** Superset of the params accepted by the per-block `searchXCandidates` functions. */
export type CandidateSearchParams = {
  query?: string
  page?: number
  limit?: number
  type?: string | null
  authorIds?: number[]
  locationKey?: string
  scope?: LocationGridScope
}

/**
 * A per-block `searchXCandidates` function as the factory invokes it: with the assembled
 * `CandidateSearchParams` (the caller is responsible — via `extraParams` / `resolveContext`
 * — for supplying any params a given search requires, e.g. location-grid's `scope`).
 */
type CandidateSearch = (payload: Payload, params: CandidateSearchParams) => Promise<unknown>

type CandidateSearchOptions = {
  /**
   * The per-block `searchXCandidates` function. Typed with a `never` parameter so every
   * concrete search — including ones with a narrower, partly-required options type like
   * location-grid — is assignable here; the factory casts to {@link CandidateSearch} to call it.
   */
  search: (payload: Payload, params: never) => Promise<unknown>
  /** Fallback error message when the search throws. */
  fallbackMessage: string
}

type RouteHandlers = {
  GET: (req: NextRequest) => Promise<NextResponse>
  OPTIONS: (req: NextRequest) => NextResponse | Promise<NextResponse>
}

type LocationRouteHandlers = {
  GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<NextResponse>
  OPTIONS: (req: NextRequest) => NextResponse | Promise<NextResponse>
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined
}

function baseParams(searchParams: URLSearchParams): CandidateSearchParams {
  const authorIds = searchParams
    .getAll('authorId')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0)
  return {
    query: searchParams.get('q') || undefined,
    page: parsePositiveInt(searchParams.get('page')),
    limit: parsePositiveInt(searchParams.get('limit')),
    ...(authorIds.length ? { authorIds } : {}),
  }
}

async function authorize(
  req: NextRequest,
  headers: Record<string, string>,
): Promise<NextResponse | null> {
  const authResult = await authenticateRequest(req, {
    requireAuth: true,
    allowedRoles: ['admin', 'editor'],
  })
  if (authResult.error) {
    return NextResponse.json({ message: authResult.error }, { status: authResult.status, headers })
  }
  return null
}

/**
 * A homepage (global / main-homepage) candidates route: authorize → search → JSON. Pass
 * `extraParams` to fold request-derived (`type`) or constant (`scope`) params into the search.
 */
export function createCandidateHandler(
  opts: CandidateSearchOptions & {
    extraParams?: (searchParams: URLSearchParams) => CandidateSearchParams
  },
): RouteHandlers {
  return {
    async GET(req) {
      const headers = getCorsHeaders(req)
      try {
        const unauthorized = await authorize(req, headers)
        if (unauthorized) return unauthorized

        const payload = await getPayload({ config })
        const { searchParams } = new URL(req.url)
        const response = await (opts.search as CandidateSearch)(payload, {
          ...baseParams(searchParams),
          ...opts.extraParams?.(searchParams),
        })
        return NextResponse.json(response, { headers })
      } catch (error) {
        return NextResponse.json(
          { message: getErrorMessage(error, opts.fallbackMessage) },
          { status: 500, headers },
        )
      }
    },
    OPTIONS(req) {
      return handleCorsOptions(req)
    },
  }
}

/** A resolved per-location context, or a 400 reason the doc can't back this block. */
export type LocationCandidateContext =
  | { ok: true; params: CandidateSearchParams }
  | { ok: false; message: string }

function locationDoc(doc: LocationHomepageDoc): LocationHomepageDoc['location'] {
  return typeof doc.location === 'object' && doc.location !== null ? doc.location : null
}

/** Resolves the doc's `locationKey` (used to bias hotel / tour / eat-drink / things-to-do search). */
export function withLocationKey(doc: LocationHomepageDoc): LocationCandidateContext {
  const location = locationDoc(doc)
  const locationKey =
    location &&
    typeof location === 'object' &&
    typeof location.locationKey === 'string' &&
    location.locationKey.trim()
      ? location.locationKey.trim()
      : null
  if (!locationKey) {
    return {
      ok: false,
      message: 'Location homepage is missing a location with a valid location key.',
    }
  }
  return { ok: true, params: { locationKey } }
}

/** Resolves the doc's location-grid `scope` (city-only); 400s on neighborhoods. */
export function withLocationGridScope(doc: LocationHomepageDoc): LocationCandidateContext {
  const location = locationDoc(doc)
  const scope = resolveLocationGridScopeFromLocation(
    location && typeof location === 'object' ? location : null,
  )
  if (!scope) {
    return { ok: false, message: 'Location Grid blocks are only available on city homepages.' }
  }
  return { ok: true, params: { scope } }
}

/**
 * A per-location (`/api/location-homepages/[id]/*-candidates`) route: authorize → load the
 * homepage doc → `resolveContext` it into search params (or a 400) → search → JSON.
 */
export function createLocationCandidateHandler(
  opts: CandidateSearchOptions & {
    resolveContext: (doc: LocationHomepageDoc) => LocationCandidateContext
  },
): LocationRouteHandlers {
  return {
    async GET(req, { params }) {
      const headers = getCorsHeaders(req)
      try {
        const unauthorized = await authorize(req, headers)
        if (unauthorized) return unauthorized

        const { id } = await params
        const payload = await getPayload({ config })
        const doc = (await payload.findByID({
          collection: 'location-homepages',
          id,
          depth: 1,
          overrideAccess: true,
        })) as LocationHomepageDoc

        const context = opts.resolveContext(doc)
        if (!context.ok) {
          return NextResponse.json({ message: context.message }, { status: 400, headers })
        }

        const { searchParams } = new URL(req.url)
        const response = await (opts.search as CandidateSearch)(payload, {
          ...baseParams(searchParams),
          ...context.params,
        })
        return NextResponse.json(response, { headers })
      } catch (error) {
        return NextResponse.json(
          { message: getErrorMessage(error, opts.fallbackMessage) },
          { status: 500, headers },
        )
      }
    },
    OPTIONS(req) {
      return handleCorsOptions(req)
    },
  }
}
