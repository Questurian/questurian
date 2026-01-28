/**
 * Email change mutation hooks
 * Handles the multi-step email change process
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post, isServiceUnavailableError } from '@/lib/api';
import { queryKeys } from '@/lib/react-query';

/**
 * Verify password mutation (step 1)
 */
interface VerifyPasswordVariables {
  password: string;
}

interface VerifyPasswordResponse {
  success: boolean;
  error?: string;
}

export function useVerifyPasswordMutation() {
  return useMutation({
    mutationFn: async (variables: VerifyPasswordVariables): Promise<VerifyPasswordResponse> => {
      try {
        const response = await post<VerifyPasswordResponse>('/api/auth/verify-password', {
          password: variables.password,
        });

        if (!response.success) {
          throw new Error(response.error || 'Failed to verify password');
        }

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
  });
}

/**
 * Request email change mutation (step 2)
 */
interface RequestEmailChangeVariables {
  newEmail: string;
}

interface RequestEmailChangeResponse {
  success: boolean;
  message: string;
  expiresIn: string;
  willUnlinkGoogle: boolean;
}

export function useRequestEmailChangeMutation() {
  return useMutation({
    mutationFn: async (variables: RequestEmailChangeVariables): Promise<RequestEmailChangeResponse> => {
      try {
        const response = await post<RequestEmailChangeResponse>('/api/auth/request-email-change', {
          newEmail: variables.newEmail,
        });

        if (!response.success) {
          throw new Error(response.message || 'Failed to request email change');
        }

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
  });
}

/**
 * Confirm email change mutation (step 3)
 */
interface ConfirmEmailChangeVariables {
  code: string;
}

interface ConfirmEmailChangeResponse {
  success: boolean;
  message: string;
  wasGoogleUnlinked: boolean;
  newEmail: string;
  requiresReLogin: boolean;
}

export function useConfirmEmailChangeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: ConfirmEmailChangeVariables): Promise<ConfirmEmailChangeResponse> => {
      try {
        const response = await post<ConfirmEmailChangeResponse>('/api/auth/confirm-email-change', {
          code: variables.code,
        });

        if (!response.success) {
          throw new Error(response.message || 'Failed to confirm email change');
        }

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
      // Cookie is automatically cleared by backend (user must re-login with new email)
      // Clear user-related queries to force re-authentication
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}
