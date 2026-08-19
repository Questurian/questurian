import type { User } from '@/lib/user/types';

import type { BillingInfo, MembershipState, MembershipType } from '../types/membership.types';

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

/**
 * `entitled` is the server's access decision (`membership.active`), passed in by
 * the caller. A subscription can read `active` while entitlement has been taken
 * away from it, and a "next billing" line under a membership that grants nothing
 * is the same false claim as the badge above it.
 */
export function getBillingInfo(user: User | null, entitled: boolean): BillingInfo | null {
  if (!user || user.subscriptionStatus !== 'active') return null;
  if (!entitled) return null;
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

/** States whose copy tells the visitor they have paid access right now. */
const STATES_CLAIMING_ACCESS: ReadonlySet<MembershipType> = new Set<MembershipType>([
  'active',
  'expiring',
  'payment_issue',
]);

function claimsCurrentAccess(state: MembershipState, user: User): boolean {
  if (STATES_CLAIMING_ACCESS.has(state.type)) return true;

  // `cancelled` covers two branches above. The one that claims access is the
  // "remains active until <date>" shape, and it is the only one reached with an
  // unexpired `membershipExpiration`.
  return state.type === 'cancelled' && Boolean(user.membershipExpiration);
}

/**
 * What the card says when the subscription is alive but grants nothing.
 *
 * No Upgrade button: the subscription still exists and still bills, so selling a
 * second one is the worst available answer. The portal is the next step instead
 * -- it is where the visitor can stop the billing they are getting nothing for.
 */
function accessPausedState(): MembershipState {
  return {
    type: 'access_paused',
    label: 'Access Paused',
    badgeClass: 'bg-[#fff3e0] text-[#e65100] border border-[#ffe0b2]',
    description:
      'Your premium access is paused while a payment on this subscription is being resolved. ' +
      'The subscription itself has not been cancelled, and access returns on its own if the ' +
      'payment settles. Use "Update Payment Method" below to manage or cancel it.',
    showCancelButton: false,
    showUpgradeButton: false,
    showReactivateButton: false,
  };
}

/**
 * The membership as the account page should present it.
 *
 * `entitled` is `membership.active` from `/api/me` -- the server's single access
 * decision, and the same read `MembershipGuard` makes. It is passed in rather
 * than read here so this module stays free of the dev-override store and can be
 * exercised directly; `useMembershipSection` supplies it.
 *
 * The status enum alone produced a dead end in both directions.
 *
 * Claiming too little: a subscription Stripe has already deleted reports
 * `canceled` while the period it was paid for is still running, so the card said
 * "cancelled -- Upgrade" to a visitor who was still entitled, and `/purchase`
 * then turned them away as an existing member.
 *
 * Claiming too much: a refund or a dispute withdraws entitlement without
 * touching the subscription -- `charge.dispute.created` deliberately leaves it
 * alive, because a dispute can be won -- so `subscriptionStatus` stays `active`
 * and the card said "Premium Member. Your premium membership is active." while
 * every paid article returned 403. Profiles the webhooks left stuck, the class
 * `audit-access-revocations.ts` exists to find, have the same shape.
 *
 * Entitlement decides both, because it is the thing that actually gates the
 * articles: never sell to someone who already has access, never promise access
 * to someone who has none.
 */
export function getMembershipState(user: User | null, entitled: boolean): MembershipState {
  const state = membershipStateFromStatus(user);

  if (!user) return state;

  if (!entitled) {
    return claimsCurrentAccess(state, user) ? accessPausedState() : state;
  }

  if (!state.showUpgradeButton) return state;

  return {
    ...state,
    showUpgradeButton: false,
    // Without a next step this is just a card with nothing to do on it. The
    // visitor still has access; what they need is when it ends and what then.
    description: `${state.description} You can rejoin once it ends.`,
  };
}
