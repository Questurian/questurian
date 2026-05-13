// Local mock user function
const mockUser = (overrides = {}) => ({
  id: 'user_test123',
  email: 'test@example.com',
  hasLocalPassword: true,
  hasGoogleOAuth: false,
  authProvider: 'local' as const,
  stripeCustomerId: 'cus_test123',
  stripeSubscriptionId: 'sub_test123',
  subscriptionStatus: 'active' as const,
  cancelAtPeriodEnd: false,
  membershipExpiration: null,
  subscriptionRenewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  role: 'user',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

/**
 * Creates a mock user with custom overrides
 */
export function createMockUserData(overrides = {}) {
  return mockUser(overrides);
}
