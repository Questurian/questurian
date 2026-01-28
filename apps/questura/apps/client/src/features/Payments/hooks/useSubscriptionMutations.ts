/**
 * Subscription management mutation hooks
 * Handles subscription cancellation, renewal, and details
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query';
import { post, get, isServiceUnavailableError } from '@/lib/api';
import type { User } from "@/lib/user/types";

/**
 * Cancel subscription mutation
 */
interface CancellationResult {
  success: boolean;
  message: string;
  subscriptionDetails?: unknown;
}

export function useCancelSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<CancellationResult> => {
      try {
        const data = await post<{ message: string; subscriptionDetails?: unknown }>(
          '/api/payments/cancel-subscription'
        );

        return {
          success: true,
          message: data.message || 'Subscription cancelled successfully',
          subscriptionDetails: data.subscriptionDetails,
        };
      } catch (error) {
        // Check if it's a service unavailability error
        if (isServiceUnavailableError(error)) {
          throw new Error('Service is unavailable. Please try again later.');
        }

        // Re-throw other errors
        throw error;
      }
    },
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.userMe() });

      // Snapshot the previous value
      const previousUser = queryClient.getQueryData<User | null>(queryKeys.userMe());

      // Optimistically update the user data
      if (previousUser) {
        queryClient.setQueryData<User | null>(queryKeys.userMe(), (old) => {
          if (!old) return old;
          return {
            ...old,
            cancelAtPeriodEnd: true,
          };
        });
      }

      // Return context with the snapshot
      return { previousUser };
    },
    onError: (err, variables, context) => {
      // Rollback to previous user data on error
      if (context?.previousUser) {
        queryClient.setQueryData(queryKeys.userMe(), context.previousUser);
      }
    },
  });
}

/**
 * Renew/reactivate subscription mutation
 */
interface RenewalResult {
  success: boolean;
  message: string;
}

export function useRenewSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<RenewalResult> => {
      try {
        const data = await post<{ message: string }>('/api/payments/reactivate-subscription');

        return {
          success: true,
          message: data.message || 'Subscription renewed successfully',
        };
      } catch (error) {
        // Check if it's a service unavailability error
        if (isServiceUnavailableError(error)) {
          throw new Error('Service is unavailable. Please try again later.');
        }

        // Re-throw other errors
        throw error;
      }
    },
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.userMe() });

      // Snapshot the previous value
      const previousUser = queryClient.getQueryData<User | null>(queryKeys.userMe());

      // Optimistically update the user data
      if (previousUser) {
        queryClient.setQueryData<User | null>(queryKeys.userMe(), (old) => {
          if (!old) return old;
          return {
            ...old,
            cancelAtPeriodEnd: false,
          };
        });
      }

      // Return context with the snapshot
      return { previousUser };
    },
    onError: (err, variables, context) => {
      // Rollback to previous user data on error
      if (context?.previousUser) {
        queryClient.setQueryData(queryKeys.userMe(), context.previousUser);
      }
    },
  });
}

/**
 * Get subscription details query
 * Fetches detailed subscription information from Stripe
 */
interface SubscriptionDetails {
  status: string;
  currentPeriodEnd: string;
  [key: string]: unknown;
}

export function useSubscriptionDetailsQuery() {
  return useQuery({
    queryKey: queryKeys.subscriptionDetails(),
    queryFn: async (): Promise<SubscriptionDetails | null> => {
      const data = await get<{ subscriptionDetails: SubscriptionDetails }>(
        '/api/payments/subscription-details'
      );
      return data.subscriptionDetails || null;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - subscription details don't change frequently
    gcTime: 10 * 60 * 1000,   // 10 minutes - keep in cache for longer
  });
}

/**
 * Create portal session for payment method updates
 */
interface PortalSessionResponse {
  url?: string;
}

export function useCreatePortalSessionMutation() {
  return useMutation({
    mutationFn: async (): Promise<string | null> => {
      try {
        const response = await post<PortalSessionResponse>('/api/payments/create-portal-session', {});
        return response.url || null;
      } catch (error) {
        // Check if it's a service unavailability error
        if (isServiceUnavailableError(error)) {
          throw new Error('Service is unavailable. Please try again later.');
        }

        // Re-throw other errors
        throw error;
      }
    },
    onSuccess: (url) => {
      // Redirect to Stripe portal if URL is returned
      if (url) {
        window.location.href = url;
      }
    },
  });
}

/**
 * Create checkout session for new subscriptions
 */
interface CheckoutSessionResponse {
  url: string;
}

interface CreateCheckoutSessionVariables {
  referralId?: string | null;
}

export function useCreateCheckoutSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables?: CreateCheckoutSessionVariables): Promise<CheckoutSessionResponse> => {
      try {
        let referralId: string | null = null;

        // Capture referral ID from Endorsely script if feature enabled
        if (process.env.NEXT_PUBLIC_ENDORSELY_ENABLED === 'true') {
          referralId = variables?.referralId || (typeof window !== 'undefined' ? (window as unknown as Record<string, string>).endorsely_referral : null);

          // Log affiliate conversion for debugging
          if (referralId) {
            console.log('[Affiliate] User referred by:', referralId);
          }
        }

        return post<CheckoutSessionResponse>('/api/payments/create-checkout-session', {
          referralId: referralId || null,
        });
      } catch (error) {
        // Check if it's a service unavailability error
        if (isServiceUnavailableError(error)) {
          throw new Error('Service is unavailable. Please try again later.');
        }

        // Re-throw other errors
        throw error;
      }
    },
    onSuccess: (data) => {
      // Invalidate user query since subscription will be created
      queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });

      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });
}
