import { NextRequest, NextResponse } from 'next/server'

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'

export function middleware(req: NextRequest) {
  if (IS_DEVELOPMENT && req.nextUrl.pathname.startsWith('/api/')) {
    console.log(`${req.method} ${req.nextUrl.pathname}`)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
}
