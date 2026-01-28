/**
 * Query key factory for type-safe cache management
 * Centralized place to define all query keys used in the app
 */

export const queryKeys = {
  // User/Auth queries
  user: ['user'] as const,
  userMe: () => [...queryKeys.user, 'me'] as const,

  // Account queries
  account: ['account'] as const,
  accountCheck: (email: string) => [...queryKeys.account, 'check', email] as const,

  // Subscription queries
  subscription: ['subscription'] as const,
  subscriptionDetails: () => [...queryKeys.subscription, 'details'] as const,

  // Payment queries
  payment: ['payment'] as const,
  paymentMethods: () => [...queryKeys.payment, 'methods'] as const,
} as const;

/**
 * Helper to invalidate all user-related queries
 * Use this after mutations that affect user data
 */
export const userQueryKeys = [queryKeys.user, queryKeys.account, queryKeys.subscription] as const;
