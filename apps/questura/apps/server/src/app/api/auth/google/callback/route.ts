//this code take info returned from google auth and logs it in the database

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import jwt from 'jsonwebtoken'
import { exchangeCodeForToken, getUserInfo, handleGoogleAuth } from '@/auth/lib/google-handler'
import { isActiveMember } from '@/shared/lib/membership'
import { APP_CONFIG, APP_URLS } from '@/shared/config'
import { setAuthCookie } from '@/shared/utils/cookie-helper'

export async function GET(req: NextRequest) {
  console.log('=== Google OAuth Callback Started ===')
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')
  
  // Parse state parameter for linking information
  let linkingData = null
  let returnTo = '/'
  
  try {
    if (state) {
      const parsedState = JSON.parse(decodeURIComponent(state))
      if (parsedState.action === 'link') {
        // SECURITY: Validate state timestamp to prevent replay attacks
        const stateAge = Date.now() - parsedState.timestamp
        const MAX_STATE_AGE = 15 * 60 * 1000 // 15 minutes
        
        if (stateAge > MAX_STATE_AGE) {
          console.error(`SECURITY: Expired linking state detected - Age: ${stateAge}ms, Max: ${MAX_STATE_AGE}ms`)
          throw new Error('LINKING_SECURITY_VIOLATION')
        }
        
        linkingData = parsedState
      } else {
        returnTo = state
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'LINKING_SECURITY_VIOLATION') {
      throw e // Re-throw security violations
    }
    // If state is not JSON, treat it as a simple returnTo URL
    returnTo = state || '/'
  }

  console.log('OAuth Callback - Params:', { 
    hasCode: !!code, 
    error, 
    state, 
    returnTo,
    linkingData,
    isLinking: !!linkingData,
    allParams: Object.fromEntries(searchParams.entries())
  })

  if (error) {
    console.error('OAuth error from Google:', error)
    return NextResponse.redirect(APP_URLS.frontendUrl('/login?error=oauth_error'))
  }

  if (!code) {
    console.error('OAuth callback - No code provided')
    return NextResponse.redirect(APP_URLS.frontendUrl('/login?error=missing_code'))
  }

  let userInfo: any = null
  
  try {
    console.log('OAuth Callback - Getting Payload instance...')
    const payload = await getPayload({ config })
    console.log('OAuth Callback - Payload instance created')

    // Exchange code for access token
    console.log('OAuth Callback - Exchanging code for token...')
    const accessToken = await exchangeCodeForToken(code)
    console.log('OAuth Callback - Access token received:', accessToken.substring(0, 20) + '...')

    // Get user info from Google
    console.log('OAuth Callback - Getting user info from Google...')
    userInfo = await getUserInfo(accessToken)
    console.log('OAuth Callback - User info received:', { 
      id: userInfo?.id, 
      email: userInfo?.email, 
      name: userInfo?.given_name + ' ' + userInfo?.family_name 
    })

    // Handle Google authentication (normal login or linking)
    console.log('OAuth Callback - Processing user authentication...')
    const isLinking = !!linkingData
    const linkingUserId = linkingData?.userId
    
    const user = await handleGoogleAuth(userInfo, { payload } as any, isLinking, linkingUserId)
    console.log('OAuth Callback - User processed:', { 
      id: user?.id, 
      email: user?.email, 
      authProvider: user?.authProvider 
    })

    // For linking, just redirect back with success flag - user is already logged in
    if (isLinking) {
      console.log('OAuth Callback - Linking successful, redirecting to auth-callback-close')
      console.log('=== Google OAuth Linking Success ===')
      return NextResponse.redirect(APP_URLS.frontendUrl('/auth-callback-close?linked=google'))
    }

    // For normal login, create JWT token and pass user data
    console.log('OAuth Callback - Creating JWT token for login...')

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        collection: 'users',
        tokenVersion: user.tokenVersion || 0
      },
      APP_CONFIG.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    )

    console.log('OAuth Callback - JWT token generated:', !!token, token ? `Length: ${token.length}` : 'NO TOKEN')

    if (!token) {
      throw new Error('Failed to generate JWT token')
    }

    // Normal login flow - pass token and user data
    console.log('OAuth Callback - Creating redirect URL for login...')

    // Extract pathname from returnTo if it's a full URL, otherwise use as-is
    let finalReturnTo = returnTo
    if (returnTo && returnTo !== '/') {
      try {
        // If returnTo is a full URL, extract just the pathname
        const returnToUrl = new URL(returnTo)
        finalReturnTo = returnToUrl.pathname + returnToUrl.search + returnToUrl.hash
      } catch {
        // Not a valid URL, assume it's already a path
        finalReturnTo = returnTo
      }
    }

    const authCallbackPath = finalReturnTo && finalReturnTo !== '/' ? `/auth?returnTo=${encodeURIComponent(finalReturnTo)}` : '/auth'
    const redirectUrl = new URL(APP_URLS.frontendUrl(authCallbackPath))

    const userData = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      authProvider: user.authProvider,
      isActiveMember: isActiveMember(user),
      subscriptionStatus: user.subscriptionStatus
    }

    console.log('OAuth Callback - User data being sent:', userData)
    console.log('OAuth Callback - Token being sent:', token.substring(0, 50) + '...')

    redirectUrl.searchParams.set('token', token)
    redirectUrl.searchParams.set('user', JSON.stringify(userData))

    console.log('OAuth Callback - Final redirect URL:', redirectUrl.toString())
    console.log('OAuth Callback - URL length:', redirectUrl.toString().length)
    console.log('=== Google OAuth Login Success ===')

    // Create response and set authentication cookie for frontend
    const response = NextResponse.redirect(redirectUrl.toString())
    setAuthCookie(response, token)
    console.log('OAuth Callback - Set-Cookie header configured')
    return response
  } catch (error) {
    console.error('=== Google OAuth Callback ERROR ===')
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      userInfo: userInfo ? { email: userInfo.email, id: userInfo.id } : 'No user info'
    })
    
    // Handle specific account conflict errors
    if (error instanceof Error) {
      console.error('Specific error type:', error.message)
      
      if (error.message === 'ACCOUNT_EXISTS_LOCAL' || error.message === 'ACCOUNT_EXISTS_LOCAL_LINK_REQUIRED') {
        console.error('Redirecting due to local account conflict')
        return NextResponse.redirect(
          APP_URLS.frontendUrl(`/?error=account_exists_local&email=${encodeURIComponent(userInfo?.email || '')}`)
        )
      }

      // SECURITY: Handle linking security violations with generic error
      if (error.message === 'LINKING_SECURITY_VIOLATION') {
        // Log detailed security violation server-side only
        const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
        console.error(`SECURITY ALERT: Account linking violation detected - IP: ${clientIP}, Timestamp: ${new Date().toISOString()}, UserInfo: ${userInfo ? userInfo.email : 'unknown'}`)

        // Return generic error to frontend (don't reveal specific violation)
        return NextResponse.redirect(
          APP_URLS.frontendUrl('/account/linking-error')
        )
      }

      // Legacy error handling for backward compatibility
      if (error.message === 'EMAIL_MISMATCH' || error.message === 'ALREADY_LINKED' || error.message === 'INVALID_ACCOUNT_STATE_FOR_LINKING') {
        console.error(`Legacy linking error: ${error.message}`)
        return NextResponse.redirect(
          APP_URLS.frontendUrl('/account/linking-error')
        )
      }

      if (error.message === 'OAUTH_ID_MISMATCH') {
        console.error('Redirecting due to OAuth ID mismatch')
        return NextResponse.redirect(
          APP_URLS.frontendUrl('/login?error=oauth_id_mismatch')
        )
      }

      if (error.message === 'ADMIN_ACCOUNT_BLOCKED') {
        console.error('Redirecting due to admin account block')
        return NextResponse.redirect(
          APP_URLS.frontendUrl('/login?error=admin_blocked')
        )
      }
    }
    
    console.error('Redirecting due to general OAuth failure')
    return NextResponse.redirect(APP_URLS.frontendUrl('/login?error=oauth_failed'))
  }
}
