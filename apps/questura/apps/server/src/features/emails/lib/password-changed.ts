import type { Payload } from 'payload'

import { APP_URLS } from '@/shared/config'
import { formatMemberTimestamp } from '@/shared/lib/dates'
import type { EmailResult, PasswordChangedEmailData } from '../types'
import {
  buildGreeting,
  createActionLink,
  createFooter,
  createInfoBox,
  EMAIL_PARAGRAPH_STYLE,
  sendEmail,
  wrapEmailContent,
} from './email-utils'

/**
 * Security notice after a signed-in password change. The reader who did it
 * can ignore it; the reader who did not learns about it while their address
 * still reaches the account and a reset still works.
 */
export async function sendPasswordChangedEmail(
  payload: Payload,
  { email, firstName, lastName }: PasswordChangedEmailData,
  changedAt: Date = new Date()
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)
  const timestamp = formatMemberTimestamp(changedAt)

  const html = wrapEmailContent(`
    <h1 style="color: #333; text-align: center;">Your password was changed</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      The password for your Questurian account was changed on ${timestamp}.
      If that was you, there is nothing else to do.
    </p>
    ${createInfoBox('warning', '<strong>Did not change it?</strong> Reset your password from the sign-in page straight away, then check your account. Reply to this email if you need help.')}
    ${createActionLink(APP_URLS.frontendUrl('/account'), 'Open your account')}
    ${createFooter('Questurian Security Team')}
  `)

  return sendEmail(payload, {
    emailType: 'password changed notice',
    to: email,
    subject: 'Your Questurian password was changed',
    html,
  })
}
