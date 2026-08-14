import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/react-query';
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

export function invalidateUser(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });
}

/** @deprecated Use {@link invalidateUser}; kept for the checkout call site's readability. */
export const invalidateUserAfterCheckout = invalidateUser;
