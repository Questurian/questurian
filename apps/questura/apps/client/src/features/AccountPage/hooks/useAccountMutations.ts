/**
 * Account management mutation hooks
 * Handles password, Google OAuth linking/unlinking
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query';
import { post, isServiceUnavailableError } from '@/lib/api';

/**
 * Add password mutation (for OAuth-only users)
 */
interface AddPasswordVariables {
  password: string;
  confirmPassword: string;
}

interface AddPasswordResponse {
  success: boolean;
  message?: string;
}

export function useAddPasswordMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: AddPasswordVariables): Promise<AddPasswordResponse> => {
      try {
        const response = post<AddPasswordResponse>('/api/account/add-password', {
          password: variables.password,
          confirmPassword: variables.confirmPassword,
        });
        return response;
      } catch (error) {
        // Check if it's a service unavailability error and throw clean message
        if (isServiceUnavailableError(error)) {
          throw new Error('Service is unavailable. Please try again later.');
        }

        // For other errors, ensure we're throwing a clean Error object
        if (error instanceof Error) {
          throw error;
        }

        // If it's not an Error object, wrap it
        throw new Error(String(error));
      }
    },
    onSuccess: () => {
      // Invalidate user query to refetch updated auth methods
      queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });
    },
  });
}

/**
 * Remove password mutation
 */
interface RemovePasswordResponse {
  success: boolean;
  message?: string;
}

export function useRemovePasswordMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<RemovePasswordResponse> => {
      try {
        return post<RemovePasswordResponse>('/api/account/remove-password', {
          confirmation: 'REMOVE_PASSWORD',
        });
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
      // Invalidate user query to refetch updated auth methods
      queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });
    },
  });
}

/**
 * Link Google account mutation
 */
interface LinkGoogleResponse {
  authUrl?: string;
  success?: boolean;
}

export function useLinkGoogleMutation() {
  return useMutation({
    mutationFn: async (): Promise<LinkGoogleResponse> => {
      try {
        return post<LinkGoogleResponse>('/api/account/link-google', {});
      } catch (error) {
        // Check if it's a service unavailability error
        if (isServiceUnavailableError(error)) {
          throw new Error('Service is unavailable. Please try again later.');
        }

        // Re-throw other errors
        throw error;
      }
    },
    // Note: Don't invalidate here - let the popup callback handle it
    // User data will be refetched after popup completes
  });
}

/**
 * Unlink Google account mutation
 */
interface UnlinkGoogleResponse {
  success: boolean;
  message?: string;
}

export function useUnlinkGoogleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<UnlinkGoogleResponse> => {
      try {
        return post<UnlinkGoogleResponse>('/api/account/unlink-google', {
          confirmation: 'UNLINK_GOOGLE',
        });
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
      // Invalidate user query to refetch updated auth methods
      queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });
    },
  });
}

/**
 * Request password change mutation
 */
export function useRequestPasswordChangeMutation() {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      try {
        await post('/api/auth/request-password-change', {});
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
 * Check if user can disconnect auth method
 */
interface CanDisconnectVariables {
  method: 'password' | 'google';
}

interface CanDisconnectResponse {
  canDisconnect: boolean;
  reason?: string;
}

export function useCanDisconnectQuery() {
  return useMutation({
    mutationFn: async (variables: CanDisconnectVariables): Promise<CanDisconnectResponse> => {
      try {
        return post<CanDisconnectResponse>('/api/account/can-disconnect', {
          method: variables.method,
        });
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
