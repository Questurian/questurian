import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createAuthErrorResponse } from '@/auth/lib/auth-errors'
import { authenticateRequest, getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    console.log('=== PASSWORD VERIFICATION REQUEST ===')
    const payload = await getPayload({ config })

    // Authenticate the request - ensure user is logged in
    const authResult = await authenticateRequest(req)
    console.log('Auth result:', { hasError: !!authResult.error, hasUser: !!authResult.user })
    if (authResult.error) {
      console.log('Auth failed:', authResult.error)
      return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: corsHeaders })
    }
    const user = authResult.user!
    console.log('Authenticated user:', { id: user.id, email: user.email, hasLocalPassword: user.hasLocalPassword })

    const { password } = await req.json()
    console.log('Password received:', { provided: !!password, length: password?.length })

    // Validation
    if (!password) {
      console.log('ERROR: No password provided in request')
      const errorResponse = createAuthErrorResponse('INVALID_REQUEST', {
        details: 'Password is required'
      })
      return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
    }

    // Check if user has a local password
    if (!user.hasLocalPassword) {
      console.log('ERROR: User has no local password set')
      return NextResponse.json(
        {
          success: false,
          error: 'No password set for this account'
        },
        { status: 400, headers: corsHeaders }
      )
    }

    // Use Payload's login method to verify the password
    // This is the only reliable way to check passwords since Payload hides the hash
    console.log('Attempting to verify password using payload.login()...')
    let isValid = false

    try {
      await payload.login({
        collection: 'users',
        data: {
          email: user.email,
          password: password
        }
      })
      // If login succeeds, password is valid
      isValid = true
      console.log('Password verification successful via payload.login()')
    } catch (loginError) {
      // If login fails, password is invalid
      isValid = false
      console.log('Password verification failed:', loginError instanceof Error ? loginError.message : 'Unknown error')
    }

    console.log('Final verification result:', isValid)
    console.log('=== PASSWORD VERIFICATION COMPLETE ===')

    return NextResponse.json(
      { success: isValid },
      { headers: corsHeaders }
    )

  } catch (error) {
    console.error('=== ERROR IN PASSWORD VERIFICATION ===')
    console.error('Error verifying password:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'N/A')
    const errorResponse = createAuthErrorResponse('INTERNAL_SERVER_ERROR')
    return NextResponse.json(errorResponse.error, { status: errorResponse.status, headers: corsHeaders })
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
