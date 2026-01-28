/**
 * Hook for resetting password with verification code
 */

import { useMutation } from '@tanstack/react-query';
import { post, isServiceUnavailableError } from '@/lib/api';
import type { PasswordResetVerify } from '../types';

interface PasswordResetResponse {
  success: boolean;
  message: string;
  requiresReLogin: boolean;
}

export const usePasswordReset = () => {
  return useMutation<PasswordResetResponse, Error, PasswordResetVerify>({
    mutationFn: async (data) => {
      try {
        const response = await post<PasswordResetResponse>('/api/auth/forgot-password/reset', data as unknown as Record<string, unknown>);

        if (!response.success) {
          throw new Error(response.message || 'Failed to reset password');
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
    }
  });
};
