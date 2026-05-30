import type { Payload } from 'payload'

import {
  buildGreeting,
  createFooter,
  createInfoBox,
  EMAIL_PARAGRAPH_STYLE,
  sendEmail,
  wrapEmailContent,
} from './email-utils'
import type { EmailResult, EmailVerificationLinkParams } from '../types'

export async function sendVisitorEmailVerificationLinkEmail(
  payload: Payload,
  { email, firstName, lastName, url }: EmailVerificationLinkParams
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)

  const html = wrapEmailContent(`
    <h1 style="color: #333; text-align: center;">Verify Your Email Address</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      Please verify your email address to finish securing your Questurian account.
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${url}" style="background-color: #1A1A1A; color: #ffffff; padding: 14px 22px; border-radius: 4px; text-decoration: none; font-weight: 600; display: inline-block;">
        Verify email
      </a>
    </div>
    <p style="font-size: 14px; line-height: 1.5; color: #777;">
      If the button does not work, copy and paste this link into your browser:
      <br>
      <a href="${url}" style="color: #1A1A1A; word-break: break-all;">${url}</a>
    </p>
    ${createInfoBox('warning', '<strong>Did not request this?</strong> You can safely ignore this email.')}
    ${createFooter('Questurian Security Team')}
  `)

  return sendEmail(payload, {
    emailType: 'visitor email verification link',
    to: email,
    subject: 'Verify your Questurian email',
    html,
  })
}
