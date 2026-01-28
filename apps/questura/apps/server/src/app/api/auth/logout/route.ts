import { NextRequest, NextResponse } from 'next/server'
import { getCorsHeaders, handleCorsOptions } from '@/auth/lib/auth-middleware'

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)

  try {
    const response = NextResponse.json(
      { success: true, message: 'Logged out successfully' },
      { headers: corsHeaders }
    )

    // Clear the httpOnly cookie with same settings as login
    // Need to match the exact settings from login to properly clear
    response.cookies.set('payload-token', '', {
      httpOnly: true,
      secure: true, // Match login settings
      sameSite: 'none', // Match login settings  
      maxAge: 0, // Expire immediately
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { success: false, message: 'Logout failed' },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}