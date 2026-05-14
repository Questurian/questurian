import type { PayloadRequest } from 'payload'
import { sendWelcomeEmail, sendGoogleAccountLinkedEmail } from '@/emails'
import { generateSecurePassword } from '@/shared/utils/utils'
import { APP_CONFIG, APP_CONFIG_WITH_GOOGLE } from '@/shared/config'

import type { GoogleUserInfo } from '../types'

export const exchangeCodeForToken = async (code: string): Promise<string> => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: APP_CONFIG.google.clientId,
      client_secret: APP_CONFIG.google.clientSecret,
      redirect_uri: APP_CONFIG_WITH_GOOGLE.google.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  })

  if (!response.ok) {
    throw new Error(`Failed to exchange code for token: ${response.statusText}`)
  }

  const data = await response.json()
  return data.access_token
}

export const getUserInfo = async (accessToken: string): Promise<GoogleUserInfo> => {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.statusText}`)
  }

  return response.json()
}

export const handleGoogleAuth = async (userInfo: GoogleUserInfo, req: PayloadRequest, isLinking = false, linkingUserId?: string) => {
  const { payload } = req

  // SECURITY: Check if Google account (oauthId) is already linked to any user
  const existingGoogleUsers = await payload.find({
    collection: 'users',
    where: {
      oauthId: {
        equals: userInfo.id,
      },
    },
  })

  // Try to find existing user by email
  const existingUsers = await payload.find({
    collection: 'users',
    where: {
      email: {
        equals: userInfo.email,
      },
    },
  })

  if (existingUsers.docs.length > 0) {
    const existingUser = existingUsers.docs[0]
    
    // SECURITY: Block admin/editor accounts from OAuth login
    if (existingUser.role === 'admin' || existingUser.role === 'editor') {
      throw new Error('ADMIN_ACCOUNT_BLOCKED')
    }
    
    // LINKING MODE: Add Google to existing local account
    if (isLinking && linkingUserId) {
      // STRICT SECURITY VALIDATION FOR LINKING

      // 1. Verify user ID matches exactly
      if (String(existingUser.id) !== linkingUserId) {
        console.error(`Security violation: User ID mismatch during linking. Expected: ${linkingUserId}, Got: ${existingUser.id}`)
        throw new Error('LINKING_SECURITY_VIOLATION')
      }
      
      // 2. Strict email validation - emails must match exactly (case-sensitive)
      if (existingUser.email !== userInfo.email) {
        console.error(`Security violation: Email mismatch during linking. User email: ${existingUser.email}, Google email: ${userInfo.email}`)
        throw new Error('LINKING_SECURITY_VIOLATION')
      }
      
      // 3. Check if Google account is already linked to another user
      if (existingGoogleUsers.docs.length > 0) {
        const googleLinkedUser = existingGoogleUsers.docs[0]
        if (String(googleLinkedUser.id) !== linkingUserId) {
          console.error(`Security violation: Google account ${userInfo.email} (ID: ${userInfo.id}) already linked to user ${googleLinkedUser.id}`)
          throw new Error('LINKING_SECURITY_VIOLATION')
        }
      }
      
      // 4. Validate account state
      if (existingUser.authProvider !== 'local') {
        console.error(`Security violation: Invalid account state for linking. AuthProvider: ${existingUser.authProvider}, Expected: local`)
        throw new Error('LINKING_SECURITY_VIOLATION')
      }
      
      // 5. Check if already has Google OAuth
      if (existingUser.hasGoogleOAuth) {
        console.error(`Security violation: User ${existingUser.email} already has Google OAuth linked`)
        throw new Error('LINKING_SECURITY_VIOLATION')
      }

      // SECURITY: All validations passed, proceed with linking
      await payload.update({
        collection: 'users',
        id: existingUser.id,
        data: {
          authProvider: 'dual',
          hasGoogleOAuth: true,
          oauthId: userInfo.id,
          googleLinkedAt: new Date().toISOString(),
          // Mark email as verified since Google verified it
          emailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpires: null,
        }
      })

      // Fetch the updated user to return the latest data
      const updatedUserResult = await payload.findByID({
        collection: 'users',
        id: existingUser.id,
      })

      // SECURITY AUDIT: Log successful linking
      const clientIp = req.headers?.get?.('x-forwarded-for') || req.headers?.get?.('x-real-ip') || 'unknown'
      console.log(`SECURITY AUDIT: Google account linking successful - User: ${existingUser.email}, Google ID: ${userInfo.id}, IP: ${clientIp}, Timestamp: ${new Date().toISOString()}`)

      // Send Google account linked email
      try {
        await sendGoogleAccountLinkedEmail(payload, {
          email: existingUser.email,
          firstName: (existingUser.firstName || '') as string,
          lastName: (existingUser.lastName || '') as string,
          googleEmail: userInfo.email
        })
        console.log(`✅ Google account linked email sent to: ${existingUser.email}`)
      } catch (emailError) {
        console.error('❌ Failed to send Google account linked email:', emailError)
        // Don't fail the linking if email fails
      }

      return updatedUserResult
    }
    
    // NORMAL LOGIN: Existing Google or dual user
    if (existingUser.authProvider === 'google' || existingUser.authProvider === 'dual') {
      // Verify OAuth ID matches for security
      if (existingUser.oauthId && existingUser.oauthId !== userInfo.id) {
        throw new Error('OAUTH_ID_MISMATCH')
      }

      await payload.update({
        collection: 'users',
        id: existingUser.id,
        data: {
          // Update OAuth ID if missing (legacy users)
          ...((!existingUser.oauthId) && { oauthId: userInfo.id }),
          // Mark email as verified since Google verified it
          emailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpires: null,
        }
      })
      return existingUser
    }
    
    // CONFLICT: Local-only user trying to login with Google (not linking)
    if (existingUser.authProvider === 'local' && !isLinking) {
      throw new Error('ACCOUNT_EXISTS_LOCAL_LINK_REQUIRED')
    }

    // Fallback for users without authProvider set (legacy data)
    if (!existingUser.authProvider) {
      throw new Error('ACCOUNT_EXISTS_LOCAL_LINK_REQUIRED')
    }
    
    return existingUser
  }

  // LINKING MODE: No existing user found but linking was requested
  if (isLinking) {
    throw new Error('EMAIL_MISMATCH')
  }

  // CREATE NEW GOOGLE-ONLY USER
  const newUser = await payload.create({
    collection: 'users',
    data: {
      email: userInfo.email,
      firstName: userInfo.given_name,
      lastName: userInfo.family_name,
      role: 'user',
      authProvider: 'google',
      hasGoogleOAuth: true,
      hasLocalPassword: false,
      oauthId: userInfo.id,
      googleLinkedAt: new Date().toISOString(),
      // Default membership values for new OAuth users
      subscriptionStatus: 'none',
      membershipExpiration: null,
      // Generate a cryptographically secure random password since OAuth users won't use it
      password: generateSecurePassword(),
      // Mark email as verified since Google verified it
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpires: null,
      tokenVersion: 0,
    },
    disableVerificationEmail: true,
  })

  console.log(`Created new Google-only user: ${newUser.email}`)

  // Send welcome email after Google OAuth user creation
  await sendWelcomeEmail(payload, {
    email: userInfo.email,
    firstName: userInfo.given_name,
    lastName: userInfo.family_name
  })

  return newUser
}

// Legacy function for backward compatibility
export const findOrCreateUser = async (userInfo: GoogleUserInfo, req: PayloadRequest) => {
  return handleGoogleAuth(userInfo, req, false)
}