import { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import jwt from 'jsonwebtoken'
import type { AuthMiddlewareOptions, AuthResult, JwtPayload } from '../types'
import type { User } from '@/payload-types'
import { APP_CONFIG } from '@/shared/config'
import { tryVerifyJwtWithAppSecrets } from './verify-jwt-with-app-secrets'

const JWT_SECRET = APP_CONFIG.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET or PAYLOAD_SECRET environment variable required')
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

    // Strategy 1: Manual JWT verification (custom tokens + Payload tokens when secrets differ)
    const decodedManual = tryVerifyJwtWithAppSecrets(token)

    if (decodedManual) {
      const userId = decodedManual.userId || decodedManual.id
      if (userId) {
        const userResult = await payload.findByID({
          collection: 'users',
          id: userId,
        })

        user = userResult

        const validationError = validateTokenVersion(decodedManual, userResult)
        if (validationError) {
          return { user: null, ...validationError }
        }
      }
    }

    if (!user) {
      // Strategy 2: Payload's built-in auth (cookies / Bearer handled by Payload)
      try {
        const authResult = await payload.auth({
          headers: new Headers({
            authorization: authHeader || '',
            cookie: token && !authHeader ? `payload-token=${token}` : ''
          })
        })

        user = authResult.user

        // Token version validation for Payload auth tokens too
        if (user) {
          try {
            const decoded = jwt.decode(token) as JwtPayload
            const validationError = validateTokenVersion(decoded, user)
            if (validationError) {
              return { user: null, ...validationError }
            }
          } catch (decodeError) {
            if (process.env.NODE_ENV === 'development') {
              console.log('Auth Middleware - Could not decode token for version check:', decodeError)
            }
          }
        }

      } catch (payloadError) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Auth Middleware - Payload auth failed:', payloadError)
        }
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
