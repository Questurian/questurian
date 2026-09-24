import type { Payload } from 'payload'

import { APP_URLS } from '@/shared/config'
import { formatMemberTimestamp } from '@/shared/lib/dates'
import type { EmailResult, GoogleAccountLinkedEmailData } from '../types'
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
 * Security notice when a Google account is connected to an existing
 * Questurian account. Linking is a second way in, so the owner hears about it
 * in the same way as a password change.
 */
export async function sendGoogleAccountLinkedEmail(
  payload: Payload,
  { email, firstName, lastName }: GoogleAccountLinkedEmailData,
  linkedAt: Date = new Date()
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)
  const timestamp = formatMemberTimestamp(linkedAt)

  const html = wrapEmailContent(`
    <h1 style="color: #333; text-align: center;">Google sign-in was connected</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      A Google account was connected to your Questurian account on ${timestamp}. You can now sign in
      with Google as well as with your password. If that was you, there is nothing else to do.
    </p>
    ${createInfoBox('warning', '<strong>Did not connect it?</strong> Disconnect Google from your account page, change your password, and reply to this email so we can help.')}
    ${createActionLink(APP_URLS.frontendUrl('/account'), 'Open your account')}
    ${createFooter('Questurian Security Team')}
  `)

  return sendEmail(payload, {
    emailType: 'google account linked email',
    to: email,
    subject: 'Google sign-in was connected to your Questurian account',
    html,
  })
}
