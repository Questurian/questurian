import { mockPaymentResponse, mockSubscriptionResponse, mockStripeSession } from './data';

// Mock the api functions
export const mockGet = jest.fn();
export const mockPost = jest.fn();
export const mockPut = jest.fn();
export const mockDel = jest.fn();

// Setup default implementations
export const setupApiMocks = () => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
  mockDel.mockReset();

  // Default successful response for user/me
  mockGet.mockResolvedValue({
    id: 'user-1',
    email: 'test@example.com',
    subscriptionStatus: 'inactive',
  });
};

// Helper functions to setup specific mocks
export const mockPaymentSuccess = () => {
  mockPost.mockResolvedValueOnce(mockPaymentResponse.success);
};

export const mockPaymentError = () => {
  mockPost.mockRejectedValueOnce(new Error(mockPaymentResponse.error.message));
};

export const mockCancelSubscriptionSuccess = () => {
  mockPost.mockResolvedValueOnce(mockSubscriptionResponse.cancelSuccess);
};

export const mockCancelSubscriptionError = () => {
  mockPost.mockRejectedValueOnce(new Error(mockSubscriptionResponse.error.message));
};

export const mockRenewSubscriptionSuccess = () => {
  mockPost.mockResolvedValueOnce(mockSubscriptionResponse.renewSuccess);
};

export const mockRenewSubscriptionError = () => {
  mockPost.mockRejectedValueOnce(new Error(mockSubscriptionResponse.error.message));
};

export const mockStripePortalSession = () => {
  mockPost.mockResolvedValueOnce(mockStripeSession);
};

export const mockStripePortalError = () => {
  mockPost.mockRejectedValueOnce(new Error('Failed to create portal session'));
};
