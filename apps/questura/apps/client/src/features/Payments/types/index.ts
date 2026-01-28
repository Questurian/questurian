/**
 * Centralized type definitions for Payments feature
 */


// ============================================================================
// Membership Types
// ============================================================================

/**
 * Membership status information
 */
export interface MembershipStatus {
  isPaidMember: boolean;
  membershipExpiration?: Date | null;
  isActive: boolean;
}

/**
 * Generic user object with membership fields
 */
export interface UserWithMembership {
  isPaidMember?: boolean;
  membershipExpiration?: string | Date | null;
  email?: string;
  firstName?: string;
  lastName?: string;
}

// ============================================================================
// Payment & Stripe Types
// ============================================================================

/**
 * Payment form component props
 */
export interface PaymentFormProps {
  amount: number;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

/**
 * Stripe payment intent details
 */
export interface PaymentIntent {
  clientSecret: string;
  amount: number;
  currency: string;
}

/**
 * Result from payment processing
 */
export interface PaymentResult {
  success: boolean;
  error?: string;
  paymentIntent?: PaymentIntent;
}

// ============================================================================
// Subscription Types
// ============================================================================

/**
 * Subscription details from Stripe
 */
export interface SubscriptionDetails {
  status: string;
  currentPeriodEnd: string;
}

/**
 * Result from subscription cancellation
 */
export interface CancellationResult {
  success: boolean;
  message: string;
  subscriptionDetails?: SubscriptionDetails;
}

/**
 * Result from subscription renewal
 */
export interface RenewalResult {
  success: boolean;
  message: string;
}

// ============================================================================
// Component Props
// ============================================================================

/**
 * Props for MembershipGuard component
 */
export interface MembershipGuardProps {
  user?: UserWithMembership | null;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Props for CancelSubscriptionModal component
 */
export interface CancelSubscriptionModalProps {
  show: boolean;
  onConfirm: () => void;
  onClose: () => void;
  isLoading?: boolean;
  membershipExpiration?: string | Date | null;
}

// PurchaseAuthForm has been replaced with EnhancedAuthForm from Auth feature
// UserAccountStatus type moved to Auth/hooks/types.ts
