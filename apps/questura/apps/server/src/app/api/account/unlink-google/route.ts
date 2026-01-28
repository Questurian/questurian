import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createAuthErrorResponse } from '@/auth/lib/auth-errors'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'

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
        details: 'Request body must be valid JSON. Send { confirmation: "UNLINK_GOOGLE" }'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    const { confirmation } = requestBody

    // Require explicit confirmation
    if (!confirmation || confirmation !== 'UNLINK_GOOGLE') {
      const errorResponse = createAuthErrorResponse('INVALID_CONFIRMATION', {
        details: 'Google unlinking requires explicit confirmation. Send { confirmation: "UNLINK_GOOGLE" }'
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

    // DEBUG: Log user state for troubleshooting
    console.log('=== GOOGLE UNLINK DEBUG ===')
    console.log('User email:', user.email)
    console.log('authProvider:', user.authProvider)
    console.log('hasLocalPassword:', user.hasLocalPassword)
    console.log('hasGoogleOAuth:', user.hasGoogleOAuth)
    console.log('password exists:', !!user.password)
    console.log('password length:', user.password?.length || 0)
    console.log('=== GOOGLE UNLINK DEBUG END ===')

    // CRITICAL SAFETY CHECK: Ensure user has local password
    // Note: Payload filters out password field for security, so we rely on hasLocalPassword flag
    if (!user.hasLocalPassword) {
      console.log('SAFETY CHECK FAILED - hasLocalPassword is false')
      const errorResponse = createAuthErrorResponse('UNSAFE_REMOVAL_BLOCKED', {
        details: 'Cannot unlink Google without password backup. Set up a password first.'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    console.log('SAFETY CHECK PASSED - User has local password backup')

    // Optional: Revoke Google OAuth tokens if we stored refresh tokens
    // This would require additional API calls to Google's revoke endpoint
    // For now, we'll just remove the linking from our side

    // Update user to local-only authentication
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        authProvider: 'local',
        hasGoogleOAuth: false,
        oauthId: null,
        googleLinkedAt: null,
      }
    })

    console.log(`User ${user.email} unlinked Google account (Dual -> Local auth)`)

    const successResponse = {
      success: true,
      message: 'Google account unlinked successfully. You can now only log in with your password.',
      authProvider: 'local',
      remainingMethods: ['password']
    }

    console.log('=== GOOGLE UNLINKING SUCCESS ===')
    console.log('User:', user.email)
    console.log('Auth transition: dual -> local')
    console.log('Response being sent:', successResponse)
    console.log('=== GOOGLE UNLINKING SUCCESS END ===')

    return NextResponse.json(successResponse, { headers: corsHeaders })

  } catch (error) {
    console.error('Error unlinking Google account:', error)
    const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
    return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}