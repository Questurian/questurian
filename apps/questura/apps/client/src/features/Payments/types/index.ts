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
  kind?: 'visitor' | 'staff';
  role?: string;
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
 * Props for MembershipGuard component
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
