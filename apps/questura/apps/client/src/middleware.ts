import { NextRequest, NextResponse } from 'next/server'
import { originFromRequest } from '@/lib/seo/requestOrigin'
import {
  APPLE_PAY_DOMAIN_ASSOCIATION_BODY,
  APPLE_PAY_DOMAIN_ASSOCIATION_PATH,
  WELL_KNOWN_PREFIX,
} from '@/lib/wellKnown'

function isAssetPath(pathname: string): boolean {
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/api')) return true
  if (pathname.startsWith('/static')) return true
  if (pathname === '/favicon.ico' || pathname === '/robots.txt' || pathname === '/sitemap.xml') {
    return true
  }
  return /\.[a-zA-Z0-9]+$/.test(pathname)
}

function getPublicOrigin(request: NextRequest): string {
  return originFromRequest({
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    urlOrigin: request.nextUrl.origin,
  })
}

function redirectToPublicLocation(request: NextRequest, location: string, status = 307): NextResponse {
  return NextResponse.redirect(new URL(location, getPublicOrigin(request)), status)
}

function stripTrailingSlash(url: URL): string | null {
  if (url.pathname === '/' || !url.pathname.endsWith('/')) return null
  return `${url.pathname.replace(/\/+$/, '')}${url.search}`
}

function handleHomeGeoRedirect(request: NextRequest): NextResponse | null {
  if (request.nextUrl.pathname !== '/') return null
  if (request.nextUrl.searchParams.has('browse')) return null

  const locationCookie = request.cookies.get('questura-location-redirect')?.value
  if (!locationCookie) return null

  try {
    const parsed = JSON.parse(decodeURIComponent(locationCookie)) as {
      cityId?: string
      country?: string
    }
    const cityId = parsed.cityId
    const country = parsed.country
    if (cityId && country) {
      return redirectToPublicLocation(request, `/${country}/${cityId}`)
    }
  } catch {
    // Invalid cookie, fall through
  }
  return null
}

/**
 * `/.well-known/*` falls through to routing that cannot resolve a leading-dot
 * segment, and Next answers with its built-in 500 page. Middleware runs first,
 * so it is the only place that can answer at all. Serve the one file that is
 * meant to exist and give everything else the 404 it should always have been.
 */
function handleWellKnown(pathname: string): NextResponse | null {
  if (!pathname.startsWith(WELL_KNOWN_PREFIX)) return null

  if (pathname === APPLE_PAY_DOMAIN_ASSOCIATION_PATH) {
    return new NextResponse(APPLE_PAY_DOMAIN_ASSOCIATION_BODY, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      },
    })
  }

  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const wellKnown = handleWellKnown(pathname)
  if (wellKnown) return wellKnown

  if (isAssetPath(pathname)) {
    return NextResponse.next()
  }

  const stripped = stripTrailingSlash(request.nextUrl)
  if (stripped) {
    return redirectToPublicLocation(request, stripped, 301)
  }

  const homeRedirect = handleHomeGeoRedirect(request)
  if (homeRedirect) return homeRedirect

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next|_static|favicon.ico|robots.txt|sitemap.xml).*)'],
}
