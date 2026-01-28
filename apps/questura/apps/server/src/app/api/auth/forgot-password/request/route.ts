import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import crypto from 'crypto'
import { createAuthErrorResponse } from '@/auth/lib/auth-errors'
import { getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { sendPasswordResetEmail } from '@/emails'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    const payload = await getPayload({ config })

    // Parse request body
    let body: { email?: string }
    try {
      body = await req.json()
    } catch {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Request body must be valid JSON'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    const { email } = body

    // Validate email is provided and formatted correctly
    if (!email || typeof email !== 'string') {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Please provide a valid email address'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Normalize email: trim whitespace and convert to lowercase
    const normalizedEmail = email.trim().toLowerCase()

    // Basic email validation regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!emailRegex.test(normalizedEmail)) {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Please provide a valid email address'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Find user by email
    const users = await payload.find({
      collection: 'users',
      where: {
        email: { equals: normalizedEmail }
      },
      depth: 0
    })

    // Security: Return generic success message regardless of whether user exists
    const genericSuccessResponse = {
      success: true,
      message: 'If an account exists with this email, you will receive a password reset code.',
      expiresIn: '15 minutes'
    }

    // If user doesn't exist, return success anyway (security best practice)
    if (users.docs.length === 0) {
      console.log(`Password reset requested for non-existent email: ${normalizedEmail}`)
      return NextResponse.json(genericSuccessResponse, { headers: corsHeaders })
    }

    const user = users.docs[0]

    // Check if user has a local password (Google-only accounts can't reset password via this flow)
    if (!user.hasLocalPassword) {
      console.log(`Password reset requested for Google-only account: ${normalizedEmail}`)
      const errorResponse = createAuthErrorResponse('NO_LOCAL_PASSWORD', {
        details: 'This account uses Google authentication only and cannot reset a password. Please sign in with Google or add a password backup to your account first.'
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
        passwordResetCode: verificationCode,
        passwordResetExpires: codeExpires,
      }
    })

    // Send password reset email
    try {
      await sendPasswordResetEmail(payload, {
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        code: verificationCode
      })
      console.log(`✅ Password reset code sent to: ${user.email}`)
    } catch (emailError) {
      console.error('❌ Failed to send password reset email:', emailError)
      // Clean up the verification code if email fails
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          passwordResetCode: null,
          passwordResetExpires: null,
        }
      })
      // Still return success to user (don't reveal email failure)
      return NextResponse.json(genericSuccessResponse, { headers: corsHeaders })
    }

    console.log(`User ${user.email} requested password reset`)

    console.log('=== FORGOT PASSWORD REQUEST SUCCESS ===')
    console.log('Email:', normalizedEmail)
    console.log('Verification code generated and email sent')
    console.log('=== FORGOT PASSWORD REQUEST SUCCESS END ===')

    return NextResponse.json(genericSuccessResponse, { headers: corsHeaders })

  } catch (error) {
    console.error('Error requesting password reset:', error)
    const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
    return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
