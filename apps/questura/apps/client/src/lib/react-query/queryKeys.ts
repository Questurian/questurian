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

} as const;
