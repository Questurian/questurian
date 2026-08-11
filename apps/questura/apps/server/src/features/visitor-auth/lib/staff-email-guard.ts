import { getPayload } from 'payload'

import config from '@/payload.config'

const STAFF_EMAIL_DOMAIN = '@questurian.com'

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

/**
 * Whether an address belongs to Staff, and is therefore barred from Visitor
 * auth (ADR-0004).
 *
 * Disabled accounts still count. Under ADR-0007 a departed person's row is
 * disabled rather than deleted, so `disabled` is an inactive staff record, not
 * an absent one — the address is still spoken for, and letting it be claimed
 * as a Visitor would put two identities on one email and collide if the
 * account were ever re-enabled. Freeing an address for Visitor signup is what
 * deleting the row is for.
 */
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
        // Intentionally unfiltered by `status`: see the note above.
        { role: { in: ['admin', 'editor', 'writer'] } },
      ],
    },
  })

  return existingStaff.docs.length > 0
}
