import type { Payload } from 'payload'

import {
  buildGreeting,
  createActionLink,
  createFooter,
  createInfoBox,
  EMAIL_PARAGRAPH_STYLE,
  sendEmail,
  wrapEmailContent,
} from './email-utils'
import type { EmailResult, PasswordResetLinkEmailData } from '../types'

export async function sendPasswordResetLinkEmail(
  payload: Payload,
  { email, firstName, lastName, url }: PasswordResetLinkEmailData
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)

  const html = wrapEmailContent(`
    <h1 style="color: #333; text-align: center;">Reset Your Password</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      We received a request to reset the password for your Questurian account.
    </p>
    ${createActionLink(url, 'Reset password')}
    ${createInfoBox('warning', '<strong>Did not request this?</strong> You can safely ignore this email. Your password will remain unchanged.')}
    ${createFooter('Questurian Security Team')}
  `)

  return sendEmail(payload, {
    emailType: 'password reset link email',
    to: email,
    subject: 'Reset your Questurian password',
    html,
  })
}
