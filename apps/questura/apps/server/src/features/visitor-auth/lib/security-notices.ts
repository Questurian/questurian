import type { Payload } from 'payload'

import {
  sendEmailChangedNotificationEmail,
  sendGoogleAccountLinkedEmail,
  sendPasswordChangedEmail,
} from '@/features/emails'
import { maskEmail } from '@/features/emails/lib/mask-email'
import { normalizeEmail } from '@/shared/lib/normalize-email'
import { splitDisplayName } from './visitor-profile'

/**
 * The three security notices a visitor gets (launch fix plan, decision D4):
 * password changed, email changed (to the OLD address), Google linked.
 *
 * Each one is best effort. The change it reports has already happened, so a
 * mail failure must not turn a successful password change into an error the
 * reader retries. Failures are logged (masked) and recorded in email-logs by
 * `sendEmail`.
 */

export type NoticeUser = { email: string; name?: string | null }
type LoadPayload = () => Promise<Payload>

const defaultLoadPayload: LoadPayload = async () => {
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@/payload.config')])
  return getPayload({ config })
}

async function bestEffort(label: string, to: string, send: () => Promise<{ success: boolean; error?: string }>) {
  try {
    const result = await send()
    if (!result.success) console.error(`⚠️ ${label} notice not sent:`, { to: maskEmail(to), error: result.error })
  } catch (error) {
    console.error(`⚠️ ${label} notice not sent:`, {
      to: maskEmail(to),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export async function noticePasswordChanged(user: NoticeUser, loadPayload: LoadPayload = defaultLoadPayload) {
  if (!user.email) return
  await bestEffort('password-changed', user.email, async () =>
    sendPasswordChangedEmail(await loadPayload(), { email: user.email, ...splitDisplayName(user.name) })
  )
}

/**
 * `previousEmail` is the address the account had before the change. Nothing
 * is sent when it is missing or the same as the new one: first-time
 * verification after sign-up runs through the same callback.
 */
export async function noticeEmailChanged(
  { previousEmail, user }: { previousEmail: string | null | undefined; user: NoticeUser },
  loadPayload: LoadPayload = defaultLoadPayload
) {
  const oldEmail = normalizeEmail(previousEmail)
  const newEmail = normalizeEmail(user.email)
  if (!oldEmail || !newEmail || oldEmail === newEmail) return

  await bestEffort('email-changed', oldEmail, async () =>
    sendEmailChangedNotificationEmail(await loadPayload(), { oldEmail, newEmail, ...splitDisplayName(user.name) })
  )
}

/**
 * A Google account row created for a user who already had another way in is
 * a link. One created alongside a brand-new user is a Google sign-up, which
 * is not news to anyone.
 */
export function isGoogleLink(
  account: { providerId: string; id?: string },
  accountsOfUser: Array<{ providerId: string; id?: string }>
): boolean {
  if (account.providerId !== 'google') return false
  return accountsOfUser.some((other) => other.providerId !== 'google' && other.id !== account.id)
}

export async function noticeGoogleLinked(user: NoticeUser, loadPayload: LoadPayload = defaultLoadPayload) {
  if (!user.email) return
  await bestEffort('google-linked', user.email, async () =>
    sendGoogleAccountLinkedEmail(await loadPayload(), { email: user.email, ...splitDisplayName(user.name) })
  )
}
