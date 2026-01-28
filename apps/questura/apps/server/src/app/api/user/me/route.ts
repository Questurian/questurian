import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { isActiveMember } from '@/shared/lib/membership'

export async function GET(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    // Use centralized auth middleware
    const authResult = await authenticateRequest(req)

    if (authResult.error) {
      return NextResponse.json(
        {
          authenticated: false,
          message: authResult.error
        },
        { status: authResult.status, headers: corsHeaders }
      )
    }

    const user = authResult.user!

    // Return user information (excluding sensitive data)
    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        authProvider: user.authProvider,
        isActiveMember: isActiveMember(user),

        // Authentication flags
        hasLocalPassword: user.hasLocalPassword,
        hasGoogleOAuth: user.hasGoogleOAuth,

        // Membership & Subscription Data
        subscriptionStatus: user.subscriptionStatus,
        subscriptionRenewsAt: user.subscriptionRenewsAt,
        membershipExpiration: user.membershipExpiration,
        cancelAtPeriodEnd: user.cancelAtPeriodEnd
      }
    }, { headers: corsHeaders })

  } catch (error) {
    // Other unexpected errors
    console.error('Auth verification error:', error)
    return NextResponse.json(
      {
        authenticated: false,
        message: 'Authentication verification failed'
      },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}