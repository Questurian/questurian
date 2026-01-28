import type { MembershipStatus, UserWithMembership } from '../types';

export function isActiveMember(user: UserWithMembership): boolean {
  if (!user.isPaidMember) {
    return false;
  }

  if (!user.membershipExpiration) {
    return false;
  }

  const expirationDate = typeof user.membershipExpiration === 'string' 
    ? new Date(user.membershipExpiration)
    : user.membershipExpiration;

  return expirationDate > new Date();
}

export function getMembershipStatus(user: UserWithMembership): MembershipStatus {
  const isPaid = !!user.isPaidMember;
  const expiration = user.membershipExpiration 
    ? (typeof user.membershipExpiration === 'string' 
        ? new Date(user.membershipExpiration)
        : user.membershipExpiration)
    : null;

  return {
    isPaidMember: isPaid,
    membershipExpiration: expiration,
    isActive: isActiveMember(user)
  };
}