import type { Payload } from 'payload'
import { buildGreeting, sendEmail, wrapEmailContent, createFooter, createSectionBox, createInfoBox, EMAIL_PARAGRAPH_STYLE } from './email-utils'
import type { EmailResult, PasswordResetEmailData } from '../types'

export async function sendPasswordResetEmail(
  payload: Payload,
  { email, firstName, lastName, code }: PasswordResetEmailData
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)

  const html = wrapEmailContent(`
    <h1 style="color: #333; text-align: center;">🔑 Reset Your Password</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      We received a request to reset the password for your Questurian account. To reset your password, please enter the verification code below:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <div style="background-color: #f8f9fa; border: 2px dashed #007bff; border-radius: 8px; padding: 20px; display: inline-block;">
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Your Password Reset Code</p>
        <p style="margin: 0; font-size: 36px; font-weight: bold; color: #007bff; letter-spacing: 8px; font-family: 'Courier New', monospace;">
          ${code}
        </p>
      </div>
    </div>
    ${createSectionBox(
      '🛡️ What happens next:',
      `<ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
        <li>Enter this code on the password reset page</li>
        <li>Create your new password</li>
        <li>Confirm your new password</li>
        <li>You'll be able to log in with your new password</li>
        <li>This code expires in 15 minutes</li>
      </ul>`,
      'neutral'
    )}
    ${createInfoBox('warning', '⚠️ <strong>Didn\'t request this?</strong> If you didn\'t request a password reset, you can safely ignore this email. Your password will remain unchanged.')}
    <p style="font-size: 14px; line-height: 1.5; color: #999; margin-top: 30px;">
      For security reasons, this verification code will only work once and expires in 15 minutes. Do not share this code with anyone.
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      If you have any questions about your account security, don't hesitate to reach out to our support team.
    </p>
    ${createFooter('Questurian Security Team')}
  `)

  return sendEmail(payload, {
    emailType: 'password reset verification email',
    to: email,
    subject: 'Reset Your Password - Questurian',
    html
  })
}
