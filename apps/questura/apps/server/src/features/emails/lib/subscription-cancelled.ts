import type { Payload } from 'payload'
import { buildGreeting, sendEmail, wrapEmailContent, createFooter, createInfoBox, EMAIL_PARAGRAPH_STYLE } from './email-utils'
import type { EmailResult, SubscriptionCancelledEmailData } from '../types'

export async function sendSubscriptionCancelledEmail(
  payload: Payload,
  { email, firstName, lastName, subscriptionType, membershipExpiresAt, wasImmediate }: SubscriptionCancelledEmailData
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)
  const accessText = wasImmediate
    ? 'Your access has been immediately revoked.'
    : `Your access will continue until ${membershipExpiresAt?.toLocaleDateString() || 'the end of your billing period'}.`

  const statusDetails = subscriptionType ? `
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <p style="font-size: 16px; line-height: 1.5; color: #333; margin: 0;">
        <strong>Cancelled Subscription:</strong> ${subscriptionType}
      </p>
      <p style="font-size: 16px; line-height: 1.5; color: #333; margin: 10px 0 0 0;">
        <strong>Status:</strong> ${accessText}
      </p>
    </div>
  ` : `
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <p style="font-size: 16px; line-height: 1.5; color: #333; margin: 0;">
        <strong>Status:</strong> ${accessText}
      </p>
    </div>
  `

  const html = wrapEmailContent(`
    <h1 style="color: #666; text-align: center;">📋 Subscription Cancelled</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      We've received your request to cancel your Questurian subscription and have processed it successfully.
    </p>
    ${statusDetails}
    ${createInfoBox('warning', '<strong>💡 Change Your Mind?</strong> You can reactivate your subscription at any time by visiting your account settings. We\'d love to have you back!')}
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      Thank you for being a part of the Questurian community. If you have any feedback about your experience, we'd love to hear from you.
    </p>
    ${createFooter()}
  `)

  return sendEmail(payload, {
    emailType: 'subscription cancellation email',
    to: email,
    subject: 'Subscription Cancelled - Questurian',
    html
  })
}