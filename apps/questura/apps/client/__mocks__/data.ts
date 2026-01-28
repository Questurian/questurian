import { User } from '@/lib/user/types';

export const mockUsers = {
  // Inactive user - no active subscription
  inactiveMember: {
    id: 'user-1',
    email: 'inactive@example.com',
    emailVerified: true,
    subscriptionStatus: 'inactive' as const,
    cancelAtPeriodEnd: false,
    membershipExpiration: null,
    subscriptionRenewsAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    googleId: null,
  } as User,

  // Active subscription
  activeMember: {
    id: 'user-2',
    email: 'active@example.com',
    emailVerified: true,
    subscriptionStatus: 'active' as const,
    cancelAtPeriodEnd: false,
    membershipExpiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    subscriptionRenewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    stripeCustomerId: 'cus_123456',
    stripeSubscriptionId: 'sub_123456',
    googleId: null,
  } as User,

  // Expiring subscription (cancelled but still active)
  expiringMember: {
    id: 'user-3',
    email: 'expiring@example.com',
    emailVerified: true,
    subscriptionStatus: 'active' as const,
    cancelAtPeriodEnd: true,
    membershipExpiration: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    subscriptionRenewsAt: null,
    stripeCustomerId: 'cus_789012',
    stripeSubscriptionId: 'sub_789012',
    googleId: null,
  } as User,

  // Expired subscription
  expiredMember: {
    id: 'user-4',
    email: 'expired@example.com',
    emailVerified: true,
    subscriptionStatus: 'cancelled' as const,
    cancelAtPeriodEnd: false,
    membershipExpiration: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    subscriptionRenewsAt: null,
    stripeCustomerId: 'cus_345678',
    stripeSubscriptionId: 'sub_345678',
    googleId: null,
  } as User,

  // Cancelled subscription (not yet expired)
  cancelledMember: {
    id: 'user-5',
    email: 'cancelled@example.com',
    emailVerified: true,
    subscriptionStatus: 'cancelled' as const,
    cancelAtPeriodEnd: false,
    membershipExpiration: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    subscriptionRenewsAt: null,
    stripeCustomerId: 'cus_901234',
    stripeSubscriptionId: 'sub_901234',
    googleId: null,
  } as User,
};

export const mockPaymentResponse = {
  success: {
    status: 'success',
    message: 'Payment processed successfully',
    subscriptionId: 'sub_123456',
  },
  error: {
    status: 'error',
    message: 'Card declined',
    code: 'card_declined',
  },
  networkError: {
    status: 'error',
    message: 'Network request failed',
    code: 'network_error',
  },
};

export const mockSubscriptionResponse = {
  cancelSuccess: {
    status: 'success',
    message: 'Subscription cancelled successfully',
  },
  renewSuccess: {
    status: 'success',
    message: 'Subscription reactivated successfully',
  },
  error: {
    status: 'error',
    message: 'Unable to process request',
  },
};

export const mockStripeSession = {
  id: 'pcs_123456',
  object: 'billing_portal.session',
  billing_portal_url: 'https://billing.stripe.com/session/example',
};
