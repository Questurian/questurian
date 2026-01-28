/**
 * Hook for handling authentication submission (sign in/up)
 */

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useLoginMutation, useSignupMutation } from '@/lib/user/hooks';
import { queryKeys } from '@/lib/react-query';
import { getSafeRedirectPath } from '@/lib/validations';
import type { AuthFormData, UseAuthSubmitOptions, SignUpResult } from '../types';

export const useAuthSubmit = ({ inModal = false, onSuccess }: UseAuthSubmitOptions) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const loginMutation = useLoginMutation();
  const signupMutation = useSignupMutation();

  const attemptSignIn = async (formData: AuthFormData): Promise<{ success: boolean; errors?: Array<{ message: string }> }> => {
    return new Promise((resolve) => {
      loginMutation.mutate(
        {
          email: formData.email,
          password: formData.password,
        },
        {
          onSuccess: async (data) => {
            console.log('[useAuthSubmit] Login successful, user:', data.user.email);
            // Set React Query cache with user data from login response
            // User object contains all subscription/membership data needed
            queryClient.setQueryData(queryKeys.userMe(), data.user);

            if (inModal) {
              // Modal context - just call success callback
              onSuccess?.();
            } else {
              // Page context - navigate to home or redirect path
              const urlParams = new URLSearchParams(window.location.search);
              const redirect = urlParams.get('redirect');
              const redirectPath = getSafeRedirectPath(redirect);
              router.push(redirectPath);
            }
            resolve({ success: true });
          },
          onError: (error) => {
            // Extract error message from mutation, matching signup behavior
            const errorMessage = error instanceof Error ? error.message : 'Sign in failed. Please try again.';
            resolve({
              success: false,
              errors: [{ message: errorMessage }]
            });
          },
        }
      );
    });
  };

  const attemptSignUp = async (formData: AuthFormData): Promise<SignUpResult> => {
    return new Promise((resolve) => {
      signupMutation.mutate(
        {
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
        },
        {
          onSuccess: async (data) => {
            // Check if email verification is required
            if (data.requiresVerification) {
              resolve({
                success: false,
                errors: [{
                  message: data.message || 'Account created! Please check your email for verification code.',
                }]
              });
              return;
            }

            // If user is present, authentication is complete
            // Cookie is automatically set by backend
            if (data.user) {
              console.log('[useAuthSubmit] Signup successful, user:', data.user.email);
              // Set React Query cache with user data from signup response
              // User object contains all subscription/membership data needed
              queryClient.setQueryData(queryKeys.userMe(), data.user);

              if (inModal) {
                // Modal context - just call success callback
                onSuccess?.();
              } else {
                // Page context - navigate to home or redirect path
                const urlParams = new URLSearchParams(window.location.search);
                const redirect = urlParams.get('redirect');
                const redirectPath = getSafeRedirectPath(redirect);
                router.push(redirectPath);
              }
              resolve({ success: true });
              return;
            }

            resolve({ success: false });
          },
          onError: (error) => {
            // Handle errors from mutation
            const errorMessage = error instanceof Error ? error.message : 'Sign up failed. Please try again.';
            resolve({
              success: false,
              errors: [{ message: errorMessage }]
            });
          },
        }
      );
    });
  };

  return {
    attemptSignIn,
    attemptSignUp
  };
};
