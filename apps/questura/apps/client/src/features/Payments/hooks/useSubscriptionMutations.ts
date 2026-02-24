/**
 * Subscription management mutation hooks
 * Handles subscription cancellation, renewal, and details
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/react-query';

import { SUBSCRIPTION_CACHE } from '../constants/subscription.constants';
import { resolveCheckoutReferralId } from '../services/checkout-referral.service';
import {
  invalidateUserAfterCheckout,
  applyCancelAtPeriodEndOptimisticUpdate,
  rollbackUserMutation,
} from '../services/subscription-cache.service';
import { redirectToUrl } from '../services/payment-redirect.service';
import {
  cancelSubscriptionRequest,
  createCheckoutSessionRequest,
  createPortalSessionRequest,
  fetchSubscriptionDetails,
  renewSubscriptionRequest,
} from '../services/subscription-mutations.service';
import type {
  CancellationResult,
  CheckoutSessionResponse,
  CreateCheckoutSessionVariables,
  RenewalResult,
  SubscriptionDetails,
  UserMutationContext,
} from '../types/subscription-mutations.types';

export function useCancelSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation<CancellationResult, unknown, void, UserMutationContext>({
    mutationFn: cancelSubscriptionRequest,
    onMutate: async () => applyCancelAtPeriodEndOptimisticUpdate(queryClient, true),
    onError: (_error, _variables, context) => {
      rollbackUserMutation(queryClient, context);
    },
  });
}

export function useRenewSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation<RenewalResult, unknown, void, UserMutationContext>({
    mutationFn: renewSubscriptionRequest,
    onMutate: async () => applyCancelAtPeriodEndOptimisticUpdate(queryClient, false),
    onError: (_error, _variables, context) => {
      rollbackUserMutation(queryClient, context);
    },
  });
}

export function useSubscriptionDetailsQuery() {
  return useQuery<SubscriptionDetails | null>({
    queryKey: queryKeys.subscriptionDetails(),
    queryFn: fetchSubscriptionDetails,
    staleTime: SUBSCRIPTION_CACHE.staleTime,
    gcTime: SUBSCRIPTION_CACHE.gcTime,
  });
}

export function useCreatePortalSessionMutation() {
  return useMutation<string | null>({
    mutationFn: createPortalSessionRequest,
    onSuccess: (url) => {
      redirectToUrl(url);
    },
  });
}

export function useCreateCheckoutSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation<CheckoutSessionResponse, unknown, CreateCheckoutSessionVariables | undefined>({
    mutationFn: async (variables) => {
      const referralId = resolveCheckoutReferralId(variables);
      return createCheckoutSessionRequest(referralId);
    },
    onSuccess: (data) => {
      invalidateUserAfterCheckout(queryClient);
      redirectToUrl(data.url);
    },
  });
}
