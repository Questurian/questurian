import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import type { JwtPayload } from './features/auth/types/jwt'

const JWT_SECRET = process.env.JWT_SECRET || process.env.PAYLOAD_SECRET || ''
const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'

if (!JWT_SECRET) {
  console.error('⚠️ Middleware: JWT_SECRET or PAYLOAD_SECRET not configured')
}

export function middleware(req: NextRequest) {
  const startTime = Date.now()
  const pathname = req.nextUrl.pathname

  // Log API requests in development
  if (IS_DEVELOPMENT && pathname.startsWith('/api/')) {
    const method = req.method
    console.log(`📡 ${method} ${pathname}`)
  }

  // Only protect /admin routes
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next()
  }

  try {
    // Extract token from Authorization header (Bearer) or cookie
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : req.cookies.get('payload-token')?.value

    // No token: Allow access (user will see Payload login page)
    if (!token) {
      console.log('🔐 Middleware: No token found - allowing access to /admin login page')
      return NextResponse.next()
    }

    // Verify and decode token
    let decoded: JwtPayload
    try {
      decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
    } catch (error) {
      console.log('🔐 Middleware: Invalid/expired token - allowing access to /admin login page:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.next()
    }

    // Check user role (saved to JWT)
    const role = decoded.role
    if (role === 'admin' || role === 'editor') {
      // Allow staff roles through
      console.log('🔐 Middleware: Staff role detected, allowing access to /admin:', {
        userId: decoded.userId || decoded.id,
        role
      })
      return NextResponse.next()
    }

    // User role detected: silently redirect to frontend
    console.log('🔐 Middleware: Regular user (role: user) on /admin route, redirecting to frontend:', {
      userId: decoded.userId || decoded.id,
      role
    })
    return NextResponse.redirect(new URL(FRONTEND_URL))

  } catch (error) {
    console.error('🔐 Middleware: Unexpected error:', error)
    // On unexpected error, allow access (don't break login)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    // Protect all /admin routes
    '/admin/:path*',
    // Exclude static files and Next.js internals
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
}
