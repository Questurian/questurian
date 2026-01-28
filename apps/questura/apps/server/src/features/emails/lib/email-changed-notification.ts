import type { Payload } from 'payload'
import { buildGreeting, sendEmail, wrapEmailContent, createFooter, createSectionBox, createInfoBox, EMAIL_PARAGRAPH_STYLE, type BaseEmailData, type EmailResult } from './email-utils'

interface EmailChangedNotificationData extends BaseEmailData {
  oldEmail: string
  newEmail: string
  wasGoogleUnlinked?: boolean
  wasStripeUpdated?: boolean
}

export async function sendEmailChangedNotificationEmail(
  payload: Payload,
  { oldEmail, newEmail, firstName, lastName, wasGoogleUnlinked = false, wasStripeUpdated = false }: EmailChangedNotificationData
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)
  const timestamp = new Date().toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short'
  })

  const html = wrapEmailContent(`
    <h1 style="color: #28a745; text-align: center;">📧 Your Email Address Was Changed</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      This is a security notification that your email address for your Questurian account has been successfully changed.
    </p>
    ${createSectionBox(
      '📋 Change Details:',
      `<p style="margin: 8px 0;"><strong>Previous Email:</strong> ${oldEmail}</p>
      <p style="margin: 8px 0;"><strong>New Email:</strong> ${newEmail}</p>
      <p style="margin: 8px 0;"><strong>Changed On:</strong> ${timestamp}</p>
      ${wasGoogleUnlinked ? '<p style="margin: 8px 0;"><strong>Google OAuth:</strong> Automatically unlinked</p>' : ''}
      ${wasStripeUpdated ? '<p style="margin: 8px 0;"><strong>Stripe Email:</strong> Updated to new address</p>' : ''}`,
      'neutral'
    )}
    ${wasGoogleUnlinked ? createSectionBox(
      '🔗 Google Account Unlinked',
      `<p style="margin: 8px 0;">Because you changed your email address, your Google account was automatically unlinked from your Questurian account for security reasons.</p>
      <p style="margin: 8px 0;">You can now only log in with your password. If you'd like to re-link a Google account with your new email address, you can do so from your account settings.</p>`,
      'info'
    ) : ''}
    ${createSectionBox(
      '🔐 What Changed:',
      `<ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
        <li>Your account email has been updated to ${newEmail}</li>
        <li>All active sessions were logged out for security</li>
        <li>Future logins must use your new email address</li>
        ${wasGoogleUnlinked ? '<li>Google OAuth was unlinked (password login only)</li>' : ''}
        <li>Email notifications will now be sent to your new address</li>
        ${wasStripeUpdated ? '<li>Stripe receipts and invoices will be sent to your new address</li>' : ''}
      </ul>`,
      'success'
    )}
    ${createInfoBox('warning', '⚠️ <strong>Didn\'t make this change?</strong> If you didn\'t authorize this email change, please contact our support team immediately to secure your account. Someone may have unauthorized access.')}
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      This notification was sent to your previous email address as a security measure. You will receive all future communications at your new email address.
    </p>
    ${createFooter('Questurian Security Team')}
  `)

  return sendEmail(payload, {
    emailType: 'email changed notification email',
    to: oldEmail, // Send to OLD email as security notification
    subject: 'Your Email Address Was Changed - Questurian',
    html
  })
}
