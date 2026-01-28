import { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { isActiveMember } from '@/shared/lib/membership'

export async function loginUser(email: string, password: string, req: NextRequest) {
  if (!email || !password) {
    throw new Error('Email and password are required')
  }

  const payload = await getPayload({ config })

  // Use Payload's built-in login method
  const result = await payload.login({
    collection: 'users',
    data: { email, password },
    req: {
      ...req,
      headers: req.headers
    }
  })

  if (!result.user) {
    throw new Error('Invalid email or password')
  }

  // Return token and user data (match frontend expectations)
  const responseData = {
    token: result.token, // Actual JWT token string
    user: {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName || '',
      lastName: result.user.lastName || '',
      role: result.user.role,
      authProvider: result.user.authProvider || 'local',
      isActiveMember: isActiveMember(result.user),
      subscriptionStatus: result.user.subscriptionStatus
    }
  }

  console.log('=== Regular Login Response ===')
  console.log('Login successful for:', result.user.email)
  console.log('Token exists:', !!result.token)
  console.log('Token length:', result.token ? result.token.length : 0)
  console.log('Token preview:', result.token ? result.token.substring(0, 50) + '...' : 'NO TOKEN')
  console.log('User data being sent:', responseData.user)
  console.log('Response payload structure:', {
    hasToken: !!responseData.token,
    hasUser: !!responseData.user,
    userEmail: responseData.user.email,
    tokenLength: responseData.token?.length
  })
  console.log('Actual response being sent:', responseData)
  console.log('=== Regular Login Response End ===')

  return responseData
}

export async function checkUser(email: string) {
  if (!email) {
    throw new Error('Email is required')
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw new Error('Please enter a valid email address')
  }

  const payload = await getPayload({ config })

  try {
    const existingUsers = await payload.find({
      collection: 'users',
      where: {
        email: { equals: email }
      },
      limit: 1
    })

    const userExists = existingUsers.docs.length > 0
    const user = userExists ? existingUsers.docs[0] : null

    // Return user existence and available authentication methods
    return {
      exists: userExists,
      authMethods: user ? {
        local: user.authProvider === 'local' || user.authProvider === 'dual',
        google: user.authProvider === 'google' || user.authProvider === 'dual',
        hasPassword: !!user.hasLocalPassword,
        hasGoogle: !!user.hasGoogleOAuth
      } : {
        local: false,
        google: false,
        hasPassword: false,
        hasGoogle: false
      },
      // Don't expose sensitive user data, just auth-related info
      user: user ? {
        role: user.role,
        authProvider: user.authProvider,
        isProtected: user.role === 'admin' || user.role === 'editor' // Frontend can use this to show appropriate messages
      } : null
    }

  } catch (error) {
    console.error('Error checking user:', error)
    throw new Error('Failed to check user')
  }
}