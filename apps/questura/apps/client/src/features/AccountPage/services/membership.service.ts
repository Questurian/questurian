import type { User } from '@/lib/user/types';

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

export function getMembershipState(user: User | null): MembershipState {
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
          showUpgradeButton: false,
          showReactivateButton: true,
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
