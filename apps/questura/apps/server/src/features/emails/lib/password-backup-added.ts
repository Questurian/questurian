import type { Payload } from 'payload'
import { buildGreeting, sendEmail, wrapEmailContent, createFooter, createSectionBox, createInfoBox, EMAIL_PARAGRAPH_STYLE, type BaseEmailData, type EmailResult } from './email-utils'

interface PasswordBackupAddedEmailData extends BaseEmailData {}

export async function sendPasswordBackupAddedEmail(
  payload: Payload,
  { email, firstName, lastName }: PasswordBackupAddedEmailData
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)

  const html = wrapEmailContent(`
    <h1 style="color: #28a745; text-align: center;">🔐 Account Security Enhanced!</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      Great news! You've successfully added a password backup to your Questurian account. Your account security has been significantly enhanced.
    </p>
    ${createSectionBox(
      '✅ What This Means for You:',
      `<ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Flexible Login Options:</strong> You can now sign in with either your Google account or your password</li>
        <li><strong>Enhanced Security:</strong> Multiple authentication methods provide better account protection</li>
        <li><strong>Account Recovery:</strong> Password backup ensures you always have access to your account</li>
      </ul>`,
      'success'
    )}
    ${createSectionBox(
      '🛡️ Security Best Practices:',
      `<p style="margin: 8px 0;">• Use a unique, strong password that you don't use elsewhere</p>
      <p style="margin: 8px 0;">• Keep your password secure and never share it with others</p>
      <p style="margin: 8px 0;">• Consider using a password manager for added security</p>
      <p style="margin: 8px 0;">• You can continue using Google Sign-In as your primary login method</p>`,
      'neutral'
    )}
    ${createInfoBox('info', '💡 <strong>Pro Tip:</strong> Your account now supports dual authentication! You can switch between Google Sign-In and password login whenever it\'s convenient.')}
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      Thank you for taking steps to secure your Questurian account. If you have any questions about account security, don't hesitate to reach out to our support team.
    </p>
    ${createFooter('Questurian Security Team')}
  `)

  return sendEmail(payload, {
    emailType: 'password backup added email',
    to: email,
    subject: 'Password Backup Added - Enhanced Account Security',
    html
  })
}