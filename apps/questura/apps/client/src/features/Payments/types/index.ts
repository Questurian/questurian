/**
 * Centralized type definitions for Payments feature
 */

import type { JSX } from 'react';


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
  kind?: 'visitor';
  membership?: { active: boolean };
  subscriptionStatus?: string | null;
  membershipExpiration?: string | Date | null;
  cancelAtPeriodEnd?: boolean;
  email?: string;
  firstName?: string;
  lastName?: string;
}

// ============================================================================
// Component Props
// ============================================================================
/**
 * Props for MembershipGuard. Children render only when the user is not an
 * active member. `fallback` replaces the default "already a member" screen.
 */
export interface MembershipGuardProps {
  user?: UserWithMembership | null;
  children: JSX.Element | JSX.Element[] | null;
  fallback?: JSX.Element | null;
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
