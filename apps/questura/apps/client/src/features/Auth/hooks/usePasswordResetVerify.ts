/**
 * Hook for verifying password reset code
 */

import { useMutation } from '@tanstack/react-query';
import { post, isServiceUnavailableError } from '@/lib/api';

interface VerifyCodeRequest {
  email: string;
  code: string;
}

interface VerifyCodeResponse {
  success: boolean;
  message: string;
  code?: string; // Error code from backend
}

// Custom error class to include error code
export class VerifyCodeError extends Error {
  constructor(
    message: string,
    public errorCode?: string
  ) {
    super(message);
    this.name = 'VerifyCodeError';
  }
}

export const usePasswordResetVerify = () => {
  return useMutation<VerifyCodeResponse, VerifyCodeError, VerifyCodeRequest>({
    mutationFn: async (data) => {
      try {
        const response = await post<VerifyCodeResponse>('/api/auth/forgot-password/verify-code', data as unknown as Record<string, unknown>);

        if (!response.success) {
          throw new VerifyCodeError(
            response.message || 'Failed to verify code',
            response.code
          );
        }

        return response;
      } catch (error) {
        // Check if it's a service unavailability error
        if (error instanceof VerifyCodeError) {
          throw error;
        }

        if (isServiceUnavailableError(error)) {
          throw new VerifyCodeError(
            'Service is unavailable. Please try again later.',
            'SERVICE_UNAVAILABLE'
          );
        }

        // Re-throw other errors
        throw error;
      }
    }
  });
};
