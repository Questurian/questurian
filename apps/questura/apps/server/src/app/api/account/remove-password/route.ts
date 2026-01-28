import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createAuthErrorResponse, validateAuthMethodRemoval } from '@/auth/lib/auth-errors'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { generateSecurePassword } from '@/shared/utils/utils'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    const payload = await getPayload({ config })

    const authResult = await authenticateRequest(req)
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: corsHeaders })
    }
    const user = authResult.user!

    let requestBody
    try {
      requestBody = await req.json()
    } catch (jsonError) {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Request body must be valid JSON. Send { confirmation: "REMOVE_PASSWORD" }'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    const { confirmation } = requestBody

    // Require explicit confirmation
    if (!confirmation || confirmation !== 'REMOVE_PASSWORD') {
      const errorResponse = createAuthErrorResponse('INVALID_CONFIRMATION', {
        details: 'Password removal requires explicit confirmation. Send { confirmation: "REMOVE_PASSWORD" }'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Safety check: User must be in dual auth state
    if (user.authProvider !== 'dual') {
      const errorResponse = createAuthErrorResponse('INVALID_ACCOUNT_STATE_FOR_LINKING', {
        details: 'This endpoint is only for users with dual authentication'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // CRITICAL SAFETY CHECK: Validate removal is safe
    const validationError = validateAuthMethodRemoval(user.hasLocalPassword ?? false, user.hasGoogleOAuth ?? false, 'password')
    if (validationError) {
      const errorResponse = createAuthErrorResponse('UNSAFE_REMOVAL_BLOCKED', {
        details: 'Cannot remove password without Google OAuth backup. Link a Google account first.'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Generate a cryptographically secure random password to maintain account validity
    // This keeps the account technically valid while removing user access via password
    const randomPassword = generateSecurePassword(48) // 48 bytes = 384 bits of entropy for extra security

    // Update user to Google-only authentication
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        password: randomPassword, // Set random password instead of removing
        authProvider: 'google',
        hasLocalPassword: false,
        passwordSetAt: null, // Clear timestamp
      }
    })

    console.log(`User ${user.email} removed password backup (Dual -> Google auth)`)

    const successResponse = {
      success: true,
      message: 'Password removed successfully. You can now only log in with your Google account.',
      authProvider: 'google',
      remainingMethods: ['google']
    }

    console.log('=== PASSWORD REMOVAL SUCCESS ===')
    console.log('User:', user.email)
    console.log('Auth transition: dual -> google')
    console.log('Response being sent:', successResponse)
    console.log('=== PASSWORD REMOVAL SUCCESS END ===')

    return NextResponse.json(successResponse, { headers: corsHeaders })

  } catch (error) {
    console.error('Error removing password:', error)
    const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
    return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}