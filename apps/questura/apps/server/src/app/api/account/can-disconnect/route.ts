import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    // Use centralized auth middleware
    const authResult = await authenticateRequest(req)

    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: corsHeaders }
      )
    }

    const user = authResult.user!

    const { method } = await req.json()

    if (!method || !['google', 'password'].includes(method)) {
      return NextResponse.json(
        { error: 'Method must be either "google" or "password"' },
        { status: 400, headers: corsHeaders }
      )
    }

    let canDisconnect = false
    let reason = ''
    let currentMethods: string[] = []
    let remainingMethods: string[] = []

    // Determine current authentication methods
    if (user.hasLocalPassword) currentMethods.push('password')
    if (user.hasGoogleOAuth) currentMethods.push('google')

    if (method === 'google') {
      // Can disconnect Google if user has password backup
      canDisconnect = Boolean(user.hasLocalPassword)
      reason = canDisconnect
        ? 'Safe to disconnect Google - password backup available'
        : 'Cannot disconnect Google - no password backup. Set up a password first.'
      remainingMethods = canDisconnect ? ['password'] : []
    }

    if (method === 'password') {
      // Can disconnect password if user has Google OAuth backup
      canDisconnect = Boolean(user.hasGoogleOAuth)
      reason = canDisconnect
        ? 'Safe to disconnect password - Google backup available'
        : 'Cannot disconnect password - no Google backup. Link a Google account first.'
      remainingMethods = canDisconnect ? ['google'] : []
    }

    return NextResponse.json({
      canDisconnect,
      reason,
      currentMethods,
      remainingMethods,
      authProvider: user.authProvider,
      safetyCheck: {
        hasLocalPassword: Boolean(user.hasLocalPassword),
        hasGoogleOAuth: Boolean(user.hasGoogleOAuth),
        methodCount: currentMethods.length
      }
    }, { headers: corsHeaders })

  } catch (error) {
    console.error('Error checking disconnect safety:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

// Alternative GET endpoint for simple checks
export async function GET(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    // Use centralized auth middleware
    const authResult = await authenticateRequest(req)

    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: corsHeaders }
      )
    }

    const user = authResult.user!

    const url = new URL(req.url)
    const method = url.searchParams.get('method')

    if (!method || !['google', 'password'].includes(method)) {
      return NextResponse.json(
        { error: 'Query parameter "method" must be either "google" or "password"' },
        { status: 400, headers: corsHeaders }
      )
    }

    let canDisconnect = false

    if (method === 'google') {
      canDisconnect = Boolean(user.hasLocalPassword)
    }

    if (method === 'password') {
      canDisconnect = Boolean(user.hasGoogleOAuth)
    }

    return NextResponse.json({
      canDisconnect,
      method,
      authProvider: user.authProvider
    }, { headers: corsHeaders })

  } catch (error) {
    console.error('Error checking disconnect safety (GET):', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}