import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { sendWelcomeEmail } from '@/emails'
import { setAuthCookie } from '@/shared/utils/cookie-helper'
import jwt from 'jsonwebtoken'
import { APP_CONFIG } from '@/shared/config'

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json()

    console.log('=== CONFIRM EMAIL REQUEST ===')
    console.log('Email:', email)
    console.log('Code:', code)

    // Validation
    if (!email || !code) {
      return NextResponse.json(
        {
          success: false,
          message: 'Email and verification code are required'
        },
        {
          status: 400,
          headers: getCorsHeaders(req)
        }
      )
    }

    const payload = await getPayload({ config })

    // Find user with this email and verification code
    console.log('Searching for user with email and verification code...')
    const users = await payload.find({
      collection: 'users',
      where: {
        and: [
          { email: { equals: email } },
          { emailVerificationCode: { equals: code } }
        ]
      },
      limit: 1
    })

    console.log('Users found:', users.docs.length)
    if (users.docs.length === 0) {
      console.log('❌ No user found with this email and code')
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid verification code'
        },
        {
          status: 400,
          headers: getCorsHeaders(req)
        }
      )
    }

    const user = users.docs[0]
    console.log('✅ User found:', user.email)

    // Check if user is already verified
    if (user.emailVerified) {
      console.log('⚠️ User email already verified')
      return NextResponse.json(
        {
          success: false,
          message: 'Email already verified. Please log in.'
        },
        {
          status: 400,
          headers: getCorsHeaders(req)
        }
      )
    }

    // Check if code has expired
    console.log('Checking code expiration...')
    console.log('Code expires at:', user.emailVerificationExpires)
    console.log('Current time:', new Date())
    if (!user.emailVerificationExpires || new Date() > new Date(user.emailVerificationExpires)) {
      console.log('❌ Code has expired')
      return NextResponse.json(
        {
          success: false,
          message: 'Verification code has expired. Please request a new one.'
        },
        {
          status: 400,
          headers: getCorsHeaders(req)
        }
      )
    }
    console.log('✅ Code is still valid')

    // Mark email as verified and clear verification fields
    console.log('=== VERIFYING EMAIL ===')
    console.log('User:', user.email)

    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpires: null,
      }
    })

    console.log('✅ Email verified successfully')

    // Send welcome email after verification
    try {
      await sendWelcomeEmail(payload, {
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || ''
      })
      console.log(`✅ Welcome email sent to: ${user.email}`)
    } catch (emailError) {
      console.error('❌ Failed to send welcome email:', emailError)
      // Don't fail the verification if welcome email fails
    }

    // Generate JWT token for auto-login
    console.log('Generating JWT token for auto-login...')
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        collection: 'users',
        role: user.role,
        emailVerified: true,
        tokenVersion: user.tokenVersion || 0
      },
      APP_CONFIG.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    )
    console.log('✅ Token generated')

    console.log('=== EMAIL VERIFICATION SUCCESS ===')
    console.log('User:', user.email)
    console.log('Email verified and user logged in')
    console.log('=== EMAIL VERIFICATION SUCCESS END ===')

    // Create response with CORS headers
    const response = NextResponse.json({
      success: true,
      message: 'Email verified successfully! Welcome to Questurian.',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        role: user.role,
        authProvider: user.authProvider,
        subscriptionStatus: user.subscriptionStatus,
        emailVerified: true
      }
    }, {
      status: 200,
      headers: getCorsHeaders(req)
    })

    // Manually set the auth cookie to ensure it's set with correct attributes
    if (token) {
      setAuthCookie(response, token)
      console.log('Confirm email - Auth cookie set manually for cross-origin support')
    }

    return response

  } catch (error) {
    console.error('Error confirming email:', error)
    return NextResponse.json(
      {
        success: false,
        message: 'Email verification failed. Please try again.'
      },
      {
        status: 500,
        headers: getCorsHeaders(req)
      }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
