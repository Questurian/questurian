import { NextRequest } from 'next/server'

import { checkVisitorAccount, responseWithCors } from '@/features/visitor-auth/lib/legacy-auth-compat'
import { handleCorsOptions } from '@/shared/utils/cors'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    const result = await checkVisitorAccount(email)
    return responseWithCors(req, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check user'
    return responseWithCors(
      req,
      { success: false, message },
      { status: message.includes('valid email') || message.includes('Email is required') ? 400 : 500 }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
