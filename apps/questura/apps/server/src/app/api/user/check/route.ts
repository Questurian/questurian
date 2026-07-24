import { NextRequest } from 'next/server'

import { checkAccountCheckRateLimit } from '@/features/visitor-auth/lib/account-check-rate-limit'
import {
  assertValidEmail,
  checkVisitorAccount,
} from '@/features/visitor-auth/lib/legacy-auth-compat'
import { corsResponse, handleCorsOptions } from '@/shared/utils/cors'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    const normalizedEmail = assertValidEmail(email)
    const rateLimit = await checkAccountCheckRateLimit(req, normalizedEmail)

    if (!rateLimit.allowed) {
      const response = corsResponse(
        { success: false, message: 'Too many account checks. Please try again shortly.' },
        req,
        429
      )
      response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds))
      return response
    }

    const result = await checkVisitorAccount(normalizedEmail)
    return corsResponse(result, req)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : ''
    const isValidationError =
      errorMessage.includes('valid email') || errorMessage.includes('Email is required')

    return corsResponse(
      {
        success: false,
        message: isValidationError ? errorMessage : 'Failed to check user',
      },
      req,
      isValidationError ? 400 : 500
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
