/**
 * Centralized Field Visibility Configuration
 *
 * This module defines which fields are visible and editable for each role.
 * Instead of scattering `condition` logic throughout field definitions,
 * visibility rules are centralized here for easy customization.
 *
 * Usage in field definitions:
 * ```
 * admin: {
 *   condition: visibilityRules.subscriptionStatus(data),
 *   readOnly: !editabilityRules.subscriptionStatus(req)
 * }
 * ```
 */

import type { User } from '@/payload-types'

export type UserRole = 'admin' | 'editor' | 'user'

/**
 * Visibility rules control whether a field appears on screen
 * Returns true to show the field, false to hide it
 */
export const visibilityRules = {
  // BASIC INFO TAB - Always visible
  email: () => true,
  firstName: () => true,
  lastName: () => true,

  // ROLE & SIDEBAR FIELDS - Always visible
  role: () => true,

  // AUTHENTICATION TAB - Only shown for users
  authenticationTab: (data?: Record<string, any>) => {
    if (!data) return false
    return data.role === 'user' // Only show tab when viewing users
  },

  authProvider: (data?: Record<string, any>) => visibilityRules.authenticationTab(data),
  hasLocalPassword: (data?: Record<string, any>) => visibilityRules.authenticationTab(data),
  hasGoogleOAuth: (data?: Record<string, any>) => visibilityRules.authenticationTab(data),
  oauthId: (data?: Record<string, any>) => {
    if (!visibilityRules.authenticationTab(data)) return false
    return data?.hasGoogleOAuth === true
  },
  passwordSetAt: (data?: Record<string, any>) => {
    if (!visibilityRules.authenticationTab(data)) return false
    return data?.hasLocalPassword === true
  },
  googleLinkedAt: (data?: Record<string, any>) => {
    if (!visibilityRules.authenticationTab(data)) return false
    return data?.hasGoogleOAuth === true
  },
  tokenVersion: (data?: Record<string, any>) => visibilityRules.authenticationTab(data),

  // Password/Email management collapsibles - visible to admins managing users, or if code exists
  passwordChangeCollapsible: (data?: Record<string, any>) => {
    if (!data) return false
    // Show if admin managing a user, or if password change code exists
    return data.role === 'admin' || data.role === 'user' && !!data.passwordChangeCode
  },
  emailChangeCollapsible: (data?: Record<string, any>) => {
    if (!data) return false
    return data.role === 'admin' || data.role === 'user' && !!data.emailChangeCode
  },
  emailVerificationCollapsible: (data?: Record<string, any>) => {
    if (!data) return false
    return (
      (data.role === 'admin' || data.role === 'user') &&
      (!!data.emailVerificationCode || !data.emailVerified)
    )
  },
  passwordResetCollapsible: (data?: Record<string, any>) => {
    if (!data) return false
    return data.role === 'admin' || data.role === 'user' && !!data.passwordResetCode
  },

  // MEMBERSHIP TAB - Shown for users AND editors (but different fields for each)
  membershipTab: (data?: Record<string, any>) => {
    if (!data) return false
    // Show for regular users and editors
    return data.role === 'user' || data.role === 'editor'
  },

  // subscriptionStatus - visible for users AND editors (only membership field shown to editors)
  subscriptionStatus: (data?: Record<string, any>) => {
    if (!data) return false
    return data.role === 'user' || data.role === 'editor'
  },

  // Subscription Timing - only for users, NOT for editors
  subscriptionTimingCollapsible: (data?: Record<string, any>) => {
    if (!data) return false
    // Only show for regular users
    return data.role === 'user'
  },

  subscriptionRenewsAt: (data?: Record<string, any>) => {
    if (!data) return false
    // Only show for users
    if (data.role !== 'user') return false
    // Only show if subscription is active and not cancelled at period end
    return data?.subscriptionStatus === 'active' && !data?.cancelAtPeriodEnd
  },

  membershipExpiration: (data?: Record<string, any>) => {
    if (!data) return false
    // Only show for users
    if (data.role !== 'user') return false
    // Show for users when: cancelled, or has grace period, or field has value
    return (
      data?.cancelAtPeriodEnd ||
      data?.subscriptionStatus === 'cancelled' ||
      data?.subscriptionStatus === 'none' ||
      data?.membershipExpiration
    )
  },

  cancelAtPeriodEnd: (data?: Record<string, any>) => {
    if (!data) return false
    // Only show for users
    if (data.role !== 'user') return false
    // Only show if subscription is currently active
    return data?.subscriptionStatus === 'active'
  },

  // Stripe Integration - only for users with Stripe, NOT for editors
  stripeIntegrationCollapsible: (data?: Record<string, any>) => {
    if (!data) return false
    // Only show for users with Stripe integration
    return data.role === 'user' && !!data?.stripeCustomerId
  },

  stripeCustomerId: (data?: Record<string, any>) => visibilityRules.stripeIntegrationCollapsible(data),
  stripeSubscriptionId: (data?: Record<string, any>) => visibilityRules.stripeIntegrationCollapsible(data),

  // Affiliate Tracking - only for users with referral, NOT for editors
  affiliateTrackingCollapsible: (data?: Record<string, any>) => {
    if (!data) return false
    // Only show for users with affiliate referral ID
    return data.role === 'user' && !!data?.affiliateReferralId
  },

  affiliateReferralId: (data?: Record<string, any>) => visibilityRules.affiliateTrackingCollapsible(data),
  affiliateReferredAt: (data?: Record<string, any>) => visibilityRules.affiliateTrackingCollapsible(data),

  // ACTIVITY TAB - Visible to all roles
  activityTab: () => true,

  createdAt: () => true,
  updatedAt: () => true,

  // PUBLIC PROFILE TAB - Only for editors
  publicProfileTab: (data?: Record<string, any>) => {
    if (!data) return false
    return data.role === 'editor'
  },

  publicProfile: (data?: Record<string, any>) => visibilityRules.publicProfileTab(data),
  publicProfileAvatar: (data?: Record<string, any>) => visibilityRules.publicProfileTab(data),
  publicProfileIsPublic: (data?: Record<string, any>) => visibilityRules.publicProfileTab(data),
  publicProfileDisplayName: (data?: Record<string, any>) => visibilityRules.publicProfileTab(data),
  publicProfileBio: (data?: Record<string, any>) => visibilityRules.publicProfileTab(data),
  publicProfileExpertise: (data?: Record<string, any>) => visibilityRules.publicProfileTab(data),
  publicProfileSocialLinks: (data?: Record<string, any>) => visibilityRules.publicProfileTab(data),
} as const

/**
 * Editability rules control whether a field can be modified
 * Used alongside readOnly flags to lock fields for certain roles
 */
export const editabilityRules = {
  // Role field - only admins can change
  role: (userRole?: UserRole) => userRole === 'admin',

  // Emails & names - everyone can edit their own
  email: (userRole?: UserRole) => userRole !== undefined,
  firstName: (userRole?: UserRole) => userRole !== undefined,
  lastName: (userRole?: UserRole) => userRole !== undefined,

  // Auth fields - read-only for everyone (system-managed)
  authProvider: () => false,
  hasLocalPassword: () => false,
  hasGoogleOAuth: () => false,
  oauthId: () => false,
  passwordSetAt: () => false,
  googleLinkedAt: () => false,
  tokenVersion: () => false,

  // Membership fields - mostly read-only, webhooks manage these
  subscriptionStatus: () => false, // Webhooks only
  subscriptionRenewsAt: () => false,
  membershipExpiration: (userRole?: UserRole) => userRole === 'admin', // Admins can override
  cancelAtPeriodEnd: () => false,
  stripeCustomerId: () => false,
  stripeSubscriptionId: () => false,
  affiliateReferralId: () => false,
  affiliateReferredAt: () => false,

  // System timestamps - read-only
  createdAt: () => false,
  updatedAt: () => false,

  // Computed fields - read-only
  membershipStatusSummary: () => false,
  membershipStatusOverview: () => false,

  // Public profile - editors can edit, admins can edit others
  publicProfileAvatar: (userRole?: UserRole) => userRole !== undefined,
  publicProfileIsPublic: (userRole?: UserRole) => userRole !== undefined,
  publicProfileDisplayName: (userRole?: UserRole) => userRole !== undefined,
  publicProfileBio: (userRole?: UserRole) => userRole !== undefined,
  publicProfileExpertise: (userRole?: UserRole) => userRole !== undefined,
  publicProfileSocialLinks: (userRole?: UserRole) => userRole !== undefined,
} as const

/**
 * Helper function to get visibility and editability for a field and role
 * Returns { visible: boolean, editable: boolean, readOnly: boolean }
 */
export function getFieldAccess(
  fieldName: keyof typeof visibilityRules,
  data?: Record<string, any>,
  userRole?: UserRole
): { visible: boolean; editable: boolean; readOnly: boolean } {
  const visibilityFn = visibilityRules[fieldName] as (data?: any) => boolean
  const editabilityFn = editabilityRules[fieldName as keyof typeof editabilityRules] as (role?: UserRole) => boolean

  const visible = visibilityFn ? visibilityFn(data) : true
  const editable = visible && (editabilityFn ? editabilityFn(userRole) : false)

  return {
    visible,
    editable,
    readOnly: visible && !editable,
  }
}

/**
 * Summary: What each role sees
 *
 * ADMIN viewing own profile:
 * - Basic Info: ✅ editable
 * - Role: 👁️ read-only
 * - Auth Tab: ❌ hidden
 * - Membership Tab: ❌ hidden
 * - Activity: ✅ timestamps visible
 * - Public Profile: ❌ hidden
 *
 * ADMIN viewing another user:
 * - Basic Info: ✅ editable
 * - Role: ✅ editable
 * - Auth Tab: 👁️ read-only (only for users)
 * - Membership Tab: 👁️ read-only (only for users)
 * - Activity: ✅ visible
 * - Public Profile: ✅ editable (only for editors)
 *
 * EDITOR viewing own profile:
 * - Basic Info: ✅ editable
 * - Role: 👁️ read-only
 * - Auth Tab: ❌ hidden
 * - Membership Tab: ❌ hidden
 * - Activity: 👁️ read-only (timestamps + membership status)
 * - Public Profile: ✅ fully editable
 *
 * USER:
 * - No access to /admin at all (redirected to frontend)
 */
