import { NextResponse } from 'next/server'

/**
 * Centralized cookie configuration for authentication tokens
 *
 * Configuration adapts based on environment:
 * - Production (HTTPS): secure=true, sameSite='strict'
 * - Development (HTTP localhost): secure=false, sameSite='lax'
 */

// Determine environment
const isProduction = process.env.NODE_ENV === 'production'

export const COOKIE_CONFIG = {
  name: 'payload-token',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds (matches JWT expiration)
  httpOnly: true,
  secure: isProduction, // true for HTTPS production, false for HTTP localhost
  sameSite: isProduction ? ('strict' as const) : ('lax' as const), // strict for production, lax for development
  path: '/',
}

// Log cookie configuration for debugging
const environmentLabel = isProduction
  ? 'Production (HTTPS)'
  : 'Development (Localhost Only)'

console.log(`Cookie Configuration (${environmentLabel}):`, {
  secure: COOKIE_CONFIG.secure,
  sameSite: COOKIE_CONFIG.sameSite,
  httpOnly: COOKIE_CONFIG.httpOnly,
  nodeEnv: process.env.NODE_ENV || 'not set',
})

/**
 * Sets an HTTP-only authentication cookie on a NextResponse
 * @param response - The NextResponse object to set the cookie on
 * @param token - The JWT token to store in the cookie
 */
export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set(COOKIE_CONFIG.name, token, {
    httpOnly: COOKIE_CONFIG.httpOnly,
    secure: COOKIE_CONFIG.secure,
    sameSite: COOKIE_CONFIG.sameSite,
    maxAge: COOKIE_CONFIG.maxAge,
    path: COOKIE_CONFIG.path,
  })
}

/**
 * Clears the authentication cookie from a NextResponse
 * @param response - The NextResponse object to clear the cookie from
 */
export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_CONFIG.name, '', {
    httpOnly: COOKIE_CONFIG.httpOnly,
    secure: COOKIE_CONFIG.secure,
    sameSite: COOKIE_CONFIG.sameSite,
    maxAge: 0, // Expire immediately
    path: COOKIE_CONFIG.path,
  })
}
