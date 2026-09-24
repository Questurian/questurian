export interface BaseEmailData {
  email: string
  firstName?: string
  lastName?: string
}

export interface EmailResult {
  success: boolean
  error?: string
}

/** Sent to the OLD address once an email change has been verified. */
export interface EmailChangedNotificationData {
  oldEmail: string
  newEmail: string
  firstName?: string
  lastName?: string
}

export interface EmailVerificationLinkParams extends BaseEmailData {
  url: string
}

export type GoogleAccountLinkedEmailData = BaseEmailData

export interface MembershipConfirmationEmailData extends BaseEmailData {
  subscriptionType?: string
  membershipExpiresAt?: Date
  isRecurring?: boolean
}

export type PasswordChangedEmailData = BaseEmailData

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
