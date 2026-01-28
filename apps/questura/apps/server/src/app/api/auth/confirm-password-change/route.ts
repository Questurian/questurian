import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createAuthErrorResponse } from '@/auth/lib/auth-errors'
import { getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { sendPasswordChangedSuccessEmail } from '@/emails'
import { setAuthCookie } from '@/shared/utils/cookie-helper'
import jwt from 'jsonwebtoken'
import { APP_CONFIG } from '@/shared/config'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    const payload = await getPayload({ config })

    const body = await req.json()
    const { code, currentPassword, newPassword, confirmNewPassword } = body

    console.log('=== CONFIRM PASSWORD CHANGE REQUEST ===')
    console.log('Request body:', JSON.stringify(body, null, 2))
    console.log('Code:', code)
    console.log('Current password provided:', !!currentPassword)
    console.log('New password provided:', !!newPassword)
    console.log('Confirm password provided:', !!confirmNewPassword)

    // Validation
    if (!code || typeof code !== 'string') {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Verification code is required'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Current password, new password, and confirmation are required'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    if (newPassword !== confirmNewPassword) {
      const errorResponse = createAuthErrorResponse('PASSWORDS_DO_NOT_MATCH')
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Find user with this verification code
    console.log('Searching for user with verification code...')
    const users = await payload.find({
      collection: 'users',
      where: {
        passwordChangeCode: { equals: code }
      },
      limit: 1
    })

    console.log('Users found:', users.docs.length)
    if (users.docs.length === 0) {
      console.log('❌ No user found with this code')
      const errorResponse = createAuthErrorResponse('INVALID_CONFIRMATION', {
        details: 'Invalid or expired verification code'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    const user = users.docs[0]
    console.log('✅ User found:', user.email)

    // Check if code has expired
    console.log('Checking code expiration...')
    console.log('Code expires at:', user.passwordChangeExpires)
    console.log('Current time:', new Date())
    if (!user.passwordChangeExpires || new Date() > new Date(user.passwordChangeExpires)) {
      console.log('❌ Code has expired')
      // Clean up expired code
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          passwordChangeCode: null,
          passwordChangeExpires: null,
        }
      })

      const errorResponse = createAuthErrorResponse('INVALID_CONFIRMATION', {
        details: 'Verification code has expired. Please request a new one.'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }
    console.log('✅ Code is still valid')

    // Verify current password using Payload's login method
    console.log('Verifying current password...')
    try {
      await payload.login({
        collection: 'users',
        data: { email: user.email, password: currentPassword },
        req: {
          ...req,
          headers: req.headers
        }
      })
      console.log('✅ Current password verified')
    } catch (error) {
      console.log('❌ Current password verification failed:', error)
      const errorResponse = createAuthErrorResponse('INVALID_CREDENTIALS', {
        details: 'Current password is incorrect'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Update user password and clear reset fields
    console.log('=== CONFIRMING PASSWORD CHANGE ===')
    console.log('User:', user.email)
    console.log('Current tokenVersion:', user.tokenVersion)
    console.log('Applying new password and incrementing tokenVersion')

    const newTokenVersion = (user.tokenVersion || 0) + 1

    try {
      // Update the password using Payload's standard method
      // This will properly hash the password and update all fields
      // Increment tokenVersion to invalidate all existing sessions
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          password: newPassword, // Payload will hash it
          passwordSetAt: new Date().toISOString(),
          passwordChangeCode: null,
          passwordChangeExpires: null,
          tokenVersion: newTokenVersion,
        }
      })

      console.log('Password change completed successfully')
      console.log('New tokenVersion:', newTokenVersion)
    } catch (updateError) {
      console.error('Password change failed:', updateError)
      throw updateError
    }

    console.log('=== PASSWORD CHANGE COMPLETE ===')
    console.log(`User ${user.email} successfully changed password via email confirmation`)
    console.log(`All other sessions invalidated. Old tokenVersion: ${user.tokenVersion || 0}, New tokenVersion: ${newTokenVersion}`)

    // Send success email notification
    try {
      await sendPasswordChangedSuccessEmail(payload, {
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || ''
      })
      console.log(`✅ Password changed success email sent to: ${user.email}`)
    } catch (emailError) {
      console.error('❌ Failed to send password changed success email:', emailError)
      // Don't fail the password change if email fails
    }

    // Generate new token for current device with updated tokenVersion
    // This keeps the user logged in on the device where they changed their password
    console.log('Generating new token with updated tokenVersion...')
    const newToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        collection: 'users',
        tokenVersion: newTokenVersion
      },
      APP_CONFIG.payloadSecret,
      {
        expiresIn: '7d'
      }
    )
    console.log('✅ New token generated with tokenVersion:', newTokenVersion)

    const successResponse = {
      success: true,
      message: 'Password changed successfully. You will remain logged in on this device.',
      token: newToken, // New token with updated version for current device
      requiresReLogin: false // They stay logged in with new token
    }

    console.log('=== PASSWORD CHANGE SUCCESS ===')
    console.log('User:', user.email)
    console.log('Password changed via verification code')
    console.log('=== PASSWORD CHANGE SUCCESS END ===')

    const response = NextResponse.json(successResponse, { headers: corsHeaders })

    // Manually set the auth cookie to ensure it's set with correct attributes
    if (newToken) {
      setAuthCookie(response, newToken)
      console.log('Confirm password change - Auth cookie set manually for cross-origin support')
    }

    return response

  } catch (error) {
    console.error('Error confirming password change:', error)
    const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
    return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}