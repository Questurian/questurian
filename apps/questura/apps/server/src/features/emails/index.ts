// Every template here is sent, and each has a render test (lib/templates.test.ts).
// Templates nothing sent were deleted (launch fix plan, decision D4). Add one
// back only together with the code that sends it and its render test.

// Visitor account
export { sendPasswordResetLinkEmail } from './lib/password-reset-link'
export { sendVisitorEmailVerificationLinkEmail } from './lib/visitor-email-verification-link'

// Security notices, sent from visitor-auth/lib/security-notices.ts
export { sendPasswordChangedEmail } from './lib/password-changed'
export { sendEmailChangedNotificationEmail } from './lib/email-changed-notification'
export { sendGoogleAccountLinkedEmail } from './lib/google-account-linked'

// Membership
export { sendSubscriptionCancelledEmail } from './lib/subscription-cancelled'
export { sendSubscriptionReactivatedEmail } from './lib/subscription-reactivated'
export { sendMembershipConfirmationEmail } from './lib/membership-confirmation'

// Email delivery tracking (optional system — see EmailLogs collection docs)
export { EmailLogs } from './collections/EmailLogs'
export { recordEmailLog, isEmailTrackingEnabled } from './lib/email-log'

// Re-export types if needed
export type { Payload } from 'payload'
