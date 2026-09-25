import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/react-query';
import { identityStore } from '@/lib/user/currentIdentity';
import type { User } from '@/lib/user/types';

import type { UserMutationContext } from '../types/subscription-mutations.types';

export async function applyCancelAtPeriodEndOptimisticUpdate(
  queryClient: QueryClient,
  cancelAtPeriodEnd: boolean
): Promise<UserMutationContext> {
  await queryClient.cancelQueries({ queryKey: queryKeys.userMe() });

  const previousUser = queryClient.getQueryData<User | null>(queryKeys.userMe());

  if (previousUser) {
    queryClient.setQueryData<User | null>(queryKeys.userMe(), (old) => {
      if (!old) return old;
      return {
        ...old,
        cancelAtPeriodEnd,
      };
    });
  }

  return { previousUser };
}

export function rollbackUserMutation(
  queryClient: QueryClient,
  context?: UserMutationContext
): void {
  if (context?.previousUser) {
    queryClient.setQueryData(queryKeys.userMe(), context.previousUser);
  }
}

/**
 * Re-ask the server who the reader is, after something changed their
 * membership. The identity store reuses a recent `/api/me` answer, so without
 * `expire()` the refetch could return the answer the page loaded with and put
 * a just-cancelled membership back to "renews on" (launch fix plan item 8).
 */
export function invalidateUser(queryClient: QueryClient): void {
  identityStore.expire();
  queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });
}

/** @deprecated Use {@link invalidateUser}; kept for the checkout call site's readability. */
export const invalidateUserAfterCheckout = invalidateUser;
