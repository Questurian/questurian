import { useQuery } from '@tanstack/react-query';

import { get } from '@/lib/api';
import { queryKeys } from '@/lib/react-query';
import type { AuthMethods } from '@/lib/user/types';

/**
 * How the signed-in reader signs in: password, Google, or both. Only the
 * account screens need this, so it is its own request
 * (`/api/account/auth-methods`) rather than a cost every `/api/me` pays.
 * Invalidate `queryKeys.authMethods()` after anything that adds or removes a
 * sign-in method.
 */
export function useAuthMethods(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.authMethods(),
    queryFn: () => get<AuthMethods>('/api/account/auth-methods'),
    enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
