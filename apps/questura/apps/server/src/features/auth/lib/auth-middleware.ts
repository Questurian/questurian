import { NextRequest } from 'next/server'
import { getPayload } from 'payload'

import config from '@/payload.config'
import type { AuthMiddlewareOptions, AuthResult } from '../types'
import type { User } from '@/payload-types'
import { isDisabledStaff } from './staff-status'

function isStaffRole(role: User['role']): role is 'admin' | 'editor' | 'writer' {
  return role === 'admin' || role === 'editor' || role === 'writer'
}

/**
 * Staff/Payload authentication for editorial and admin API routes.
 * Visitor auth is handled by BetterAuth and Current principal helpers.
 */
export async function authenticateRequest(
  req: NextRequest,
  options: AuthMiddlewareOptions = { requireAuth: true }
): Promise<AuthResult> {
  try {
    const payload = await getPayload({ config })
    const authResult = await payload.auth({ headers: req.headers })
    const user = authResult.user as User | null

    if (!user) {
      if (options.requireAuth) {
        return {
          user: null,
          error: 'Authentication required',
          status: 401,
        }
      }

      return { user: null, error: null, status: 200 }
    }

    if (!isStaffRole(user.role)) {
      return {
        user: null,
        error: 'Staff account required',
        status: 403,
      }
    }

    // A disabled account keeps its row and its role but holds no access
    // (ADR-0007). Session revocation already denies the token, so reaching here
    // means the row was disabled without going through the collection —
    // refuse anyway rather than trusting one layer.
    if (isDisabledStaff(user)) {
      return {
        user: null,
        error: 'This account has been disabled',
        status: 403,
      }
    }

    if (options.allowedRoles?.length && !options.allowedRoles.includes(user.role)) {
      return {
        user: null,
        error: `Access denied. Required roles: ${options.allowedRoles.join(', ')}`,
        status: 403,
      }
    }

    return {
      user,
      error: null,
      status: 200,
    }
  } catch (error) {
    console.error('Staff auth middleware error:', error)
    return {
      user: null,
      error: 'Authentication error',
      status: 500,
    }
  }
}

export { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
