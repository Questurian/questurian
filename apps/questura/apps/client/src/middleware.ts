import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Only intercept requests to root "/"
  if (pathname === '/') {
    // Allow users to browse the home page without redirect
    if (request.nextUrl.searchParams.has('browse')) {
      return NextResponse.next();
    }

    const locationCookie = request.cookies.get('questura-location-redirect')?.value;

    if (locationCookie) {
      try {
        const { cityId, country, mode } = JSON.parse(locationCookie);
        if (cityId && country && mode) {
          return NextResponse.redirect(
            new URL(`/${country}/${cityId}/${mode}`, request.url)
          );
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
