import { NextRequest, NextResponse } from 'next/server'
import { loginUser } from '@/features/auth/lib/auth-service'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'
import { setAuthCookie } from '@/shared/utils/cookie-helper'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    const result = await loginUser(email, password, req)

    // Create response with CORS headers
    const response = NextResponse.json(result, {
      status: 200,
      headers: getCorsHeaders(req)
    })

    // Manually set the auth cookie to ensure it's set with correct attributes
    if (result.token) {
      setAuthCookie(response, result.token)
      console.log('Login - Auth cookie set manually for cross-origin support')
    }

    return response

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Login failed'
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