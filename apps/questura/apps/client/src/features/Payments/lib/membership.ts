import type { MembershipStatus, UserWithMembership } from '../types';
import { useDevStore } from '@/lib/stores/devStore';

export function isActiveMember(user: UserWithMembership): boolean {
  if (process.env.NODE_ENV === 'development' && useDevStore.getState().membershipOverride) {
    return true;
  }

  if (user.subscriptionStatus === 'active') {
    return true;
  }

  if (
    (user.subscriptionStatus === 'canceled' || user.subscriptionStatus === 'cancelled') &&
    user.membershipExpiration
  ) {
    const expiration =
      typeof user.membershipExpiration === 'string'
        ? new Date(user.membershipExpiration)
        : user.membershipExpiration;
    return expiration > new Date();
  }

  return false;
}

export function getMembershipStatus(user: UserWithMembership): MembershipStatus {
  const expiration = user.membershipExpiration
    ? typeof user.membershipExpiration === 'string'
      ? new Date(user.membershipExpiration)
      : user.membershipExpiration
    : null;

  const isActive = isActiveMember(user);

  return {
    isPaidMember: isActive,
    membershipExpiration: expiration,
    isActive,
  };
}
