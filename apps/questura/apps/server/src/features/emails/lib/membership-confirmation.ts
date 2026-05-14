import type { Payload } from 'payload'
import { buildGreeting, sendEmail, wrapEmailContent, createFooter, createSectionBox, createInfoBox, EMAIL_PARAGRAPH_STYLE } from './email-utils'
import type { EmailResult, MembershipConfirmationEmailData } from '../types'

export async function sendMembershipConfirmationEmail(
  payload: Payload,
  { email, firstName, lastName, subscriptionType, membershipExpiresAt, isRecurring = true }: MembershipConfirmationEmailData
): Promise<EmailResult> {
  const greeting = buildGreeting(firstName, lastName)
  const expirationDate = membershipExpiresAt?.toLocaleDateString() || 'the end of your billing cycle'

  const html = wrapEmailContent(`
    <h1 style="color: #28a745; text-align: center;">✅ Welcome to Questurian Premium</h1>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      ${greeting},
    </p>
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      Thank you for choosing Questurian Premium! Your subscription is now active and you have access to all premium features.
    </p>
    ${createSectionBox(
      '🎉 Your Subscription Details',
      `<ul style="margin: 0; padding-left: 20px; line-height: 1.8;">
        ${subscriptionType ? `<li><strong>Plan:</strong> ${subscriptionType}</li>` : ''}
        <li><strong>Access Valid Until:</strong> ${expirationDate}</li>
        <li><strong>Subscription Type:</strong> ${isRecurring ? 'Auto-renewing' : 'One-time'}</li>
        <li><strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">Active</span></li>
      </ul>`,
      'success'
    )}
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      You now have full access to all Questurian Premium features, including:
    </p>
    <ul style="margin: 20px 0; padding-left: 20px; line-height: 1.8; font-size: 16px; color: #666;">
      <li>Advanced analytics and insights</li>
      <li>Priority customer support</li>
      <li>Exclusive content and tools</li>
      <li>Early access to new features</li>
    </ul>
    ${createInfoBox('info', '📧 <strong>Billing Information:</strong> Your subscription renewal will be on ' + expirationDate + (isRecurring ? ' (auto-renewing)' : '') + '. You can manage your subscription anytime in your account settings.')}
    <p style="${EMAIL_PARAGRAPH_STYLE}">
      If you have any questions or need assistance, our support team is here to help. Don't hesitate to reach out!
    </p>
    ${createFooter('Questurian Team')}
  `)

  return sendEmail(payload, {
    emailType: 'membership confirmation email',
    to: email,
    subject: 'Welcome to Questurian Premium - Your Subscription is Active',
    html
  })
}
