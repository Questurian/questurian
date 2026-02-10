import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createAuthErrorResponse } from '@/auth/lib/auth-errors'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { setAuthCookie } from '@/shared/utils/cookie-helper'
import { APP_CONFIG } from '@/shared/config'
import jwt from 'jsonwebtoken'
import { sendPasswordChangedSuccessEmail } from '@/emails'

const JWT_SECRET = APP_CONFIG.JWT_SECRET

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    console.log('=== PASSWORD CHANGE REQUEST ===')
    const payload = await getPayload({ config })

    // Authenticate the request
    const authResult = await authenticateRequest(req)
    if (authResult.error) {
      console.log('Auth failed:', authResult.error)
      return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: corsHeaders })
    }
    const user = authResult.user!
    console.log('Authenticated user:', { id: user.id, email: user.email, hasLocalPassword: user.hasLocalPassword })

    // Parse request body
    const { currentPassword, newPassword, confirmNewPassword } = await req.json()
    console.log('Request data received:', {
      hasCurrentPassword: !!currentPassword,
      hasNewPassword: !!newPassword,
      hasConfirmPassword: !!confirmNewPassword
    })

    // Validation: Check all fields are provided
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      console.log('ERROR: Missing required fields')
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Current password, new password, and password confirmation are required'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Validation: Check if user has a local password
    if (!user.hasLocalPassword) {
      console.log('ERROR: User has no local password set (Google-only account)')
      const errorResponse = createAuthErrorResponse('INVALID_ACCOUNT_STATE_FOR_LINKING', {
        details: 'You must add a password to your account before changing it'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Validation: Check passwords match
    if (newPassword !== confirmNewPassword) {
      console.log('ERROR: New passwords do not match')
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'New password and confirmation do not match'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Validation: Check new password is different from current
    if (currentPassword === newPassword) {
      console.log('ERROR: New password is same as current password')
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'New password must be different from your current password'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Validation: Password strength (if enabled)
    if (APP_CONFIG.features.enforcePasswordStrength) {
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
      if (!passwordRegex.test(newPassword)) {
        console.log('ERROR: New password does not meet strength requirements')
        const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
          details: 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character'
        })
        return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
      }
    } else {
      // Minimum length check even if strength enforcement is disabled
      if (newPassword.length < 8) {
        console.log('ERROR: New password is too short')
        const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
          details: 'Password must be at least 8 characters long'
        })
        return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
      }
    }

    // Step 1: Verify current password using Payload's login method
    console.log('Verifying current password...')
    let isCurrentPasswordValid = false
    try {
      await payload.login({
        collection: 'users',
        data: {
          email: user.email,
          password: currentPassword
        }
      })
      isCurrentPasswordValid = true
      console.log('Current password verified successfully')
    } catch (loginError) {
      console.log('Current password verification failed:', loginError instanceof Error ? loginError.message : 'Unknown error')
    }

    if (!isCurrentPasswordValid) {
      const errorResponse = createAuthErrorResponse('INVALID_CREDENTIALS', {
        details: 'Current password is incorrect'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Step 2: Update password and increment tokenVersion to invalidate all existing sessions
    console.log('Updating password and incrementing tokenVersion...')
    const currentTokenVersion = user.tokenVersion || 0
    const newTokenVersion = currentTokenVersion + 1

    const updatedUser = await payload.update({
      collection: 'users',
      id: String(user.id),
      data: {
        password: newPassword, // Payload will hash this automatically
        tokenVersion: newTokenVersion,
        passwordSetAt: new Date().toISOString(),
      }
    })

    console.log('Password updated successfully, tokenVersion:', newTokenVersion)

    // Step 3: Issue new session cookie with updated tokenVersion
    console.log('Generating new JWT token...')
    const newToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        collection: 'users',
        tokenVersion: newTokenVersion
      } as any,
      JWT_SECRET,
      {
        expiresIn: APP_CONFIG.jwtExpiresIn || '7d'
      } as any
    )

    const response = NextResponse.json(
      {
        success: true,
        message: 'Password changed successfully. You have been logged out of all other devices for security.',
        token: newToken // Return token for client-side storage
      },
      { headers: corsHeaders }
    )

    // Set the new auth cookie
    setAuthCookie(response, newToken)
    console.log('New session cookie issued')

    // Step 4: Send notification email asynchronously (non-blocking)
    console.log('Sending password change notification email...')
    sendPasswordChangedSuccessEmail(payload, {
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
    }).then(() => {
      console.log('Password change notification email sent successfully')
    }).catch((emailError) => {
      // Log error but don't fail the request
      console.error('Failed to send password change notification email:', emailError)
    })

    console.log('=== PASSWORD CHANGE SUCCESS ===')
    console.log('User:', user.email)
    console.log('New tokenVersion:', newTokenVersion)
    console.log('=== PASSWORD CHANGE END ===')

    return response

  } catch (error) {
    console.error('=== ERROR IN PASSWORD CHANGE ===')
    console.error('Error changing password:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'N/A')
    const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
    return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
