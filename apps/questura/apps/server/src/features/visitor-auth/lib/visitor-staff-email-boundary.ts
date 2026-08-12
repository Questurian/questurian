import { APIError } from 'better-auth/api'

import { normalizeEmail } from '@/shared/lib/normalize-email'
import { auditVisitorAuthSecurityEvent } from './security-audit'
import { isStaffEmail } from './staff-email-guard'

const STAFF_EMAIL_GUARDED_PATHS = new Set([
  '/sign-up/email',
  '/sign-in/social',
  '/link-social',
  '/change-email',
  '/callback/google',
])

export async function rejectStaffEmailForVisitorAuth({
  path,
  body,
  email: suppliedEmail,
}: {
  path: string
  body?: Record<string, unknown> | null
  email?: unknown
}): Promise<void> {
  if (!STAFF_EMAIL_GUARDED_PATHS.has(path)) return

  const email = normalizeEmail(
    suppliedEmail ?? (path === '/change-email' ? body?.newEmail : body?.email),
  )
  if (!email || !(await isStaffEmail(email))) return

  auditVisitorAuthSecurityEvent({
    type: 'visitor_auth_staff_email_blocked',
    email,
    path,
  })
  throw new APIError('FORBIDDEN', { message: 'Please use the staff login.' })
}
