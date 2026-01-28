import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createAuthErrorResponse } from '@/auth/lib/auth-errors'
import { getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { sendPasswordResetSuccessEmail } from '@/emails'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    const payload = await getPayload({ config })

    const body = await req.json()
    const { email, code, newPassword, confirmPassword } = body

    console.log('=== FORGOT PASSWORD RESET REQUEST ===')
    console.log('Email:', email)
    console.log('Code provided:', !!code)
    console.log('New password provided:', !!newPassword)
    console.log('Confirm password provided:', !!confirmPassword)

    // Validation
    if (!email || typeof email !== 'string') {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Email is required'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    if (!code || typeof code !== 'string') {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Verification code is required'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    if (!newPassword || !confirmPassword) {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'New password and password confirmation are required'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    if (newPassword !== confirmPassword) {
      const errorResponse = createAuthErrorResponse('PASSWORDS_DO_NOT_MATCH')
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase()

    // Find user by email and code
    console.log('Searching for user with email and verification code...')
    const users = await payload.find({
      collection: 'users',
      where: {
        email: { equals: normalizedEmail },
        passwordResetCode: { equals: code }
      },
      limit: 1,
      depth: 0
    })

    console.log('Users found:', users.docs.length)
    if (users.docs.length === 0) {
      console.log('❌ No user found with this email and code')
      const errorResponse = createAuthErrorResponse('INVALID_CONFIRMATION', {
        details: 'Invalid email or verification code'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    const user = users.docs[0]
    console.log('✅ User found:', user.email)

    // Check if code has expired
    console.log('Checking code expiration...')
    console.log('Code expires at:', user.passwordResetExpires)
    console.log('Current time:', new Date())
    if (!user.passwordResetExpires || new Date() > new Date(user.passwordResetExpires)) {
      console.log('❌ Code has expired')
      // Clean up expired code
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          passwordResetCode: null,
          passwordResetExpires: null,
        }
      })

      const errorResponse = createAuthErrorResponse('INVALID_CONFIRMATION', {
        details: 'Verification code has expired. Please request a new password reset code.'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }
    console.log('✅ Code is still valid')

    // Update user password and clear reset fields
    console.log('=== RESETTING PASSWORD ===')
    console.log('User:', user.email)

    try {
      // Update the password using Payload's standard method
      // This will properly hash the password and update all fields
      // NOTE: We do NOT increment tokenVersion for forgot password since user wasn't logged in
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          password: newPassword, // Payload will hash it
          passwordSetAt: new Date().toISOString(),
          passwordResetCode: null,
          passwordResetExpires: null,
        }
      })

      console.log('Password reset completed successfully')
    } catch (updateError) {
      console.error('Password reset failed:', updateError)
      throw updateError
    }

    console.log('=== PASSWORD RESET COMPLETE ===')

    console.log(`User ${user.email} successfully reset password via forgot password flow`)

    // Send success email notification
    try {
      await sendPasswordResetSuccessEmail(payload, {
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || ''
      })
      console.log(`✅ Password reset success email sent to: ${user.email}`)
    } catch (emailError) {
      console.error('❌ Failed to send password reset success email:', emailError)
      // Don't fail the password reset if email fails
    }

    const successResponse = {
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
      requiresReLogin: false // They were never logged in, so can proceed to login
    }

    console.log('=== PASSWORD RESET SUCCESS ===')
    console.log('User:', user.email)
    console.log('Password reset via forgot password flow')
    console.log('=== PASSWORD RESET SUCCESS END ===')

    return NextResponse.json(successResponse, { headers: corsHeaders })

  } catch (error) {
    console.error('Error resetting password:', error)
    const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
    return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
