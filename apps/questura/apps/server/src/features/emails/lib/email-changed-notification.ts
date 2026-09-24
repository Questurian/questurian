import type { Payload } from 'payload'

import { APP_URLS } from '@/shared/config'
import { formatMemberTimestamp } from '@/shared/lib/dates'
import type { EmailChangedNotificationData, EmailResult } from '../types'
import {
  buildGreeting,
  createActionLink,
  createFooter,
  createInfoBox,
  createSectionBox,
  EMAIL_PARAGRAPH_STYLE,
  escapeHtml,
  sendEmail,
  wrapEmailContent,
} from './email-utils'

/**
 * Security notice to the OLD address once an email change has been verified.
 *
 * The new address proves only that the person asking controls the new
 * address. If a session was stolen, the old address is the one place the
 * real owner still hears about it, so this goes there and nowhere else.
 */
export async function sendEmailChangedNotificationEmail(
  payload: Payload,
  { oldEmail, newEmail, firstName, lastName }: EmailChangedNotificationData,
  changedAt: Date = new Date()
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)
  const timestamp = formatMemberTimestamp(changedAt)

  const html = wrapEmailContent(`
    <h1 style="color: #333; text-align: center;">Your email address was changed</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      The email address on your Questurian account was changed. We are writing to your previous
      address so you know.
    </p>
    ${createSectionBox(
      'Change details',
      `<p style="margin: 8px 0;"><strong>Previous Email:</strong> ${escapeHtml(oldEmail)}</p>
      <p style="margin: 8px 0;"><strong>New Email:</strong> ${escapeHtml(newEmail)}</p>
      <p style="margin: 8px 0;"><strong>Changed On:</strong> ${timestamp}</p>`,
      'neutral'
    )}
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      From now on you sign in with the new address, and account and membership emails go there.
      If that was you, there is nothing else to do.
    </p>
    ${createInfoBox('warning', '<strong>Did not make this change?</strong> Reply to this email straight away so we can secure your account. This address no longer signs in to it.')}
    ${createActionLink(APP_URLS.frontendUrl('/account'), 'Open your account')}
    ${createFooter('Questurian Security Team')}
  `)

  return sendEmail(payload, {
    emailType: 'email changed notification email',
    to: oldEmail,
    subject: 'Your Questurian email address was changed',
    html,
  })
}
