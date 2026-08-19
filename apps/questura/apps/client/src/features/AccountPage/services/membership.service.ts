import type { User } from '@/lib/user/types';

import { isActiveMember } from '../../Payments/lib/membership';
import type { BillingInfo, MembershipState } from '../types/membership.types';

function formatDate(dateString: string | null): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const formattedDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (diffDays > 0 && diffDays <= 30) {
    return `${formattedDate} (in ${diffDays} ${diffDays === 1 ? 'day' : 'days'})`;
  }

  return formattedDate;
}

export function getBillingInfo(user: User | null): BillingInfo | null {
  if (!user || user.subscriptionStatus !== 'active') return null;
  if (user.cancelAtPeriodEnd) return null;

  if (user.subscriptionRenewsAt) {
    return {
      nextBilling: formatDate(user.subscriptionRenewsAt),
      billingPeriod: 'Monthly',
    };
  }

  return null;
}

/**
 * The status enum's reading of the membership, before entitlement is consulted.
 *
 * `subscriptionStatus` and `membershipExpiration` describe the *subscription*.
 * Whether the visitor may actually read paid content is a separate, server-side
 * decision (`membership.active`, derived from `paidThroughAt`). Where the two
 * disagree, entitlement wins -- see `getMembershipState`.
 */
function membershipStateFromStatus(user: User | null): MembershipState {
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
  const expirationDate = user.membershipExpiration ? new Date(user.membershipExpiration) : null;
  const renewalDate = user.subscriptionRenewsAt ? new Date(user.subscriptionRenewsAt) : null;
  const isExpired = expirationDate && expirationDate < now;

  switch (user.subscriptionStatus) {
    case 'active':
      if (user.cancelAtPeriodEnd) {
        return {
          type: 'expiring',
          label: 'Premium - Expiring',
          badgeClass: 'bg-[#fff3e0] text-[#e65100] border border-[#ffe0b2]',
          description: `Your premium membership will expire on ${expirationDate?.toLocaleDateString() || 'the end of your billing period'}. Your subscription has been cancelled but remains active until then.`,
          showCancelButton: false,
          showUpgradeButton: false,
          showReactivateButton: true,
        };
      }

      if (renewalDate) {
        return {
          type: 'active',
          label: 'Premium Member',
          badgeClass: 'bg-[#1A1A1A] text-white',
          description: `Your premium membership renews on ${renewalDate.toLocaleDateString()}.`,
          showCancelButton: true,
          showUpgradeButton: false,
          showReactivateButton: false,
        };
      }

      return {
        type: 'active',
        label: 'Premium Member',
        badgeClass: 'bg-[#1A1A1A] text-white',
        description: 'Your premium membership is active.',
        showCancelButton: true,
        showUpgradeButton: false,
        showReactivateButton: false,
      };

    // A failed renewal is a payment problem, not the end of a membership.
    // This case was missing entirely, so a visitor being retried by Stripe fell
    // through to "Free Member" with an Upgrade button -- and could buy a second
    // subscription while still holding the first.
    case 'past_due': {
      const graceEnds = user.dunningGraceUntil ? new Date(user.dunningGraceUntil) : null;
      const stillCovered = Boolean(graceEnds && graceEnds > now);

      return {
        type: stillCovered ? 'payment_issue' : 'expired',
        label: stillCovered ? 'Premium - Payment Issue' : 'Membership Expired',
        badgeClass: 'bg-[#fff3e0] text-[#e65100] border border-[#ffe0b2]',
        description: stillCovered
          ? `We could not take your last payment. Your access continues until ${graceEnds!.toLocaleDateString()} while we retry — update your payment method to keep it.`
          : 'We could not take your last payment and your premium access has ended. Update your payment method to restore it.',
        showCancelButton: stillCovered,
        showUpgradeButton: !stillCovered,
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
      }

      if (expirationDate) {
        return {
          type: 'cancelled',
          label: 'Membership Cancelled',
          badgeClass: 'bg-[#fff3e0] text-[#e65100] border border-[#ffe0b2]',
          description: `Your membership was cancelled but remains active until ${expirationDate.toLocaleDateString()}.`,
          showCancelButton: false,
          // Not reactivatable: this status means Stripe has already deleted the
          // subscription, so the endpoint can only refuse. Resuming before the
          // end date is offered by the `expiring` state above, while the
          // subscription still exists.
          showUpgradeButton: true,
          showReactivateButton: false,
        };
      }

      return {
        type: 'cancelled',
        label: 'Membership Cancelled',
        badgeClass: 'bg-[#e8e6e1] text-[#6b6a68]',
        description: 'Your membership has been cancelled. Upgrade to restore premium features.',
        showCancelButton: false,
        showUpgradeButton: true,
        showReactivateButton: false,
      };

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

/**
 * The membership as the account page should present it.
 *
 * The status enum alone produced a dead end: a subscription Stripe has already
 * deleted reports `canceled` while the period it was paid for is still running,
 * so the card said "cancelled -- Upgrade" to a visitor who was still entitled.
 * `/purchase` gates on the same entitlement (`MembershipGuard` -> `isActiveMember`
 * -> `membership.active`) and turned them away as an existing member. A button
 * that cannot work, in front of someone who might reasonably answer it by paying
 * a second time through another route.
 *
 * Entitlement is the tie-breaker because it is the thing that actually gates
 * access, and it is derived once on the server. Offering to sell a membership to
 * someone who already has one is wrong regardless of which status produced it,
 * so this is applied to every branch rather than to the one that was reported.
 */
export function getMembershipState(user: User | null): MembershipState {
  const state = membershipStateFromStatus(user);

  // `membership.active` is the server's entitlement decision; `isActiveMember`
  // is the same read the purchase guard makes, dev override included, so the two
  // screens cannot disagree about who is already a member.
  if (!user || !state.showUpgradeButton || !isActiveMember(user)) return state;

  return {
    ...state,
    showUpgradeButton: false,
    // Without a next step this is just a card with nothing to do on it. The
    // visitor still has access; what they need is when it ends and what then.
    description: `${state.description} You can rejoin once it ends.`,
  };
}
