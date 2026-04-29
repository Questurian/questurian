import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === '/') {
    if (request.nextUrl.searchParams.has('browse')) {
      return NextResponse.next();
    }

    const locationCookie = request.cookies.get('questura-location-redirect')?.value;

    if (locationCookie) {
      try {
        const parsed = JSON.parse(decodeURIComponent(locationCookie)) as {
          cityId?: string;
          country?: string;
        };
        const cityId = parsed.cityId;
        const country = parsed.country;
        if (cityId && country) {
          return NextResponse.redirect(new URL(`/${country}/${cityId}`, request.url));
        }
      } catch {
        // Invalid cookie, continue to home page
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|_static|favicon).*)'],
};
