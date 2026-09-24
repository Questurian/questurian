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
    ${createActionLink(url, 'Verify email')}
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
