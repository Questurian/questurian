import { isServiceUnavailableError, post } from '@/lib/api';

import {
  SUBSCRIPTION_DEFAULT_MESSAGES,
  SUBSCRIPTION_SERVICE_UNAVAILABLE_MESSAGE,
} from '../constants/subscription.constants';
import type {
  CancellationResult,
  CheckoutSessionResponse,
  PortalSessionResponse,
  RenewalResult,
} from '../types/subscription-mutations.types';

function mapSubscriptionError(error: unknown): unknown {
  if (isServiceUnavailableError(error)) {
    return new Error(SUBSCRIPTION_SERVICE_UNAVAILABLE_MESSAGE);
  }
  return error;
}

export async function cancelSubscriptionRequest(): Promise<CancellationResult> {
  try {
    const data = await post<{ message: string; subscriptionDetails?: unknown }>(
      '/api/payments/cancel-subscription'
    );

    return {
      success: true,
      message: data.message || SUBSCRIPTION_DEFAULT_MESSAGES.cancel,
      subscriptionDetails: data.subscriptionDetails,
    };
  } catch (error) {
    throw mapSubscriptionError(error);
  }
}

export async function renewSubscriptionRequest(): Promise<RenewalResult> {
  try {
    const data = await post<{ message: string }>('/api/payments/reactivate-subscription');

    return {
      success: true,
      message: data.message || SUBSCRIPTION_DEFAULT_MESSAGES.renew,
    };
  } catch (error) {
    throw mapSubscriptionError(error);
  }
}

export async function createPortalSessionRequest(): Promise<string | null> {
  try {
    const response = await post<PortalSessionResponse>('/api/payments/create-portal-session', {});
    return response.url || null;
  } catch (error) {
    throw mapSubscriptionError(error);
  }
}

export async function createCheckoutSessionRequest(
  referralId: string | null,
  plan: 'monthly' | 'yearly' = 'monthly',
  /**
   * Where to send the buyer after the success page confirms entitlement. The
   * server validates this; it is never trusted as sent.
   */
  returnTo?: string | null
): Promise<CheckoutSessionResponse> {
  try {
    return await post<CheckoutSessionResponse>('/api/payments/create-checkout-session', {
      referralId: referralId || null,
      plan,
      returnTo: returnTo || null,
    });
  } catch (error) {
    throw mapSubscriptionError(error);
  }
}
