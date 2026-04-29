import { useMemo } from 'react';
import { isActiveMember, getMembershipStatus } from '../lib/membership';
import type { User } from '@/lib/user/types';
import type { MembershipStatus } from '../types';
import { useDevStore } from '@/lib/stores/devStore';

export function useMembership(user?: User | null) {
  const membershipOverride = useDevStore((s) => s.membershipOverride);

  const membershipStatus = useMemo((): MembershipStatus => {
    if (!user) {
      return {
        isPaidMember: false,
        membershipExpiration: null,
        isActive: false
      };
    }

    return getMembershipStatus(user);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, membershipOverride]);

  const isActive = useMemo(() => {
    return user ? isActiveMember(user) : false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, membershipOverride]);

  return {
    ...membershipStatus,
    isActive,
    hasValidMembership: isActive
  };
}