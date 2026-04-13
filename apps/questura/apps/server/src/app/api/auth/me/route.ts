import { NextRequest } from 'next/server'
import { forwardPayloadUsersRequest } from '@/features/auth/lib/forward-payload-users-request'
import { handleCorsOptions } from '@/shared/utils/cors'

export async function GET(req: NextRequest) {
  return forwardPayloadUsersRequest(req, 'me')
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
