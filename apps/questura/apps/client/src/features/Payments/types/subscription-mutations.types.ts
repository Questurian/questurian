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

export interface PortalSessionResponse {
  url?: string;
}

export interface CheckoutSessionResponse {
  url: string;
}

export interface CreateCheckoutSessionVariables {
  referralId?: string | null;
  /** Which Stripe price to buy; the server defaults to monthly. */
  plan?: 'monthly' | 'yearly';
}

export interface UserMutationContext {
  previousUser: User | null | undefined;
}
