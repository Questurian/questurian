/**
 * Email change mutation hooks
 * Handles the multi-step email change process
 */

import { useMutation } from '@tanstack/react-query';
import { post, isServiceUnavailableError } from '@/lib/api';

/**
 * Verify password mutation (step 1)
 */
interface VerifyPasswordVariables {
  password: string;
}

interface VerifyPasswordResponse {
  success?: boolean;
  status?: boolean;
  error?: string;
}

export function useVerifyPasswordMutation() {
  return useMutation({
    mutationFn: async (variables: VerifyPasswordVariables): Promise<VerifyPasswordResponse> => {
      try {
        const response = await post<VerifyPasswordResponse>('/api/visitor-auth/verify-password', {
          password: variables.password,
        });

        const success = response.success ?? response.status ?? false;
        if (!success) {
          throw new Error(response.error || 'Failed to verify password');
        }

        return { ...response, success };
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
  success?: boolean;
  status?: boolean;
  message?: string;
  expiresIn?: string;
}

export function useRequestEmailChangeMutation() {
  return useMutation({
    mutationFn: async (variables: RequestEmailChangeVariables): Promise<RequestEmailChangeResponse> => {
      try {
        const callbackURL = new URL('/account/email-changed-success', window.location.origin);
        callbackURL.searchParams.set('newEmail', variables.newEmail);
        const response = await post<RequestEmailChangeResponse>('/api/visitor-auth/change-email', {
          newEmail: variables.newEmail,
          callbackURL: callbackURL.toString(),
        });

        const success = response.success ?? response.status ?? false;
        if (!success) {
          throw new Error(response.message || 'Failed to request email change');
        }

        return {
          ...response,
          success,
          message: response.message ?? 'Verification email sent. Follow the link in that email to finish changing your address.',
        };
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
