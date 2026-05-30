/**
 * Password change mutation hooks
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query';
import { post, isServiceUnavailableError } from '@/lib/api';

/**
 * Simple password change mutation (new simplified flow)
 * Single step: verify current password and set new password
 */
interface ChangePasswordVariables {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

interface ChangePasswordResponse {
  token: string | null;
}

export function useChangePasswordMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: ChangePasswordVariables): Promise<ChangePasswordResponse> => {
      try {
        const response = await post<ChangePasswordResponse>('/api/visitor-auth/change-password', {
          currentPassword: variables.currentPassword,
          newPassword: variables.newPassword,
          revokeOtherSessions: true,
        });

        return response;
      } catch (error) {
        // Check if it's a service unavailability error
        if (isServiceUnavailableError(error)) {
          throw new Error('Service is unavailable. Please try again later.');
        }

        // Re-throw other errors
        throw error;
      }
    },
    onSuccess: () => {
      // Cookie is automatically updated by backend
      // Invalidate user query to refetch with new session
      queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });
    },
  });
}
