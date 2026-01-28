import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import crypto from 'crypto'
import { createAuthErrorResponse } from '@/auth/lib/auth-errors'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { sendEmailChangeVerificationEmail } from '@/emails'

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

    // Parse request body
    const body = await req.json()
    const { newEmail } = body

    console.log('=== EMAIL CHANGE REQUEST ===')
    console.log('User:', user.email)
    console.log('Requested new email:', newEmail)
    console.log('User has local password:', user.hasLocalPassword)
    console.log('User has Google OAuth:', user.hasGoogleOAuth)

    // Check if user has a local password (Google-only users cannot change email)
    if (!user.hasLocalPassword) {
      const errorResponse = createAuthErrorResponse('INVALID_ACCOUNT_STATE_FOR_LINKING', {
        details: 'You must add a password to your account before changing your email. Google-only accounts cannot change email addresses.'
      })
      console.log('❌ Email change blocked: Google-only user')
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Validate new email
    if (!newEmail || typeof newEmail !== 'string') {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'New email address is required'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Normalize email
    const normalizedNewEmail = newEmail.trim().toLowerCase()

    // Check if new email is different from current
    if (normalizedNewEmail === user.email.toLowerCase()) {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'New email address must be different from your current email'
      })
      console.log('❌ New email is same as current email')
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Email format validation
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!emailRegex.test(normalizedNewEmail)) {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Please enter a valid email address'
      })
      console.log('❌ Invalid email format')
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Check if email is already in use
    const existingUsers = await payload.find({
      collection: 'users',
      where: {
        email: { equals: normalizedNewEmail }
      },
      limit: 1
    })

    if (existingUsers.docs.length > 0) {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'This email address is already in use by another account'
      })
      console.log('❌ Email already in use')
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Generate 6-digit verification code
    const verificationCode = crypto.randomInt(100000, 999999).toString()
    const codeExpires = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now

    console.log('✅ Generating verification code:', verificationCode)
    console.log('Code expires at:', codeExpires)

    // Update user with verification code and pending email
    await payload.update({
      collection: 'users',
      id: String(user.id),
      data: {
        emailChangeCode: verificationCode,
        emailChangeExpires: codeExpires.toISOString(),
        pendingEmail: normalizedNewEmail,
      }
    })

    // Send verification email to NEW email address
    try {
      await sendEmailChangeVerificationEmail(payload, {
        email: normalizedNewEmail, // Send to NEW email
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        code: verificationCode
      })
      console.log(`✅ Email change verification code sent to: ${normalizedNewEmail}`)
    } catch (emailError) {
      console.error('❌ Failed to send verification email:', emailError)
      // Clean up the verification data if email fails
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          emailChangeCode: null,
          emailChangeExpires: null,
          pendingEmail: null,
        }
      })
      const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR', {
        details: 'Failed to send verification email. Please try again.'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    console.log(`User ${user.email} requested email change to ${normalizedNewEmail}`)

    // Return success with Google unlink warning flag
    const successResponse = {
      success: true,
      message: 'Verification code sent to your new email address. Please check your email to complete the change.',
      expiresIn: '15 minutes',
      willUnlinkGoogle: user.hasGoogleOAuth || false // Frontend can show warning
    }

    console.log('=== EMAIL CHANGE REQUEST SUCCESS ===')
    console.log('User:', user.email)
    console.log('New email:', normalizedNewEmail)
    console.log('Will unlink Google:', successResponse.willUnlinkGoogle)
    console.log('=== EMAIL CHANGE REQUEST END ===')

    return NextResponse.json(successResponse, { headers: corsHeaders })

  } catch (error) {
    console.error('Error requesting email change:', error)
    const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
    return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
