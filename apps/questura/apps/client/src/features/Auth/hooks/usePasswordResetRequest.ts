/**
 * Hook for requesting a password reset code
 */

import { useMutation } from '@tanstack/react-query';
import { apiRequest, isServiceUnavailableError } from '@/lib/api';
import type { PasswordResetRequest } from '../types';

interface PasswordResetRequestResponse {
  success?: boolean;
  message: string;
  expiresIn?: string;
  code?: string;
  details?: string;
}

export class PasswordResetRequestError extends Error {
  public code?: string;
  public details?: string;

  constructor(message: string, code?: string, details?: string) {
    super(message);
    this.name = 'PasswordResetRequestError';
    this.code = code;
    this.details = details;
  }
}

export const usePasswordResetRequest = () => {
  return useMutation<PasswordResetRequestResponse, PasswordResetRequestError, PasswordResetRequest>({
    mutationFn: async (data) => {
      try {
        const response = await apiRequest<PasswordResetRequestResponse>(
          '/api/auth/forgot-password/request',
          {
            method: 'POST',
            body: JSON.stringify(data),
            credentials: 'include',
          }
        );

        if (!response.success) {
          throw new PasswordResetRequestError(
            response.message || 'Failed to request password reset',
            response.code,
            response.details
          );
        }

        return response;
      } catch (error) {
        // If it's already our custom error, re-throw it
        if (error instanceof PasswordResetRequestError) {
          throw error;
        }

        // If it's a generic error, check if it contains error details
        if (error instanceof Error) {
          // Check if it's a service unavailability error
          if (isServiceUnavailableError(error)) {
            throw new PasswordResetRequestError(
              'Service is unavailable. Please try again later.',
              'SERVICE_UNAVAILABLE',
              undefined
            );
          }

          // Try to parse error message as JSON to extract code and details
          try {
            // The error message might contain JSON from the API response
            const message = error.message;
            if (message.includes('NO_LOCAL_PASSWORD')) {
              throw new PasswordResetRequestError(
                'Please add a password to your account first.',
                'NO_LOCAL_PASSWORD',
                undefined
              );
            }
            throw new PasswordResetRequestError(message, undefined, undefined);
          } catch (parseError) {
            if (parseError instanceof PasswordResetRequestError) {
              throw parseError;
            }
            throw new PasswordResetRequestError(error.message, undefined, undefined);
          }
        }

        throw new PasswordResetRequestError('Failed to request password reset', undefined, undefined);
      }
    }
  });
};
