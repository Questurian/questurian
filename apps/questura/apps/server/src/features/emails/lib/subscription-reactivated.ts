import type { Payload } from 'payload'
import { buildGreeting, sendEmail, wrapEmailContent, createFooter, createInfoBox, EMAIL_PARAGRAPH_STYLE } from './email-utils'
import type { EmailResult, SubscriptionReactivatedEmailData } from '../types'

export async function sendSubscriptionReactivatedEmail(
  payload: Payload,
  { email, firstName, lastName, subscriptionType, renewsAt }: SubscriptionReactivatedEmailData
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)
  const renewalText = renewsAt
    ? `Your subscription will automatically renew on ${renewsAt.toLocaleDateString()}.`
    : 'Your subscription will continue to renew automatically.'

  const statusDetails = subscriptionType ? `
    <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <p style="font-size: 16px; line-height: 1.5; color: #333; margin: 0;">
        <strong>Subscription:</strong> ${subscriptionType}
      </p>
      <p style="font-size: 16px; line-height: 1.5; color: #333; margin: 10px 0 0 0;">
        <strong>Next Renewal:</strong> ${renewsAt?.toLocaleDateString() || 'Active'}
      </p>
    </div>
  ` : `
    <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <p style="font-size: 16px; line-height: 1.5; color: #333; margin: 0;">
        <strong>Status:</strong> ${renewalText}
      </p>
    </div>
  `

  const html = wrapEmailContent(`
    <h1 style="color: #666; text-align: center;">🎉 Subscription Reactivated</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      Great news! Your Questurian subscription has been successfully reactivated.
    </p>
    ${statusDetails}
    ${createInfoBox('info', '<strong>🔄 Auto-Renewal Enabled</strong> Your subscription will automatically renew at the end of each billing period. You can cancel at any time from your account settings.')}
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      Thank you for continuing your journey with Questurian. We're excited to have you back!
    </p>
    ${createFooter()}
  `)

  return sendEmail(payload, {
    emailType: 'subscription reactivation email',
    to: email,
    subject: 'Subscription Reactivated - Questurian',
    html
  })
}
