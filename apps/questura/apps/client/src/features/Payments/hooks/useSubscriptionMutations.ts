/**
 * Subscription management mutation hooks
 * Handles subscription cancellation, renewal, and checkout flows
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

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
  renewSubscriptionRequest,
} from '../services/subscription-mutations.service';
import type {
  CancellationResult,
  CheckoutSessionResponse,
  CreateCheckoutSessionVariables,
  RenewalResult,
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
