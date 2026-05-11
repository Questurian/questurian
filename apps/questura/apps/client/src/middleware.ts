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

function stripTrailingSlash(url: URL): URL | null {
  if (url.pathname === '/' || !url.pathname.endsWith('/')) return null
  const next = new URL(url.toString())
  next.pathname = url.pathname.replace(/\/+$/, '')
  return next
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
      return NextResponse.redirect(new URL(`/${country}/${cityId}`, request.url))
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
    return NextResponse.redirect(stripped, 301)
  }

  const homeRedirect = handleHomeGeoRedirect(request)
  if (homeRedirect) return homeRedirect

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next|_static|favicon.ico|robots.txt|sitemap.xml).*)'],
}
