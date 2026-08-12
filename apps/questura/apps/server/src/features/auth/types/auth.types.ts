import type { ServiceAccount, User } from '@/payload-types'
import type { ServiceAccountCapability } from '../lib/service-account-grants'

export interface AuthResult {
  user: User | ServiceAccount | null
  error: string | null
  status: number
}

export interface AuthMiddlewareOptions {
  requireAuth?: boolean
  allowedRoles?: Array<'admin' | 'editor' | 'writer'>
  serviceAccountCapability?: ServiceAccountCapability
}
