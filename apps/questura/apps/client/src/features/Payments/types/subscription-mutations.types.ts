import type { User } from '@/lib/user/types';

export interface CancellationResult {
  success: boolean;
  message: string;
  subscriptionDetails?: unknown;
}

export interface RenewalResult {
  success: boolean;
  message: string;
}

export interface SubscriptionDetails {
  status: string;
  currentPeriodEnd: string;
  [key: string]: unknown;
}

export interface SubscriptionDetailsApiResponse {
  subscriptionDetails: SubscriptionDetails;
}

export interface PortalSessionResponse {
  url?: string;
}

export interface CheckoutSessionResponse {
  url: string;
}

export interface CreateCheckoutSessionVariables {
  referralId?: string | null;
}

export interface UserMutationContext {
  previousUser: User | null | undefined;
}
