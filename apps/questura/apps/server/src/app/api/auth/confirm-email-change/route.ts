import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createAuthErrorResponse } from '@/auth/lib/auth-errors'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { sendEmailChangedNotificationEmail } from '@/emails'
import { stripe } from '@/payments/lib/stripe'

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
    const { code } = body

    console.log('=== CONFIRM EMAIL CHANGE REQUEST ===')
    console.log('User:', user.email)
    console.log('Code provided:', code)

    // Validation
    if (!code || typeof code !== 'string') {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Verification code is required'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Verify user has pending email change
    if (!user.emailChangeCode || !user.emailChangeExpires || !user.pendingEmail) {
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'No pending email change found. Please request a new verification code.'
      })
      console.log('❌ No pending email change for user')
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Check if code has expired
    console.log('Checking code expiration...')
    console.log('Code expires at:', user.emailChangeExpires)
    console.log('Current time:', new Date())
    if (new Date() > new Date(user.emailChangeExpires)) {
      console.log('❌ Code has expired')
      // Clean up expired code
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          emailChangeCode: null,
          emailChangeExpires: null,
          pendingEmail: null,
        }
      })

      const errorResponse = createAuthErrorResponse('INVALID_CONFIRMATION', {
        details: 'Verification code has expired. Please request a new one.'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }
    console.log('✅ Code is still valid')

    // Verify the code matches
    if (code.trim() !== user.emailChangeCode.trim()) {
      console.log('❌ Code mismatch')
      const errorResponse = createAuthErrorResponse('INVALID_CONFIRMATION', {
        details: 'Invalid verification code. Please check and try again.'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }
    console.log('✅ Code verified')

    // Store old values for audit log and notification
    const oldEmail = user.email
    const newEmail = user.pendingEmail
    const wasGoogleLinked = user.hasGoogleOAuth || false
    const hasStripeCustomer = !!user.stripeCustomerId

    console.log('=== PROCESSING EMAIL CHANGE ===')
    console.log('Old email:', oldEmail)
    console.log('New email:', newEmail)
    console.log('Has Google OAuth:', wasGoogleLinked)
    console.log('Current tokenVersion:', user.tokenVersion)

    // Prepare update data
    const updateData: any = {
      email: newEmail,
      emailChangeCode: null,
      emailChangeExpires: null,
      pendingEmail: null,
      tokenVersion: (user.tokenVersion || 0) + 1, // Invalidate all sessions
    }

    // If user has Google OAuth linked, auto-unlink it
    if (wasGoogleLinked) {
      console.log('🔗 Auto-unlinking Google OAuth...')
      updateData.hasGoogleOAuth = false
      updateData.oauthId = null
      updateData.googleLinkedAt = null
      updateData.authProvider = 'local' // Change from dual to local

      console.log('✅ Google OAuth auto-unlinked')
    }

    const newTokenVersion = updateData.tokenVersion

    // Update user with new email and clear temporary fields
    try {
      await payload.update({
        collection: 'users',
        id: user.id,
        data: updateData
      })
      console.log('✅ User email changed successfully')
      console.log('New tokenVersion:', newTokenVersion)
    } catch (updateError) {
      console.error('❌ Email change failed:', updateError)
      throw updateError
    }

    // Update Stripe customer email if they have a Stripe customer ID
    let stripeEmailUpdated = false
    if (user.stripeCustomerId) {
      try {
        console.log('💳 Updating Stripe customer email...')
        await stripe.customers.update(user.stripeCustomerId, {
          email: newEmail
        })
        stripeEmailUpdated = true
        console.log('✅ Stripe customer email updated')
      } catch (stripeError) {
        // Log error but don't block email change
        console.error('❌ Failed to update Stripe customer email (non-blocking):', stripeError)
      }
    }

    console.log(`User email changed from ${oldEmail} to ${newEmail}`)
    console.log(`All sessions invalidated. Old tokenVersion: ${user.tokenVersion || 0}, New tokenVersion: ${newTokenVersion}`)

    // Send security notification to OLD email address
    try {
      await sendEmailChangedNotificationEmail(payload, {
        email: oldEmail, // Send to OLD email as security notification
        oldEmail,
        newEmail,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        wasGoogleUnlinked: wasGoogleLinked,
        wasStripeUpdated: stripeEmailUpdated
      })
      console.log(`✅ Security notification sent to old email: ${oldEmail}`)
    } catch (emailError) {
      console.error('❌ Failed to send security notification email (non-blocking):', emailError)
      // Don't fail the email change if notification fails
    }

    console.log('=== EMAIL CHANGE COMPLETE ===')

    const successResponse = {
      success: true,
      message: 'Email address changed successfully. You will be logged out for security. Please log in with your new email address.',
      wasGoogleUnlinked: wasGoogleLinked,
      newEmail: newEmail,
      requiresReLogin: true // Frontend should log user out
    }

    console.log('=== EMAIL CHANGE SUCCESS ===')
    console.log('User email:', oldEmail, '→', newEmail)
    console.log('Google unlinked:', wasGoogleLinked)
    console.log('User will be logged out (tokenVersion incremented)')
    console.log('=== EMAIL CHANGE SUCCESS END ===')

    return NextResponse.json(successResponse, { headers: corsHeaders })

  } catch (error) {
    console.error('Error confirming email change:', error)
    const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
    return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
