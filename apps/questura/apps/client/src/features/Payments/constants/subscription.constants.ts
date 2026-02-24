export const SUBSCRIPTION_SERVICE_UNAVAILABLE_MESSAGE = 'Service is unavailable. Please try again later.';

export const SUBSCRIPTION_DEFAULT_MESSAGES = {
  cancel: 'Subscription cancelled successfully',
  renew: 'Subscription renewed successfully',
} as const;

export const SUBSCRIPTION_CACHE = {
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
} as const;
