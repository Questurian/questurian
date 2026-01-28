import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { cancelUserSubscription } from '@/payments/lib/payment-service'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    // 1. Authenticate the user
    const authResult = await authenticateRequest(req)

    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: corsHeaders }
      )
    }

    const user = authResult.user!

    // GUARD: Staff members cannot cancel subscriptions
    if (user.role === 'admin' || user.role === 'editor') {
      console.log('Preventing subscription cancellation for staff member:', {
        userId: user.id,
        email: user.email,
        role: user.role
      })
      return NextResponse.json(
        { error: 'Staff members do not have subscriptions to cancel' },
        { status: 403, headers: corsHeaders }
      )
    }

    // 2. Cancel the user's subscription
    const result = await cancelUserSubscription(String(user.id))

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400, headers: corsHeaders }
      )
    }

    // 3. Return success response
    return NextResponse.json(
      {
        success: true,
        message: result.message,
        membershipExpiresAt: result.membershipExpiresAt
      },
      { headers: corsHeaders }
    )

  } catch (error) {
    console.error('Error in cancel subscription endpoint:', error)
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}