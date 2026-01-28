import type Stripe from 'stripe';

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

// Local mock Stripe subscription function
const mockStripeSubscription = (overrides = {}) => ({
  id: 'sub_test123',
  object: 'subscription',
  customer: 'cus_test123',
  status: 'active',
  current_period_start: Math.floor(Date.now() / 1000),
  current_period_end: Math.floor(Date.now() / 1000) + 2592000, // 30 days
  items: {
    object: 'list',
    data: [
      {
        id: 'si_test123',
        price: {
          id: 'price_test123',
          product: 'prod_test123',
        },
      },
    ],
  },
  metadata: {},
  ...overrides,
});

// Local mock webhook event function
const mockStripeWebhookEvent = (type: string, data: Record<string, any> = {}) => ({
  id: `evt_test_${Date.now()}`,
  object: 'event',
  api_version: '2024-11-20.acacia',
  created: Math.floor(Date.now() / 1000),
  type,
  data: {
    object: data.object || mockStripeSubscription(),
    previous_attributes: data.previous_attributes || {},
    ...data,
  },
  livemode: false,
  pending_webhooks: 1,
  request: {
    id: null,
    idempotency_key: null,
  },
});

/**
 * Creates a mock Stripe webhook body with signature
 * In real tests, you would use Stripe's test webhook signing library
 */
export function createMockWebhookBody(
  type: string,
  data: Record<string, any> = {}
): { body: string; signature: string } {
  const event = mockStripeWebhookEvent(type, data);
  return {
    body: JSON.stringify(event),
    signature: 'test_signature_mock',
  };
}

/**
 * Creates a mock Stripe subscription with custom overrides
 */
export function createMockSubscription(status: Stripe.Subscription.Status = 'active', overrides = {}) {
  return mockStripeSubscription({
    status,
    ...overrides,
  });
}

/**
 * Creates a mock user with custom overrides
 */
export function createMockUserData(overrides = {}) {
  return mockUser(overrides);
}

/**
 * Mock webhook events for different subscription scenarios
 */
export const mockWebhookEvents = {
  checkoutSessionCompleted: (customerId = 'cus_test123', subscriptionId = 'sub_test123') =>
    mockStripeWebhookEvent('checkout.session.completed', {
      object: {
        id: 'cs_test123',
        object: 'checkout.session',
        customer: customerId,
        subscription: subscriptionId,
      },
    }),

  subscriptionCreated: (customerId = 'cus_test123', subscriptionId = 'sub_test123') =>
    mockStripeWebhookEvent('customer.subscription.created', {
      object: mockStripeSubscription({
        id: subscriptionId,
        customer: customerId,
        status: 'active',
      }),
    }),

  subscriptionUpdated: (
    subscriptionId = 'sub_test123',
    newStatus: Stripe.Subscription.Status = 'active',
    previousStatus = 'trialing'
  ) =>
    mockStripeWebhookEvent('customer.subscription.updated', {
      object: mockStripeSubscription({
        id: subscriptionId,
        status: newStatus,
      }),
      previous_attributes: {
        status: previousStatus,
      },
    }),

  subscriptionDeleted: (subscriptionId = 'sub_test123') =>
    mockStripeWebhookEvent('customer.subscription.deleted', {
      object: mockStripeSubscription({
        id: subscriptionId,
        status: 'canceled',
      }),
    }),

  invoicePaymentSucceeded: (subscriptionId = 'sub_test123', customerId = 'cus_test123') =>
    mockStripeWebhookEvent('invoice.payment_succeeded', {
      object: {
        id: 'in_test123',
        object: 'invoice',
        customer: customerId,
        subscription: subscriptionId,
        status: 'paid',
        paid: true,
      },
    }),

  invoicePaymentFailed: (subscriptionId = 'sub_test123', customerId = 'cus_test123') =>
    mockStripeWebhookEvent('invoice.payment_failed', {
      object: {
        id: 'in_test123',
        object: 'invoice',
        customer: customerId,
        subscription: subscriptionId,
        status: 'open',
        paid: false,
      },
    }),
};

/**
 * Helper to verify webhook signature
 * In real implementation, use Stripe's webhook signing library
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  // In test environment, we'll mock this
  // In production, use: stripe.webhooks.constructEvent(body, signature, secret)
  return true;
}

/**
 * Sleep utility for async tests
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

