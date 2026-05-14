import { PayloadRequest } from 'payload'

import { User } from '@/payload-types'

export function getAuthenticatedUser(req: PayloadRequest): User | undefined {
  return req.user as User | undefined
}
