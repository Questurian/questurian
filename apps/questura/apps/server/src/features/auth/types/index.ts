import { PayloadRequest } from 'payload'
import { User } from '@/payload-types'

/**
 * Extract authenticated user from Payload request
 * Returns undefined if user is not authenticated
 */
export function getAuthenticatedUser(req: PayloadRequest): User | undefined {
  return req.user as User | undefined
}