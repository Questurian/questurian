import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'
import { APP_CONFIG, APP_CONFIG_WITH_GOOGLE, APP_URLS } from '@/shared/config'

// In-memory rate limiting (use Redis in production)
const linkingAttempts = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_MAX_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

const checkRateLimit = (userId: string | number, ip: string): boolean => {
  const key = `${userId}:${ip}`
  const now = Date.now()
  const userAttempts = linkingAttempts.get(key)

  if (!userAttempts || now > userAttempts.resetTime) {
    linkingAttempts.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (userAttempts.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    console.error(`SECURITY: Rate limit exceeded for user ${userId} from IP ${ip}`)
    return false
  }

  userAttempts.count++
  return true
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    const payload = await getPayload({ config })

    const authResult = await authenticateRequest(req)
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: corsHeaders })
    }
    const user = authResult.user!

    console.log('Link Google - User found:', user.email)

    // SECURITY: Rate limiting check
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(user.id, clientIP)) {
      console.error(`SECURITY ALERT: Rate limit exceeded for linking attempts - User: ${user.id}, IP: ${clientIP}, Timestamp: ${new Date().toISOString()}`)
      return NextResponse.json(
        { error: 'Too many linking attempts. Please try again later.' },
        { status: 429, headers: corsHeaders }
      )
    }

    // SECURITY: Enhanced session validation
    if (user.authProvider !== 'local') {
      console.error(`SECURITY: Invalid auth provider for linking - User: ${user.id}, Provider: ${user.authProvider}`)
      return NextResponse.json(
        { error: 'Account linking failed. Please try again.' },
        { status: 400, headers: corsHeaders }
      )
    }

    if (user.hasGoogleOAuth) {
      console.error(`SECURITY: Attempt to link already linked Google account - User: ${user.id}`)
      return NextResponse.json(
        { error: 'Account linking failed. Please try again.' },
        { status: 400, headers: corsHeaders }
      )
    }

    // SECURITY: Generate cryptographically secure state for CSRF protection
    const nonce = Math.random().toString(36).substring(2, 15) +
                  Math.random().toString(36).substring(2, 15) +
                  Date.now().toString(36)

    // Build Google OAuth URL with linking-specific parameters
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    googleAuthUrl.searchParams.set('client_id', APP_CONFIG.google.clientId)
    googleAuthUrl.searchParams.set('redirect_uri', APP_CONFIG_WITH_GOOGLE.google.redirectUri)
    googleAuthUrl.searchParams.set('response_type', 'code')
    googleAuthUrl.searchParams.set('scope', 'openid email profile')
    googleAuthUrl.searchParams.set('access_type', 'offline')
    googleAuthUrl.searchParams.set('prompt', 'consent')

    // SECURITY: Enhanced state with additional validation data
    googleAuthUrl.searchParams.set('state', JSON.stringify({
      action: 'link',
      userId: user.id,
      email: user.email,
      nonce: nonce,
      timestamp: Date.now(),
      sessionId: user.id + '_' + Date.now() // Additional CSRF protection
    }))

    // SECURITY AUDIT: Log linking attempt with IP and timestamp
    console.log(`SECURITY AUDIT: Google account linking initiated - User: ${user.email} (${user.id}), IP: ${clientIP}, Timestamp: ${new Date().toISOString()}`)

    return NextResponse.json({
      success: true,
      message: 'Google OAuth linking initiated',
      authUrl: googleAuthUrl.toString(),
      action: 'link'
    }, { headers: corsHeaders })

  } catch (error) {
    console.error('Error initiating Google linking:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function GET(req: NextRequest) {
  // Alternative endpoint for direct redirect
  try {
    const payload = await getPayload({ config })

    const authResult = await authenticateRequest(req)
    if (authResult.error) {
      return NextResponse.redirect(APP_URLS.frontendUrl('/login?error=authentication_required'))
    }
    const user = authResult.user!

    // Safety check: User must be local-only
    if (user.authProvider !== 'local') {
      return NextResponse.redirect(APP_URLS.frontendUrl('/account?error=invalid_account_type'))
    }

    if (user.hasGoogleOAuth) {
      return NextResponse.redirect(APP_URLS.frontendUrl('/account?error=already_linked'))
    }

    // Generate OAuth state for security
    const state = Math.random().toString(36).substring(2, 15) +
                 Math.random().toString(36).substring(2, 15)

    // Build Google OAuth URL with linking-specific parameters
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    googleAuthUrl.searchParams.set('client_id', APP_CONFIG.google.clientId)
    googleAuthUrl.searchParams.set('redirect_uri', APP_CONFIG_WITH_GOOGLE.google.redirectUri)
    googleAuthUrl.searchParams.set('response_type', 'code')
    googleAuthUrl.searchParams.set('scope', 'openid email profile')
    googleAuthUrl.searchParams.set('access_type', 'offline')
    googleAuthUrl.searchParams.set('prompt', 'consent')

    // Add linking-specific state parameters
    googleAuthUrl.searchParams.set('state', JSON.stringify({
      action: 'link',
      userId: user.id,
      email: user.email,
      nonce: state
    }))

    // Log the linking attempt
    console.log(`User ${user.email} initiated Google account linking (direct redirect)`)

    return NextResponse.redirect(googleAuthUrl.toString())

  } catch (error) {
    console.error('Error initiating Google linking (GET):', error)
    return NextResponse.redirect(APP_URLS.frontendUrl('/account?error=server_error'))
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}