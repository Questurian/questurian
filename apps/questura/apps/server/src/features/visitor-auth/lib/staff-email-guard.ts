import { getPayload } from 'payload'

import config from '@/payload.config'

const STAFF_EMAIL_DOMAIN = '@questurian.com'

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export async function isStaffEmail(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return false
  if (normalizedEmail.endsWith(STAFF_EMAIL_DOMAIN)) return true

  const payload = await getPayload({ config })
  const existingStaff = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    where: {
      and: [
        { email: { equals: normalizedEmail } },
        { role: { in: ['admin', 'editor', 'writer'] } },
      ],
    },
  })

  return existingStaff.docs.length > 0
}
