import type { User } from '@/payload-types'

export interface AuthResult {
  user: User | null
  error: string | null
  status: number
}

export interface AuthMiddlewareOptions {
  requireAuth?: boolean
  allowedRoles?: Array<'admin' | 'editor' | 'writer'>
}
