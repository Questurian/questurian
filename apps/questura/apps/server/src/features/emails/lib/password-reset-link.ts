import type { Payload } from 'payload'

import {
  buildGreeting,
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
    <div style="text-align: center; margin: 30px 0;">
      <a href="${url}" style="background-color: #1A1A1A; color: #ffffff; padding: 14px 22px; border-radius: 4px; text-decoration: none; font-weight: 600; display: inline-block;">
        Reset password
      </a>
    </div>
    <p style="font-size: 14px; line-height: 1.5; color: #777;">
      If the button does not work, copy and paste this link into your browser:
      <br>
      <a href="${url}" style="color: #1A1A1A; word-break: break-all;">${url}</a>
    </p>
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
