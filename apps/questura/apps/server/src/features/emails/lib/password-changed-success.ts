import type { Payload } from 'payload'
import { buildGreeting, sendEmail, wrapEmailContent, createFooter, createSectionBox, createInfoBox, EMAIL_PARAGRAPH_STYLE, type BaseEmailData, type EmailResult } from './email-utils'

type PasswordChangedSuccessEmailData = BaseEmailData

export async function sendPasswordChangedSuccessEmail(
  payload: Payload,
  { email, firstName, lastName }: PasswordChangedSuccessEmailData
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)

  const html = wrapEmailContent(`
    <h1 style="color: #28a745; text-align: center;">✅ Password Changed Successfully!</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      This is a confirmation that your password for your Questurian account has been successfully changed.
    </p>
    ${createSectionBox(
      '🔐 What Changed:',
      `<ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
        <li>Your account password has been updated</li>
        <li>Any existing sessions will remain active</li>
        <li>Use your new password for future logins</li>
      </ul>`,
      'success'
    )}
    ${createInfoBox('warning', '⚠️ <strong>Didn\'t make this change?</strong> If you didn\'t change your password, please contact our support team immediately to secure your account.')}
    ${createSectionBox(
      '🛡️ Security Reminders:',
      `<p style="margin: 8px 0;">• Keep your password secure and never share it with anyone</p>
      <p style="margin: 8px 0;">• Use a unique password that you don't use on other websites</p>
      <p style="margin: 8px 0;">• Consider using a password manager for better security</p>
      <p style="margin: 8px 0;">• Change your password regularly to maintain account security</p>`,
      'neutral'
    )}
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      If you have any questions about your account security, don't hesitate to reach out to our support team.
    </p>
    ${createFooter('Questurian Security Team')}
  `)

  return sendEmail(payload, {
    emailType: 'password changed success email',
    to: email,
    subject: 'Password Changed Successfully - Questurian',
    html
  })
}
