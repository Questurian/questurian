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
      badgeClass: 'bg-[#e8e6e1] text-[#6b6a68]',
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
          badgeClass: 'bg-[#fff3e0] text-[#e65100] border border-[#ffe0b2]',
          description: `Your premium membership will expire on ${expirationDate?.toLocaleDateString() || 'the end of your billing period'}. Your subscription has been cancelled but remains active until then.`,
          showCancelButton: false,
          showUpgradeButton: false,
          showReactivateButton: true,
        };
      } else if (renewalDate) {
        return {
          type: 'active',
          label: 'Premium Member',
          badgeClass: 'bg-[#1A1A1A] text-white',
          description: `Your premium membership renews on ${renewalDate.toLocaleDateString()}.`,
          showCancelButton: true,
          showUpgradeButton: false,
          showReactivateButton: false,
        };
      } else {
        return {
          type: 'active',
          label: 'Premium Member',
          badgeClass: 'bg-[#1A1A1A] text-white',
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
          badgeClass: 'bg-[#fce4ec] text-[#c62828] border border-[#f8bbd0]',
          description: `Your premium membership expired on ${expirationDate?.toLocaleDateString()}. Upgrade to restore premium features.`,
          showCancelButton: false,
          showUpgradeButton: true,
          showReactivateButton: false,
        };
      } else if (expirationDate) {
        return {
          type: 'cancelled',
          label: 'Membership Cancelled',
          badgeClass: 'bg-[#fff3e0] text-[#e65100] border border-[#ffe0b2]',
          description: `Your membership was cancelled but remains active until ${expirationDate.toLocaleDateString()}.`,
          showCancelButton: false,
          showUpgradeButton: false,
          showReactivateButton: true,
        };
      } else {
        return {
          type: 'cancelled',
          label: 'Membership Cancelled',
          badgeClass: 'bg-[#e8e6e1] text-[#6b6a68]',
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
        badgeClass: 'bg-[#e8e6e1] text-[#6b6a68]',
        description: 'Your membership is currently inactive. Upgrade to access premium features.',
        showCancelButton: false,
        showUpgradeButton: true,
        showReactivateButton: false,
      };

    default:
      return {
        type: 'free',
        label: 'Free Member',
        badgeClass: 'bg-[#e8e6e1] text-[#6b6a68]',
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
    <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-6 480:p-8">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-[1.1rem] text-[#1A1A1A] mb-1.5 768:text-[1.2rem]">
            Membership
          </h3>

          {isRenewing && (
            <div className="mb-4 p-3 bg-[#e3f2fd] border border-[#bbdefb] rounded-sm">
              <p className="text-[0.84rem] text-[#1565c0]">Reactivating your subscription...</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-[#e8f5e9] border border-[#c8e6c9] rounded-sm relative">
              <button
                onClick={() => setSuccessMessage(null)}
                className="absolute top-2.5 right-2.5 text-[#2e7d32] hover:text-[#1b5e20]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <p className="text-[0.84rem] text-[#2e7d32] pr-6">{successMessage}</p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-[#fce4ec] border border-[#f8bbd0] rounded-sm">
              <p className="text-[0.84rem] text-[#c62828]">{error}</p>
            </div>
          )}

          {!isRenewing && (
            <>
              <div className="mb-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-sm text-[0.78rem] font-medium ${membershipState.badgeClass}`}>
                  {membershipState.label}
                </span>
              </div>

              <p className="text-[0.84rem] text-[#6b6a68] leading-[1.65] mb-4">
                {membershipState.description}
              </p>
            </>
          )}

          {billingInfo && !isRenewing && (
            <>
              <div className="bg-white border border-[#e5e2dc] rounded-sm p-4 mb-4">
                <h4 className="text-[0.84rem] font-medium text-[#1A1A1A] mb-2">
                  Billing Information
                </h4>
                <div className="space-y-1.5 text-[0.82rem] text-[#6b6a68]">
                  <div className="flex justify-between">
                    <span>Billing Period:</span>
                    <span className="font-medium text-[#1A1A1A]">{billingInfo.billingPeriod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Next Payment:</span>
                    <span className="font-medium text-[#1A1A1A]">{billingInfo.nextBilling}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mb-4">
                {(user?.subscriptionStatus === 'active' || membershipState.showCancelButton) && (
                  <button
                    onClick={handleUpdatePaymentMethod}
                    className="
                      text-[0.82rem] text-[#6b6a68] hover:text-[#1A1A1A]
                      underline underline-offset-2 cursor-pointer transition-colors
                    "
                  >
                    Update Payment Method
                  </button>
                )}

                {membershipState.showCancelButton && (
                  <button
                    onClick={() => setShowCancellationModal(true)}
                    disabled={isCancelling}
                    className="
                      text-[0.82rem] text-[#6b6a68] hover:text-[#1A1A1A]
                      underline underline-offset-2 cursor-pointer transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed
                    "
                  >
                    {isCancelling ? 'Cancelling...' : 'Cancel Subscription'}
                  </button>
                )}
              </div>
            </>
          )}

          {process.env.NODE_ENV === 'development' && (user?.stripeCustomerId || user?.stripeSubscriptionId) && (
            <details className="mb-4">
              <summary className="text-[0.72rem] text-[#c4c2be] cursor-pointer hover:text-[#9a9894]">
                Debug Info
              </summary>
              <div className="mt-2 text-[0.72rem] text-[#c4c2be] space-y-1 pl-4">
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
              className="
                inline-block bg-[#2C2C2C] hover:bg-[#1A1A1A]
                text-white py-2 px-5 rounded
                text-[0.82rem] font-medium transition-colors
                whitespace-nowrap
              "
            >
              Upgrade
            </Link>
          )}

          {membershipState.showReactivateButton && (
            <button
              onClick={handleRenewSubscription}
              disabled={isRenewing}
              className="
                inline-block bg-[#2C2C2C] hover:bg-[#1A1A1A]
                text-white py-2 px-5 rounded
                text-[0.82rem] font-medium transition-colors
                whitespace-nowrap disabled:opacity-50
                disabled:cursor-not-allowed cursor-pointer
              "
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
