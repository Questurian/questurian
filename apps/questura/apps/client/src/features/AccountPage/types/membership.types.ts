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
  | 'payment_issue';

export interface MembershipState {
  type: MembershipType;
  label: string;
  badgeClass: string;
  description: string;
  showCancelButton: boolean;
  showUpgradeButton: boolean;
  showReactivateButton: boolean;
}

export interface BillingInfo {
  nextBilling: string;
  billingPeriod: string;
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
