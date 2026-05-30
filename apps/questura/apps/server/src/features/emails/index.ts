// Export all email template functions
export { sendEmailVerificationEmail } from './lib/email-verification'
export { sendWelcomeEmail } from './lib/welcome-email'
export { sendGoogleAccountLinkedEmail } from './lib/google-account-linked'
export { sendEmailChangeVerificationEmail } from './lib/email-change-verification'
export { sendEmailChangedNotificationEmail } from './lib/email-changed-notification'
export { sendPasswordChangeConfirmationEmail } from './lib/password-change-confirmation'
export { sendPasswordChangedSuccessEmail } from './lib/password-changed-success'
export { sendPasswordBackupAddedEmail } from './lib/password-backup-added'
export { sendPasswordResetEmail } from './lib/password-reset-verification'
export { sendPasswordResetLinkEmail } from './lib/password-reset-link'
export { sendVisitorEmailVerificationLinkEmail } from './lib/visitor-email-verification-link'
export { sendPasswordResetSuccessEmail } from './lib/password-reset-success'
export { sendSubscriptionCancelledEmail } from './lib/subscription-cancelled'
export { sendSubscriptionReactivatedEmail } from './lib/subscription-reactivated'
export { sendMembershipConfirmationEmail } from './lib/membership-confirmation'

// Re-export types if needed
export type { Payload } from 'payload'
