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
  success?: boolean;
  status?: boolean;
  message?: string;
}

export function useAddPasswordMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: AddPasswordVariables): Promise<AddPasswordResponse> => {
      try {
        const response = await post<AddPasswordResponse>('/api/account/set-password', {
          newPassword: variables.password,
        });
        return {
          ...response,
          success: response.success ?? response.status ?? true,
        };
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
 * Link Google account mutation
 */
interface LinkGoogleResponse {
  authUrl?: string;
  url?: string;
  redirect?: boolean;
  success?: boolean;
}

export function useLinkGoogleMutation() {
  return useMutation({
    mutationFn: async (): Promise<LinkGoogleResponse> => {
      try {
        const callbackURL = new URL('/auth-callback-close?linked=google', window.location.origin).toString();
        const errorCallbackURL = new URL('/auth-callback-close', window.location.origin).toString();
        const response = await post<LinkGoogleResponse>('/api/visitor-auth/link-social', {
          provider: 'google',
          callbackURL,
          errorCallbackURL,
        });
        return {
          ...response,
          authUrl: response.authUrl ?? response.url,
          success: response.success ?? Boolean(response.url),
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
    // Note: Don't invalidate here - let the popup callback handle it
    // User data will be refetched after popup completes
  });
}

/**
 * Unlink Google account mutation
 */
interface UnlinkGoogleResponse {
  success?: boolean;
  status?: boolean;
  message?: string;
}

export function useUnlinkGoogleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<UnlinkGoogleResponse> => {
      try {
        const response = await post<UnlinkGoogleResponse>('/api/visitor-auth/unlink-account', {
          providerId: 'google',
        });
        return {
          ...response,
          success: response.success ?? response.status ?? true,
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
    onSuccess: () => {
      // Invalidate user query to refetch updated auth methods
      queryClient.invalidateQueries({ queryKey: queryKeys.userMe() });
    },
  });
}
