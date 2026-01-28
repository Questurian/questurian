import { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import jwt from 'jsonwebtoken'
import type { JwtPayload } from '../types/jwt'
import type { User } from '@/payload-types'
import { APP_CONFIG } from '@/shared/config'

const JWT_SECRET = APP_CONFIG.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET or PAYLOAD_SECRET environment variable required')
}

export interface AuthResult {
  user: User | null
  error: string | null
  status: number
}

export interface AuthMiddlewareOptions {
  requireAuth?: boolean
  allowedRoles?: string[]
  requireEmailVerification?: boolean
}

/**
 * Validates token version to ensure session is still valid
 * Returns null if valid, error object if invalid
 */
function validateTokenVersion(decoded: JwtPayload, user: User): { error: string; status: number } | null {
  if (decoded?.tokenVersion !== undefined && user.tokenVersion !== undefined) {
    if (decoded.tokenVersion !== user.tokenVersion) {
      console.log('Auth Middleware - Token version mismatch:', {
        tokenVersion: decoded.tokenVersion,
        currentVersion: user.tokenVersion,
        userId: user.id
      })
      return {
        error: 'Session invalidated. Please log in again.',
        status: 401
      }
    }
  }
  return null
}

/**
 * Centralized authentication middleware for API routes
 * Implements dual auth strategy: Payload CMS auth + manual JWT fallback
 */
export async function authenticateRequest(
  req: NextRequest,
  options: AuthMiddlewareOptions = { requireAuth: true }
): Promise<AuthResult> {
  try {
    const payload = await getPayload({ config })

    // Extract token from Authorization header (Bearer) or cookie (fallback)
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : req.cookies.get('payload-token')?.value

    if (!token) {
      if (options.requireAuth) {
        return {
          user: null,
          error: 'No authentication token found',
          status: 401
        }
      }
      return { user: null, error: null, status: 200 }
    }

    let user: User | null = null

    // Strategy 1: Manual JWT verification first (more reliable for our custom tokens)
    try {
      console.log('Auth Middleware - Trying manual JWT verification...')
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
      console.log('Auth Middleware - JWT decoded:', { userId: decoded?.userId, id: decoded?.id, email: decoded?.email, tokenVersion: decoded?.tokenVersion })

      // Check for both userId and id fields for compatibility
      const userId = decoded.userId || decoded.id
      if (userId) {
        const userResult = await payload.findByID({
          collection: 'users',
          id: userId,
        })

        user = userResult

        // Token version validation - invalidate sessions on password change
        const validationError = validateTokenVersion(decoded, userResult)
        if (validationError) {
          return { user: null, ...validationError }
        }

        console.log('Auth Middleware - Manual JWT auth successful:', {
          id: user?.id,
          email: user?.email,
          role: user?.role,
          tokenVersion: user?.tokenVersion
        })
      } else {
        console.log('Auth Middleware - No userId/id found in JWT')
      }
    } catch (jwtError) {
      console.log('Auth Middleware - Manual JWT verification failed, trying Payload auth...', jwtError)

      // Strategy 2: Fallback to Payload's built-in auth
      try {
        console.log('Auth Middleware - Trying Payload auth...')
        const authResult = await payload.auth({
          headers: new Headers({
            authorization: authHeader || '',
            cookie: token && !authHeader ? `payload-token=${token}` : ''
          })
        })

        user = authResult.user
        console.log('Auth Middleware - Payload auth result:', {
          id: user?.id,
          email: user?.email,
          role: user?.role
        })

        // Token version validation for Payload auth tokens too
        if (user) {
          try {
            // Decode token without verification to extract tokenVersion
            const decoded = jwt.decode(token) as JwtPayload
            const validationError = validateTokenVersion(decoded, user)
            if (validationError) {
              return { user: null, ...validationError }
            }
          } catch (decodeError) {
            console.log('Auth Middleware - Could not decode token for version check:', decodeError)
            // If we can't decode, continue with Payload's validation
          }
        }

      } catch (payloadError) {
        console.log('Auth Middleware - Payload auth also failed:', payloadError)
        return {
          user: null,
          error: 'Invalid authentication token',
          status: 401
        }
      }
    }

    if (!user) {
      return {
        user: null,
        error: 'User not found',
        status: 401
      }
    }

    // Role-based access control (if specified)
    if (options.allowedRoles && options.allowedRoles.length > 0) {
      if (!options.allowedRoles.includes(user.role)) {
        return {
          user: null,
          error: `Access denied. Required roles: ${options.allowedRoles.join(', ')}`,
          status: 403
        }
      }
    }

    // Email verification check (if specified)
    // Admin and editor roles bypass email verification requirement
    if (options.requireEmailVerification && user.role !== 'admin' && user.role !== 'editor') {
      if (!user.emailVerified) {
        return {
          user: null,
          error: 'Email verification required. Please verify your email to access this feature.',
          status: 403
        }
      }
    }

    return {
      user,
      error: null,
      status: 200
    }

  } catch (error) {
    console.error('Auth Middleware - Unexpected error:', error)
    return {
      user: null,
      error: 'Authentication error',
      status: 500
    }
  }
}

// CORS utilities moved to shared/utils/cors.ts
// Import them from there instead of defining locally
export { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'