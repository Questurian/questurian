import { NextRequest } from 'next/server'
import { checkUser } from '@/features/auth/lib/auth-service'
import { corsResponse, handleCorsOptions } from '@/shared/utils/cors'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    const result = await checkUser(email)
    return corsResponse(result, req)

  } catch (error) {
    console.error('Check user error:', error)
    return corsResponse(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to check user'
      },
      req,
      error instanceof Error && error.message.includes('valid email') ? 400 : 500
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}