/**
 * Mock Stripe test credit card numbers and responses
 * These follow Stripe's test card number conventions
 */

export const mockStripeTestCards = {
  // Visa - success
  visaSuccess: '4242424242424242',
  // Visa - requires authentication
  visaAuth: '4000002500003155',
  // Visa - declined
  visaDeclined: '4000000000000002',
  // Mastercard - success
  mastercardSuccess: '5555555555554444',
  // Amex - success
  amexSuccess: '378282246310005',
  // Discover - success
  discoverSuccess: '6011111111111117',
};

export const mockStripeElements = {
  create: jest.fn((type: string) => ({
    mount: jest.fn(),
    unmount: jest.fn(),
    focus: jest.fn(),
    blur: jest.fn(),
    clear: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  })),
};

export const mockStripeConfirmPayment = jest.fn();
export const mockStripeConfirmCardPayment = jest.fn();

export const mockStripePaymentMethod = {
  id: 'pm_1234567890',
  type: 'card',
  card: {
    brand: 'visa',
    last4: '4242',
    exp_month: 12,
    exp_year: 2025,
  },
};

export const mockStripePaymentIntent = {
  id: 'pi_1234567890',
  object: 'payment_intent',
  status: 'succeeded',
  amount: 1999,
  currency: 'usd',
  customer: 'cus_1234567890',
};

/**
 * Setup successful Stripe confirmation response
 */
export const setupStripeSuccess = () => {
  mockStripeConfirmPayment.mockResolvedValue({
    paymentIntent: {
      ...mockStripePaymentIntent,
      status: 'succeeded',
    },
  });

  mockStripeConfirmCardPayment.mockResolvedValue({
    paymentIntent: {
      ...mockStripePaymentIntent,
      status: 'succeeded',
    },
  });
};

/**
 * Setup Stripe error response
 */
export const setupStripeError = (errorMessage = 'Your card was declined') => {
  mockStripeConfirmPayment.mockResolvedValue({
    error: {
      type: 'card_error',
      code: 'card_declined',
      message: errorMessage,
      payment_method: mockStripePaymentMethod,
    },
  });

  mockStripeConfirmCardPayment.mockResolvedValue({
    error: {
      type: 'card_error',
      code: 'card_declined',
      message: errorMessage,
    },
  });
};

/**
 * Setup Stripe authentication required response
 */
export const setupStripeAuthRequired = () => {
  mockStripeConfirmPayment.mockResolvedValue({
    paymentIntent: {
      ...mockStripePaymentIntent,
      status: 'requires_action',
      client_secret: 'pi_1234567890_secret_test',
    },
  });
};
