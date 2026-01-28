import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createAuthErrorResponse } from '@/auth/lib/auth-errors'
import { getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    const payload = await getPayload({ config })

    const body = await req.json()
    const { email, code } = body

    console.log('=== VERIFY PASSWORD RESET CODE REQUEST ===')
    console.log('Email:', email)
    console.log('Code provided:', !!code)

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
        details: 'The verification code is invalid or has expired'
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
        details: 'The verification code is invalid or has expired'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }
    console.log('✅ Code is still valid')

    const successResponse = {
      success: true,
      message: 'Code is valid'
    }

    console.log('=== VERIFY CODE SUCCESS ===')
    console.log('User:', user.email)
    console.log('Code verified successfully')
    console.log('=== VERIFY CODE SUCCESS END ===')

    return NextResponse.json(successResponse, { headers: corsHeaders })

  } catch (error) {
    console.error('Error verifying password reset code:', error)
    const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
    return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
