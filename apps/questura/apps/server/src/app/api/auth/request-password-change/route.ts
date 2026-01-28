import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import crypto from 'crypto'
import { createAuthErrorResponse } from '@/auth/lib/auth-errors'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { sendPasswordChangeConfirmationEmail } from '@/emails'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    const payload = await getPayload({ config })

    // Authenticate the request
    const authResult = await authenticateRequest(req)
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: corsHeaders })
    }
    const user = authResult.user!

    // Check if user has a local password
    if (!user.hasLocalPassword) {
      const errorResponse = createAuthErrorResponse('INVALID_ACCOUNT_STATE_FOR_LINKING', {
        details: 'Account does not have a password set. Use add-password endpoint instead.'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Generate 6-digit verification code
    const verificationCode = crypto.randomInt(100000, 999999).toString()
    const codeExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes from now

    // Update user with verification code and expiration
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        passwordChangeCode: verificationCode,
        passwordChangeExpires: codeExpires,
      }
    })

    // Send confirmation email
    try {
      await sendPasswordChangeConfirmationEmail(payload, {
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        code: verificationCode
      })
      console.log(`✅ Password change verification code sent to: ${user.email}`)
    } catch (emailError) {
      console.error('❌ Failed to send password change verification email:', emailError)
      // Clean up the verification code if email fails
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          passwordChangeCode: null,
          passwordChangeExpires: null,
        }
      })
      const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    console.log(`User ${user.email} requested password change`)

    const successResponse = {
      success: true,
      message: 'Verification code sent to your email. Please check your email to complete the password change.',
      expiresIn: '15 minutes'
    }

    console.log('=== PASSWORD CHANGE REQUEST SUCCESS ===')
    console.log('User:', user.email)
    console.log('Verification code generated and email sent')
    console.log('=== PASSWORD CHANGE REQUEST SUCCESS END ===')

    return NextResponse.json(successResponse, { headers: corsHeaders })

  } catch (error) {
    console.error('Error requesting password change:', error)
    const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
    return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}