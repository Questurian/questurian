import { NextRequest, NextResponse } from 'next/server'

function isAssetPath(pathname: string): boolean {
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/api')) return true
  if (pathname.startsWith('/static')) return true
  if (pathname === '/favicon.ico' || pathname === '/robots.txt' || pathname === '/sitemap.xml') {
    return true
  }
  return /\.[a-zA-Z0-9]+$/.test(pathname)
}

const PUBLIC_FRONTEND_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://www.questurian.com'

function getPublicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'

  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return `${forwardedProto}://${host}`
  }

  return PUBLIC_FRONTEND_URL.replace(/\/+$/, '')
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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
