import { useState } from 'react';

import { isServiceUnavailableError } from '@/lib/api';
import type { User } from '@/lib/user/types';
import { useDevStore } from '@/lib/stores/devStore';

import {
  useCancelSubscriptionMutation,
  useCreatePortalSessionMutation,
  useRenewSubscriptionMutation,
} from '../../Payments/hooks/useSubscriptionMutations';
import { useMembership } from '../../Payments/hooks/useMembership';
import { getBillingInfo, getMembershipLinks, getMembershipState } from '../services/membership.service';

function getMutationErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (isServiceUnavailableError(error)) {
    return 'Service is unavailable. Please try again later.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  return 'Something went wrong. Please try again.';
}

export function useMembershipSection(user: User | null) {
  const { isActive } = useMembership(user);
  const membershipOverride = useDevStore((s) => s.membershipOverride);

  const effectiveUser = (() => {
    if (process.env.NODE_ENV !== 'development' || !membershipOverride || !user) return user;
    const fakeRenewal = new Date();
    fakeRenewal.setDate(fakeRenewal.getDate() + 30);
    return {
      ...user,
      subscriptionStatus: 'active' as const,
      cancelAtPeriodEnd: false,
      subscriptionRenewsAt: fakeRenewal.toISOString(),
    };
  })();

  // One entitlement read for the whole card. `isActive` is `membership.active`
  // from the server (dev override included), which is what actually gates paid
  // articles -- so the card cannot claim a membership the paywall denies.
  const membershipState = getMembershipState(effectiveUser, isActive);
  const billingInfo = getBillingInfo(effectiveUser, isActive);
  // Dunning, paused and access-paused cards have no billing summary, and they
  // are the ones that need the portal most.
  const links = getMembershipLinks(membershipState, billingInfo, isActive);

  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const cancelMutation = useCancelSubscriptionMutation();
  const renewMutation = useRenewSubscriptionMutation();
  const portalSessionMutation = useCreatePortalSessionMutation();

  const error =
    getMutationErrorMessage(cancelMutation.error) ||
    getMutationErrorMessage(renewMutation.error) ||
    getMutationErrorMessage(portalSessionMutation.error);

  const handleCancelSubscription = () => {
    cancelMutation.mutate(undefined, {
      onSuccess: (result) => {
        setSuccessMessage(result.message);
        setShowCancellationModal(false);
      },
    });
  };

  const handleRenewSubscription = () => {
    setSuccessMessage(null);
    renewMutation.mutate(undefined, {
      onSuccess: (result) => {
        setSuccessMessage(result.message);
      },
    });
  };

  return {
    membershipState,
    billingInfo,
    isActive,
    error,
    isCancelling: cancelMutation.isPending,
    isRenewing: renewMutation.isPending,
    showCancellationModal,
    successMessage,
    canUpdatePayment: links.canUpdatePayment,
    showActionLinks: links.showActionLinks,
    clearSuccess: () => setSuccessMessage(null),
    openCancelModal: () => setShowCancellationModal(true),
    handleCancelSubscription,
    handleRenewSubscription,
    handleUpdatePaymentMethod: () => portalSessionMutation.mutate(),
    handleCloseModal: () => setShowCancellationModal(false),
  };
}
