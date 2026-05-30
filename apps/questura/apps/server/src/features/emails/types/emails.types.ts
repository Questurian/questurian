export interface BaseEmailData {
  email: string
  firstName?: string
  lastName?: string
}

export interface EmailResult {
  success: boolean
  error?: string
}

export interface EmailChangeVerificationData extends BaseEmailData {
  code: string
}

export interface EmailChangedNotificationData extends BaseEmailData {
  oldEmail: string
  newEmail: string
  wasGoogleUnlinked?: boolean
  wasStripeUpdated?: boolean
}

export interface EmailVerificationParams {
  email: string
  firstName: string
  lastName: string
  code: string
}

export interface EmailVerificationLinkParams extends BaseEmailData {
  url: string
}

export interface GoogleAccountLinkedParams {
  email: string
  firstName: string
  lastName: string
  googleEmail: string
}

export interface MembershipConfirmationEmailData extends BaseEmailData {
  subscriptionType?: string
  membershipExpiresAt?: Date
  isRecurring?: boolean
}

export type PasswordBackupAddedEmailData = BaseEmailData

export interface PasswordChangeConfirmationEmailData extends BaseEmailData {
  code: string
}

export type PasswordChangedSuccessEmailData = BaseEmailData

export type PasswordResetSuccessEmailData = BaseEmailData

export interface PasswordResetEmailData extends BaseEmailData {
  code: string
}

export interface PasswordResetLinkEmailData extends BaseEmailData {
  url: string
}

export interface SubscriptionCancelledEmailData extends BaseEmailData {
  subscriptionType?: string
  membershipExpiresAt?: Date
  wasImmediate?: boolean
}

export interface SubscriptionReactivatedEmailData extends BaseEmailData {
  subscriptionType?: string
  renewsAt?: Date
}

export interface WelcomeEmailParams {
  email: string
  firstName: string
  lastName: string
}
