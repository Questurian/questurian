import type { Payload } from 'payload'
import { buildGreeting, sendEmail, wrapEmailContent, createFooter, createSectionBox, createInfoBox, EMAIL_PARAGRAPH_STYLE } from './email-utils'
import type { EmailChangeVerificationData, EmailResult } from '../types'

export async function sendEmailChangeVerificationEmail(
  payload: Payload,
  { email, firstName, lastName, code }: EmailChangeVerificationData
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)

  const html = wrapEmailContent(`
    <h1 style="color: #333; text-align: center;">📧 Verify Your New Email Address</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      You recently requested to change your email address for your Questurian account. To complete this change, please enter the verification code below:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <div style="background-color: #f8f9fa; border: 2px dashed #007bff; border-radius: 8px; padding: 20px; display: inline-block;">
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Your Verification Code</p>
        <p style="margin: 0; font-size: 36px; font-weight: bold; color: #007bff; letter-spacing: 8px; font-family: 'Courier New', monospace;">
          ${code}
        </p>
      </div>
    </div>
    ${createSectionBox(
      '🛡️ What happens next:',
      `<ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
        <li>Enter this code in the verification form</li>
        <li>Your email address will be updated immediately</li>
        <li>If you have Google OAuth linked, it will be automatically unlinked</li>
        <li>You'll be logged out of all devices for security</li>
        <li>This code expires in 15 minutes</li>
      </ul>`,
      'neutral'
    )}
    ${createInfoBox('warning', '⚠️ <strong>Didn\'t request this change?</strong> If you didn\'t request an email change, you can safely ignore this email. Your email address will remain unchanged.')}
    <p style="font-size: 14px; line-height: 1.5; color: #999; margin-top: 30px;">
      For security reasons, this verification code will only work once and expires in 15 minutes.
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      If you have any questions about account security, don't hesitate to reach out to our support team.
    </p>
    ${createFooter('Questurian Security Team')}
  `)

  return sendEmail(payload, {
    emailType: 'email change verification email',
    to: email,
    subject: 'Verify Your New Email Address - Questurian',
    html
  })
}
