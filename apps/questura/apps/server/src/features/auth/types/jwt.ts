/**
 * JWT Payload structure for authentication tokens
 */
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
