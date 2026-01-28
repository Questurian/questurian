import { useMemo } from 'react';
import { isActiveMember, getMembershipStatus } from '../lib/membership';
import type { User } from '@/lib/user/types';
import type { MembershipStatus } from '../types';

export function useMembership(user?: User | null) {
  const membershipStatus = useMemo((): MembershipStatus => {
    if (!user) {
      return {
        isPaidMember: false,
        membershipExpiration: null,
        isActive: false
      };
    }
    
    return getMembershipStatus(user);
  }, [user]);

  const isActive = useMemo(() => {
    return user ? isActiveMember(user) : false;
  }, [user]);

  return {
    ...membershipStatus,
    isActive,
    hasValidMembership: isActive
  };
}