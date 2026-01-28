import Link from "next/link";
import { useState } from "react";

import { User } from '@/lib/user/types';
import { isServiceUnavailableError } from '@/lib/api';
import { useCancelSubscriptionMutation, useRenewSubscriptionMutation, useCreatePortalSessionMutation } from "../../../Payments/hooks/useSubscriptionMutations";
import { CancelSubscriptionModal } from "../../../Payments/components/CancelSubscriptionModal";

interface MembershipSectionProps {
  user: User | null;
}

type MembershipState = {
  type: 'free' | 'active' | 'expiring' | 'expired' | 'cancelled' | 'inactive';
  label: string;
  badgeClass: string;
  description: string;
  showCancelButton: boolean;
  showUpgradeButton: boolean;
  showReactivateButton: boolean;
};

function formatDate(dateString: string | null): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const formattedDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  if (diffDays > 0 && diffDays <= 30) {
    return `${formattedDate} (in ${diffDays} ${diffDays === 1 ? 'day' : 'days'})`;
  }

  return formattedDate;
}

function getBillingInfo(user: User | null): { nextBilling: string; billingPeriod: string } | null {
  if (!user || user.subscriptionStatus !== 'active') return null;

  // Don't show billing info if subscription is set to cancel at period end
  if (user.cancelAtPeriodEnd) return null;

  const renewalDate = user.subscriptionRenewsAt;

  // Only show billing info if there's a renewal date (meaning it will actually renew)
  if (renewalDate) {
    return {
      nextBilling: formatDate(renewalDate),
      billingPeriod: 'Monthly'
    };
  }

  return null;
}

function getMembershipState(user: User | null): MembershipState {
  if (!user) {
    return {
      type: 'free',
      label: 'Free Member',
      badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      description: 'Upgrade to premium for additional features and benefits.',
      showCancelButton: false,
      showUpgradeButton: true,
      showReactivateButton: false,
    };
  }

  const now = new Date();
  const hasExpiration = user.membershipExpiration;
  const expirationDate = hasExpiration ? new Date(hasExpiration) : null;
  const renewalDate = user.subscriptionRenewsAt ? new Date(user.subscriptionRenewsAt) : null;
  const isExpired = expirationDate && expirationDate < now;
  const willCancelAtPeriodEnd = user.cancelAtPeriodEnd;

  switch (user.subscriptionStatus) {
    case 'active':
      if (willCancelAtPeriodEnd) {
        return {
          type: 'expiring',
          label: 'Premium - Expiring',
          badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
          description: `Your premium membership will expire on ${expirationDate?.toLocaleDateString() || 'the end of your billing period'}. Your subscription has been cancelled but remains active until then.`,
          showCancelButton: false,
          showUpgradeButton: false,
          showReactivateButton: true,
        };
      } else if (renewalDate) {
        return {
          type: 'active',
          label: 'Premium Member',
          badgeClass: 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white dark:from-yellow-500 dark:to-amber-600',
          description: `Your premium membership renews on ${renewalDate.toLocaleDateString()}.`,
          showCancelButton: true,
          showUpgradeButton: false,
          showReactivateButton: false,
        };
      } else {
        return {
          type: 'active',
          label: 'Premium Member',
          badgeClass: 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white dark:from-yellow-500 dark:to-amber-600',
          description: 'Your premium membership is active.',
          showCancelButton: true,
          showUpgradeButton: false,
          showReactivateButton: false,
        };
      }

    case 'canceled':
    case 'cancelled':
      if (isExpired) {
        return {
          type: 'expired',
          label: 'Membership Expired',
          badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
          description: `Your premium membership expired on ${expirationDate?.toLocaleDateString()}. Upgrade to restore premium features.`,
          showCancelButton: false,
          showUpgradeButton: true,
          showReactivateButton: false,
        };
      } else if (expirationDate) {
        return {
          type: 'cancelled',
          label: 'Membership Cancelled',
          badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
          description: `Your membership was cancelled but remains active until ${expirationDate.toLocaleDateString()}.`,
          showCancelButton: false,
          showUpgradeButton: false,
          showReactivateButton: true,
        };
      } else {
        return {
          type: 'cancelled',
          label: 'Membership Cancelled',
          badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
          description: 'Your membership has been cancelled. Upgrade to restore premium features.',
          showCancelButton: false,
          showUpgradeButton: true,
          showReactivateButton: false,
        };
      }

    case 'inactive':
      return {
        type: 'inactive',
        label: 'Inactive Member',
        badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
        description: 'Your membership is currently inactive. Upgrade to access premium features.',
        showCancelButton: false,
        showUpgradeButton: true,
        showReactivateButton: false,
      };

    default:
      return {
        type: 'free',
        label: 'Free Member',
        badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
        description: 'Upgrade to premium for additional features and benefits.',
        showCancelButton: false,
        showUpgradeButton: true,
        showReactivateButton: false,
      };
  }
}

export function MembershipSection({ user }: MembershipSectionProps) {
  const membershipState = getMembershipState(user);
  const billingInfo = getBillingInfo(user);

  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const cancelMutation = useCancelSubscriptionMutation();
  const renewMutation = useRenewSubscriptionMutation();
  const portalSessionMutation = useCreatePortalSessionMutation();

  const isCancelling = cancelMutation.isPending;
  const isRenewing = renewMutation.isPending;
  const error = (() => {
    if (cancelMutation.error) {
      return isServiceUnavailableError(cancelMutation.error)
        ? 'Service is unavailable. Please try again later.'
        : cancelMutation.error?.message;
    }
    if (renewMutation.error) {
      return isServiceUnavailableError(renewMutation.error)
        ? 'Service is unavailable. Please try again later.'
        : renewMutation.error?.message;
    }
    if (portalSessionMutation.error) {
      return isServiceUnavailableError(portalSessionMutation.error)
        ? 'Service is unavailable. Please try again later.'
        : portalSessionMutation.error?.message;
    }
    return null;
  })();

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

  const handleUpdatePaymentMethod = () => {
    portalSessionMutation.mutate();
  };

  const handleCloseModal = () => {
    setShowCancellationModal(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Membership
          </h3>

          {isRenewing && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
              <p className="text-sm text-blue-800 dark:text-blue-200">Reactivating your subscription...</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md relative">
              <button
                onClick={() => setSuccessMessage(null)}
                className="absolute top-2 right-2 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <p className="text-sm text-green-800 dark:text-green-200 pr-6">{successMessage}</p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {!isRenewing && (
            <>
              <div className="mb-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium ${membershipState.badgeClass}`}>
                  {membershipState.label}
                </span>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {membershipState.description}
              </p>
            </>
          )}

          {billingInfo && !isRenewing && (
            <>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Billing Information
                </h4>
                <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>Billing Period:</span>
                    <span className="font-medium">{billingInfo.billingPeriod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Next Payment:</span>
                    <span className="font-medium">{billingInfo.nextBilling}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mb-4">
                {(user?.subscriptionStatus === 'active' || membershipState.showCancelButton) && (
                  <button
                    onClick={handleUpdatePaymentMethod}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline cursor-pointer"
                  >
                    Update Payment Method
                  </button>
                )}

                {membershipState.showCancelButton && (
                  <button
                    onClick={() => setShowCancellationModal(true)}
                    disabled={isCancelling}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isCancelling ? 'Cancelling...' : 'Cancel Subscription'}
                  </button>
                )}
              </div>
            </>
          )}

          {process.env.NODE_ENV === 'development' && (user?.stripeCustomerId || user?.stripeSubscriptionId) && (
            <details className="mb-4">
              <summary className="text-xs text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
                Debug Info
              </summary>
              <div className="mt-2 text-xs text-gray-400 dark:text-gray-500 space-y-1 pl-4">
                {user.stripeCustomerId && (
                  <div>Customer ID: {user.stripeCustomerId}</div>
                )}
                {user.stripeSubscriptionId && (
                  <div>Subscription ID: {user.stripeSubscriptionId}</div>
                )}
              </div>
            </details>
          )}
        </div>
        <div className="flex flex-col gap-2 ml-4">
          {membershipState.showUpgradeButton && (
            <Link
              href="/purchase/monthly"
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline cursor-pointer"
            >
              Upgrade
            </Link>
          )}

          {membershipState.showReactivateButton && (
            <button
              onClick={handleRenewSubscription}
              disabled={isRenewing}
              className="text-sm text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isRenewing ? 'Reactivating...' : 'Reactivate'}
            </button>
          )}
        </div>
      </div>

      <CancelSubscriptionModal
        show={showCancellationModal}
        onConfirm={handleCancelSubscription}
        onClose={handleCloseModal}
        isLoading={isCancelling}
        membershipExpiration={user?.membershipExpiration}
      />
    </div>
  );
}