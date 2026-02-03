import { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { corsResponse, handleCorsOptions } from '@/shared/utils/cors'
import { sendEmailVerificationEmail } from '@/emails'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    console.log('=== RESEND VERIFICATION REQUEST ===')
    console.log('Email:', email)

    if (!email) {
      return corsResponse(
        {
          success: false,
          message: 'Email is required'
        },
        req,
        400
      )
    }

    const payload = await getPayload({ config })

    // Find user with this email
    const users = await payload.find({
      collection: 'users',
      where: {
        email: { equals: email }
      },
      limit: 1
    })

    if (users.docs.length === 0) {
      // Don't reveal if email exists or not for security
      return corsResponse(
        {
          success: true,
          message: 'If an unverified account exists with this email, a new verification code has been sent.'
        },
        req,
        200
      )
    }

    const user = users.docs[0]

    // Check if already verified
    if (user.emailVerified) {
      return corsResponse(
        {
          success: false,
          message: 'Email already verified. Please log in.'
        },
        req,
        400
      )
    }

    // Generate new 6-digit verification code
    const verificationCode = crypto.randomInt(100000, 999999).toString()
    const codeExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes from now

    // Update user with new verification code
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        emailVerificationCode: verificationCode,
        emailVerificationExpires: codeExpires,
      }
    })

    // Send new verification email
    try {
      await sendEmailVerificationEmail(payload, {
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        code: verificationCode
      })
      console.log(`✅ New email verification code sent to: ${user.email}`)
    } catch (emailError) {
      console.error('❌ Failed to send email verification email:', emailError)
      return corsResponse(
        {
          success: false,
          message: 'Failed to send verification email. Please try again.'
        },
        req,
        500
      )
    }

    console.log('=== RESEND VERIFICATION SUCCESS ===')
    console.log('User:', user.email)
    console.log('New verification code sent')

    return corsResponse({
      success: true,
      message: 'A new verification code has been sent to your email.'
    }, req)

  } catch (error) {
    console.error('Error resending verification:', error)
    return corsResponse(
      {
        success: false,
        message: 'Failed to resend verification code. Please try again.'
      },
      req,
      500
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
