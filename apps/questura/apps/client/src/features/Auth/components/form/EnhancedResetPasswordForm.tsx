'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useLoginMutation } from '@/lib/user/hooks';
import { useLoginModalStore } from '@/lib/stores/loginModalStore';
import { queryKeys } from '@/lib/react-query';
import { usePasswordResetForm } from '../../hooks/usePasswordResetForm';
import { usePasswordResetRequest, PasswordResetRequestError } from '../../hooks/usePasswordResetRequest';
import { usePasswordResetVerify, VerifyCodeError } from '../../hooks/usePasswordResetVerify';
import { usePasswordReset } from '../../hooks/usePasswordReset';
import AuthFormLayout from './AuthFormLayout';
import ResetPasswordEmailStep from './ResetPasswordEmailStep';
import ResetPasswordVerifyStep from './ResetPasswordVerifyStep';
import type { EnhancedResetPasswordFormProps } from '../../types';

interface EnhancedResetPasswordFormPropsWithSkip extends EnhancedResetPasswordFormProps {
  skipEmailStep?: boolean;
  onStepChange?: (step: number) => void;
}

export default function EnhancedResetPasswordForm({
  onSuccess,
  inModal = false,
  initialStep = 1,
  prefillEmail,
  skipEmailStep = false,
  onStepChange
}: EnhancedResetPasswordFormPropsWithSkip) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const closeLoginModal = useLoginModalStore(state => state.closeLoginModal);
  const hasRequestedCode = useRef(false);

  // Initialize hooks
  const form = usePasswordResetForm(prefillEmail, initialStep);
  const resetRequest = usePasswordResetRequest();
  const resetVerify = usePasswordResetVerify();
  const resetPassword = usePasswordReset();
  const loginMutation = useLoginMutation();

  // Auto-request reset code when opening modal (skipEmailStep=true)
  // Only run once on mount, using ref to prevent infinite loops
  useEffect(() => {
    if (skipEmailStep && prefillEmail && !hasRequestedCode.current) {
      hasRequestedCode.current = true;

      const requestCode = async () => {
        form.setLoading(true);
        try {
          await resetRequest.mutateAsync({ email: prefillEmail });
          // Success - code has been sent, but DON'T advance step
          // User must enter code and click "Next" to advance
          form.setLoading(false);
        } catch (error) {
          let errorMessage = 'Failed to request password reset. Please try again.';

          // Handle NO_LOCAL_PASSWORD error (Google-only user)
          if (error instanceof PasswordResetRequestError) {
            if (error.code === 'NO_LOCAL_PASSWORD') {
              errorMessage = error.message;
            } else {
              errorMessage = error.message || errorMessage;
            }
          } else if (error instanceof Error) {
            errorMessage = error.message;
          }

          form.addGeneralError(errorMessage);
          form.setLoading(false);
        }
      };
      requestCode();
    }
    // Empty dependency array is intentional - run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify parent when step changes
  useEffect(() => {
    if (onStepChange) {
      onStepChange(form.currentStep);
    }
  }, [form.currentStep, onStepChange]);

  // Handle requesting a new verification code (when code is expired/invalid)
  const handleRequestNewCode = async () => {
    form.setLoading(true);
    form.clearErrors();

    try {
      await resetRequest.mutateAsync({ email: form.email });
      // Clear the old code and let user enter new code
      form.handleInputChange({
        target: { name: 'code', value: '' }
      } as React.ChangeEvent<HTMLInputElement>);
    } catch (error) {
      let errorMessage = 'Failed to request a new code. Please try again.';

      // Handle NO_LOCAL_PASSWORD error (Google-only user)
      if (error instanceof PasswordResetRequestError) {
        errorMessage = error.message || errorMessage;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      form.addGeneralError(errorMessage);
    } finally {
      form.setLoading(false);
    }
  };

  // Handle email step submission
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.validateEmailStep()) {
      return;
    }

    form.setLoading(true);
    form.clearErrors();

    try {
      await resetRequest.mutateAsync({ email: form.email });
      // Success - proceed to verification step
      form.proceedToVerifyStep();
    } catch (error) {
      let errorMessage = 'Failed to request password reset. Please try again.';

      // Handle NO_LOCAL_PASSWORD error (Google-only user)
      if (error instanceof PasswordResetRequestError) {
        if (error.code === 'NO_LOCAL_PASSWORD') {
          // Don't proceed to verification step for Google-only users
          errorMessage = error.message;
        } else {
          errorMessage = error.message || errorMessage;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      form.addGeneralError(errorMessage);
    } finally {
      form.setLoading(false);
    }
  };

  // Handle verify step submission - different behavior based on current step
  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Step 1: User entered code - verify with backend and proceed to step 2
    if (form.currentStep === 1) {
      // Validate code format
      if (!form.code) {
        form.setErrors([{ message: 'Verification code is required', field: 'code' }]);
        return;
      }
      if (form.code.length !== 6) {
        form.setErrors([{ message: 'Verification code must be 6 digits', field: 'code' }]);
        return;
      }

      // Call API to verify code
      form.setLoading(true);
      form.clearErrors();

      try {
        await resetVerify.mutateAsync({
          email: form.email,
          code: form.code
        });
        // Code verified successfully - proceed to password step
        form.proceedToVerifyStep();
      } catch (error) {
        // Handle specific error codes from backend
        if (error instanceof VerifyCodeError) {
          switch (error.errorCode) {
            case 'INVALID_REQUEST':
              form.setErrors([{ message: 'Please provide both email and code.', field: 'code' }]);
              break;
            case 'INVALID_CONFIRMATION':
              form.addGeneralError('The code is invalid or has expired. Please request a new code.');
              break;
            case 'INTERNAL_SERVER_ERROR':
              form.addGeneralError('Something went wrong. Please try again.');
              break;
            default:
              form.addGeneralError(error.message || 'Failed to verify code. Please try again.');
          }
        } else {
          const errorMessage = error instanceof Error ? error.message : 'Failed to verify code. Please try again.';
          form.addGeneralError(errorMessage);
        }
      } finally {
        form.setLoading(false);
      }
      return;
    }

    // Step 2: User entered password - validate and submit to backend
    if (form.currentStep === 2) {
      if (!form.validateVerifyStep()) {
        return;
      }

      form.setLoading(true);
      form.clearErrors();

      try {
        await resetPassword.mutateAsync({
          email: form.email,
          code: form.code,
          newPassword: form.newPassword,
          confirmPassword: form.confirmPassword
        });

        // Password reset successful - now auto-login user
        return new Promise<void>((resolve) => {
          loginMutation.mutate(
            {
              email: form.email,
              password: form.newPassword
            },
            {
              onSuccess: async (data) => {
                // Update React Query cache with user data
                queryClient.setQueryData(queryKeys.userMe(), data.user);

                // Close both modals
                closeLoginModal(); // Close LoginModal (the one underneath)
                if (onSuccess) {
                  onSuccess(); // Close PasswordResetModal
                } else {
                  // Redirect to home page
                  router.push('/');
                }
                resolve();
              },
              onError: (error) => {
                // Login failed even though password reset succeeded
                const errorMessage = error instanceof Error ? error.message : 'Failed to log in after password reset.';
                form.addGeneralError(errorMessage);
                form.setLoading(false);
                resolve();
              }
            }
          );
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to reset password. Please try again.';

        // Handle specific error codes
        if (errorMessage.includes('expired') || errorMessage.includes('invalid')) {
          form.addGeneralError('The verification code is invalid or has expired. Please request a new one.');
          form.backToEmailStep();
        } else {
          form.addGeneralError(errorMessage);
        }
      } finally {
        form.setLoading(false);
      }
    }
  };

  // Determine title and subtitle based on current step
  const getTitle = () => {
    // In modal mode, PasswordResetModal handles titles via onStepChange
    if (skipEmailStep) {
      return '';
    }

    if (form.currentStep === 1) {
      return 'Reset Password';
    }
    return 'Verify and Reset';
  };

  const getSubtitle = () => {
    // In modal mode, PasswordResetModal handles subtitles via onStepChange
    if (skipEmailStep) {
      return '';
    }

    if (form.currentStep === 1) {
      return 'Enter your email to receive a password reset code';
    }
    return `We've sent a code to ${form.email}. Enter it along with your new password.`;
  };

  return (
    <AuthFormLayout
      inModal={inModal}
      title={getTitle()}
      subtitle={getSubtitle()}
      generalErrors={form.getGeneralErrors()}
      isSignUp={false}
    >
      {skipEmailStep ? (
        // Modal mode: show verify step with currentStep to control visible fields
        <ResetPasswordVerifyStep
          email={form.email}
          code={form.code}
          newPassword={form.newPassword}
          confirmPassword={form.confirmPassword}
          onChange={form.handleInputChange}
          onSubmit={handleVerifySubmit}
          onBackToEmail={form.backToEmailStep}
          fieldError={form.getFieldError('code') || form.getFieldError('newPassword') || form.getFieldError('confirmPassword')}
          loading={form.loading}
          showPassword={form.showPassword}
          onTogglePassword={() => form.setShowPassword(!form.showPassword)}
          inModal={inModal}
          generalError={undefined}
          currentStep={form.currentStep}
          onRequestNewCode={handleRequestNewCode}
        />
      ) : (
        // Page mode: show email step first, then verify step
        form.currentStep === 1 ? (
          <ResetPasswordEmailStep
            email={form.email}
            onChange={form.handleInputChange}
            onSubmit={handleEmailSubmit}
            fieldError={form.getFieldError('email')}
            loading={form.loading}
            inModal={inModal}
            generalError={undefined}
          />
        ) : (
          <ResetPasswordVerifyStep
            email={form.email}
            code={form.code}
            newPassword={form.newPassword}
            confirmPassword={form.confirmPassword}
            onChange={form.handleInputChange}
            onSubmit={handleVerifySubmit}
            onBackToEmail={form.backToEmailStep}
            fieldError={form.getFieldError('code') || form.getFieldError('newPassword') || form.getFieldError('confirmPassword')}
            loading={form.loading}
            showPassword={form.showPassword}
            onTogglePassword={() => form.setShowPassword(!form.showPassword)}
            inModal={inModal}
            generalError={undefined}
            currentStep={form.currentStep}
            onRequestNewCode={handleRequestNewCode}
          />
        )
      )}
    </AuthFormLayout>
  );
}
