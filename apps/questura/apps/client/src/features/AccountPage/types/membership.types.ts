import type { User } from '@/lib/user/types';

export interface MembershipSectionProps {
  user: User | null;
}

export type MembershipType =
  | 'free'
  | 'active'
  | 'expiring'
  | 'expired'
  | 'cancelled'
  | 'inactive'
  /** Renewal charge failed; Stripe is retrying and access is still covered. */
  | 'payment_issue'
  /**
   * The subscription is still live, but entitlement has been withdrawn from it
   * -- a refunded or disputed charge, or a profile the webhooks left stuck.
   * Access is gone while the subscription keeps billing, so the card has to say
   * so rather than read the status enum's `active`.
   */
  | 'access_paused'
  /** Stripe paused the subscription. No access (D5), and no second checkout. */
  | 'paused';

export interface MembershipState {
  type: MembershipType;
  label: string;
  badgeClass: string;
  description: string;
  showCancelButton: boolean;
  showUpgradeButton: boolean;
  showReactivateButton: boolean;
  /** Offer the Stripe portal ("Update Payment Method"). */
  showUpdatePayment: boolean;
}

export interface BillingInfo {
  nextBilling: string;
  /** Null when the server does not know the interval yet. */
  billingPeriod: string | null;
}

export interface MembershipAlertsProps {
  isRenewing: boolean;
  successMessage: string | null;
  error: string | null;
  onDismissSuccess: () => void;
}

export interface MembershipStatusCardProps {
  isRenewing: boolean;
  membershipState: MembershipState;
}

export interface MembershipBillingInfoProps {
  billingInfo: BillingInfo;
}

export interface MembershipActionLinksProps {
  canUpdatePayment: boolean;
  canCancel: boolean;
  isCancelling: boolean;
  onUpdatePayment: () => void;
  onOpenCancelModal: () => void;
}

export interface MembershipPrimaryActionsProps {
  showUpgradeButton: boolean;
  showReactivateButton: boolean;
  isRenewing: boolean;
  onReactivate: () => void;
}
