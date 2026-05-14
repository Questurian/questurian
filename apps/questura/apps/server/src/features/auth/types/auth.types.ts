import type { User } from '@/payload-types'

export interface JwtPayload {
  userId?: string
  id?: string
  email?: string
  role?: 'admin' | 'editor' | 'writer' | 'user'
  tokenVersion?: number
  membershipExpiration?: string
  emailVerified?: boolean
  iat?: number
  exp?: number
}

export interface AuthResult {
  user: User | null
  error: string | null
  status: number
}

export interface AuthMiddlewareOptions {
  requireAuth?: boolean
  allowedRoles?: string[]
  requireEmailVerification?: boolean
}
