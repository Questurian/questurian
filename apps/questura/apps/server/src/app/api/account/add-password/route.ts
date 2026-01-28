import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import bcrypt from 'bcryptjs'
import { createAuthErrorResponse } from '@/auth/lib/auth-errors'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { sendPasswordBackupAddedEmail } from '@/emails'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    const payload = await getPayload({ config })

    const authResult = await authenticateRequest(req, { requireEmailVerification: true })
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: corsHeaders })
    }
    const user = authResult.user!

    const { password, confirmPassword } = await req.json()

    // Validation
    if (!password || !confirmPassword) {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Password and confirmation are required'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    if (password !== confirmPassword) {
      const errorResponse = createAuthErrorResponse('PASSWORDS_DO_NOT_MATCH')
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Safety check: Ensure user is Google-only
    if (user.authProvider !== 'google') {
      const errorResponse = createAuthErrorResponse('INVALID_ACCOUNT_STATE_FOR_LINKING', {
        details: 'This endpoint is only for Google-only accounts'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    if (user.hasLocalPassword) {
      const errorResponse = createAuthErrorResponse('ALREADY_LINKED', {
        details: 'Password is already set for this account'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Hash the password
    const saltRounds = 12
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    // Update user to dual authentication
    console.log('=== UPDATING USER WITH PASSWORD ===')
    console.log('Raw password:', password)
    console.log('Hashed password length:', hashedPassword.length)
    console.log('Hashed password preview:', hashedPassword.substring(0, 20) + '...')

    // First update the password using Payload's auth method
    try {
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          password: password, // Use raw password, let Payload handle hashing
          authProvider: 'dual',
          hasLocalPassword: true,
          passwordSetAt: new Date().toISOString(),
        }
      })

      console.log('Password update completed successfully')
    } catch (updateError) {
      console.error('Password update failed:', updateError)
      throw updateError
    }

    console.log('=== UPDATE COMPLETE ===')
    console.log(`User ${user.email} added password backup (Google -> Dual auth)`)

    // Send password backup added email
    try {
      await sendPasswordBackupAddedEmail(payload, {
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || ''
      })
      console.log(`✅ Password backup confirmation email sent to: ${user.email}`)
    } catch (emailError) {
      console.error('❌ Failed to send password backup email:', emailError)
      // Don't fail the password addition if email fails
    }

    const successResponse = {
      success: true,
      message: 'Password backup added successfully. You can now log in with either your password or Google account.',
      authProvider: 'dual'
    }

    console.log('=== PASSWORD ADDITION SUCCESS ===')
    console.log('User:', user.email)
    console.log('Auth transition: google -> dual')
    console.log('Response being sent:', successResponse)
    console.log('=== PASSWORD ADDITION SUCCESS END ===')

    return NextResponse.json(successResponse, { headers: corsHeaders })

  } catch (error) {
    console.error('Error adding password:', error)
    const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
    return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}