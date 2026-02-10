import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { getCorsHeaders, handleCorsOptions, corsResponse } from '@/shared/utils/cors'
import { sendWelcomeEmail } from '@/emails'
import { setAuthCookie } from '@/shared/utils/cookie-helper'
import jwt from 'jsonwebtoken'
import { APP_CONFIG } from '@/shared/config'
import { isActiveMember } from '@/shared/lib/membership'

export async function POST(req: NextRequest) {
  console.log('=== SIGNUP REQUEST STARTED ===')
  console.log('Request URL:', req.url)
  console.log('Request method:', req.method)
  console.log('Request headers:', Object.fromEntries(req.headers.entries()))

  try {
    const body = await req.json()
    const { email, password, firstName, lastName } = body

    console.log('📥 Request body received:', {
      email,
      hasPassword: !!password,
      passwordLength: password?.length,
      firstName,
      lastName
    })

    if (!email || !password) {
      console.log('❌ Validation failed: Missing email or password')
      return corsResponse(
        {
          success: false,
          message: 'Email and password are required'
        },
        req,
        400
      )
    }

    console.log('✅ Input validation passed')

    // Normalize email before sending to Payload (trim and lowercase)
    const normalizedEmail = email.trim().toLowerCase()
    console.log('📧 Email normalization:', {
      original: email,
      normalized: normalizedEmail,
      changed: email !== normalizedEmail
    })

    console.log('🔄 Getting Payload instance...')
    const payload = await getPayload({ config })
    console.log('✅ Payload instance obtained')

    // Create new user with email already verified (skip verification step)
    console.log('👤 Creating new user in database...')
    console.log('User data to create:', {
      email: normalizedEmail,
      hasPassword: !!password,
      firstName: firstName || '',
      lastName: lastName || '',
      role: 'user',
      authProvider: 'local',
      emailVerified: true // Auto-verify email on signup
    })
    const newUser = await payload.create({
      collection: 'users',
      data: {
        email: normalizedEmail, // Use normalized email
        password,
        firstName: firstName || '',
        lastName: lastName || '',
        role: 'user',
        authProvider: 'local', // Set correct auth provider
        hasLocalPassword: true,
        hasGoogleOAuth: false,
        passwordSetAt: new Date().toISOString(),
        tokenVersion: 0,
        oauthId: null,
        subscriptionStatus: 'none',
        membershipExpiration: null,
        emailVerified: true, // Skip email verification - auto-verify
        emailVerificationCode: null,
        emailVerificationExpires: null,
      }
    })
    console.log('✅ User created successfully in database:', {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      emailVerified: newUser.emailVerified
    })

    // Send welcome email (non-blocking - don't fail signup if email fails)
    console.log('📧 Sending welcome email...')
    try {
      await sendWelcomeEmail(payload, {
        email: newUser.email,
        firstName: newUser.firstName || '',
        lastName: newUser.lastName || ''
      })
      console.log(`✅ Welcome email sent to: ${newUser.email}`)
    } catch (emailError) {
      console.error('❌ Failed to send welcome email (non-blocking):', emailError)
      // Don't fail signup if welcome email fails
    }

    // Generate JWT token for auto-login
    console.log('🔑 Generating JWT token for auto-login...')
    const token = jwt.sign(
      {
        id: newUser.id,
        email: newUser.email,
        collection: 'users',
        role: newUser.role,
        emailVerified: true,
        tokenVersion: newUser.tokenVersion || 0
      },
      APP_CONFIG.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    )
    console.log('✅ JWT token generated')

    // Return success with token and user data (auto-login)
    console.log('=== SIGNUP SUCCESS ===')
    console.log('User created and automatically logged in')
    console.log('Returning token and user data to client')

    // Create response with CORS headers
    const response = NextResponse.json({
      success: true,
      message: 'Account created successfully! Welcome!',
      token: token,
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName || '',
        lastName: newUser.lastName || '',
        role: newUser.role,
        authProvider: newUser.authProvider,
        isActiveMember: isActiveMember(newUser),
        subscriptionStatus: newUser.subscriptionStatus,
        emailVerified: true
      },
      requiresVerification: false
    }, {
      status: 200,
      headers: getCorsHeaders(req)
    })

    // Manually set the auth cookie to ensure it's set with correct attributes
    if (token) {
      setAuthCookie(response, token)
      console.log('Signup - Auth cookie set manually for cross-origin support')
    }

    return response

  } catch (error) {
    console.error('=== SIGNUP CATCH BLOCK ERROR ===')
    console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error)
    console.error('Error message:', error instanceof Error ? error.message : String(error))
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('Full error object:', error)

    // Handle specific validation errors
    if (error instanceof Error) {
      if (error.message.includes('duplicate key') || error.message.includes('already exists')) {
        console.error('🔴 Duplicate email error detected')
        return NextResponse.json(
          {
            success: false,
            message: 'An account with this email already exists'
          },
          {
            status: 400,
            headers: getCorsHeaders(req)
          }
        )
      }

      if (error.message.includes('validation')) {
        console.error('🔴 Validation error detected:', error.message)
        return NextResponse.json(
          {
            success: false,
            message: error.message
          },
          {
            status: 400,
            headers: getCorsHeaders(req)
          }
        )
      }
    }

    console.error('🔴 Returning generic error response')
    return NextResponse.json(
      {
        success: false,
        message: 'Account creation failed'
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
