/**
 * Legacy payment types file
 * @deprecated Use types/index.ts instead
 * This file is kept for backwards compatibility
 */

// Re-export everything from the centralized types file
export type {
  MembershipStatus,
  UserWithMembership,
  PaymentFormProps,
  PaymentIntent,
  PaymentResult,
  SubscriptionDetails,
  CancellationResult,
  RenewalResult,
  MembershipGuardProps,
  CancelSubscriptionModalProps
} from './index';

// These types have been moved to Auth feature
// import type { UserAccountStatus } from '@/features/Auth/hooks/types';
// PurchaseAuthForm has been replaced with EnhancedAuthForm