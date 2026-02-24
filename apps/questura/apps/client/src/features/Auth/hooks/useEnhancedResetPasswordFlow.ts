import { useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { useLoginMutation } from '@/lib/user/hooks';
import { useLoginModalStore } from '@/lib/stores/loginModalStore';

import { usePasswordResetForm } from './usePasswordResetForm';
import { usePasswordReset } from './usePasswordReset';
import { usePasswordResetRequest } from './usePasswordResetRequest';
import { usePasswordResetVerify } from './usePasswordResetVerify';
import {
  mapAutoLoginError,
  mapRequestResetError,
  mapResetPasswordError,
  mapVerifyCodeError,
  shouldReturnToEmailStep,
} from '../lib/reset-password-error-mapper';
import {
  autoLoginAfterPasswordReset,
  requestPasswordResetCode,
  submitPasswordReset,
  verifyPasswordResetCode,
} from '../services/reset-password-flow.service';
import type { EnhancedResetPasswordFormPropsWithSkip } from '../types/reset-password-flow.types';

export function useEnhancedResetPasswordFlow({
  onSuccess,
  inModal = false,
  initialStep = 1,
  prefillEmail,
  skipEmailStep = false,
  onStepChange,
}: EnhancedResetPasswordFormPropsWithSkip) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const closeLoginModal = useLoginModalStore((state) => state.closeLoginModal);
  const hasRequestedCode = useRef(false);

  const form = usePasswordResetForm(prefillEmail, initialStep);
  const resetRequest = usePasswordResetRequest();
  const resetVerify = usePasswordResetVerify();
  const resetPassword = usePasswordReset();
  const loginMutation = useLoginMutation();

  useEffect(() => {
    if (skipEmailStep && prefillEmail && !hasRequestedCode.current) {
      hasRequestedCode.current = true;

      const requestCode = async () => {
        form.setLoading(true);

        try {
          await requestPasswordResetCode(resetRequest, prefillEmail);
          form.setLoading(false);
        } catch (error) {
          const errorMessage = mapRequestResetError(error, 'Failed to request password reset. Please try again.', {
            supportNoLocalPassword: true,
          });
          form.addGeneralError(errorMessage);
          form.setLoading(false);
        }
      };

      requestCode();
    }
    // Empty dependency array is intentional - run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (onStepChange) {
      onStepChange(form.currentStep);
    }
  }, [form.currentStep, onStepChange]);

  const handleRequestNewCode = async () => {
    form.setLoading(true);
    form.clearErrors();

    try {
      await requestPasswordResetCode(resetRequest, form.email);
      form.handleInputChange({
        target: { name: 'code', value: '' },
      } as ChangeEvent<HTMLInputElement>);
    } catch (error) {
      form.addGeneralError(mapRequestResetError(error, 'Failed to request a new code. Please try again.'));
    } finally {
      form.setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.validateEmailStep()) {
      return;
    }

    form.setLoading(true);
    form.clearErrors();

    try {
      await requestPasswordResetCode(resetRequest, form.email);
      form.proceedToVerifyStep();
    } catch (error) {
      const errorMessage = mapRequestResetError(error, 'Failed to request password reset. Please try again.', {
        supportNoLocalPassword: true,
      });
      form.addGeneralError(errorMessage);
    } finally {
      form.setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (form.currentStep === 1) {
      if (!form.code) {
        form.setErrors([{ message: 'Verification code is required', field: 'code' }]);
        return;
      }

      if (form.code.length !== 6) {
        form.setErrors([{ message: 'Verification code must be 6 digits', field: 'code' }]);
        return;
      }

      form.setLoading(true);
      form.clearErrors();

      try {
        await verifyPasswordResetCode(resetVerify, form.email, form.code);
        form.proceedToVerifyStep();
      } catch (error) {
        const verifyError = mapVerifyCodeError(error);

        if (verifyError.fieldError) {
          form.setErrors([{ message: verifyError.fieldError, field: 'code' }]);
        }

        if (verifyError.generalError) {
          form.addGeneralError(verifyError.generalError);
        }
      } finally {
        form.setLoading(false);
      }

      return;
    }

    if (form.currentStep === 2) {
      if (!form.validateVerifyStep()) {
        return;
      }

      form.setLoading(true);
      form.clearErrors();

      try {
        await submitPasswordReset(resetPassword, {
          email: form.email,
          code: form.code,
          newPassword: form.newPassword,
          confirmPassword: form.confirmPassword,
        });

        await autoLoginAfterPasswordReset({
          email: form.email,
          password: form.newPassword,
          loginMutation,
          queryClient,
          closeLoginModal,
          onSuccess,
          redirectToHome: () => router.push('/'),
          onError: (error) => {
            form.addGeneralError(mapAutoLoginError(error));
            form.setLoading(false);
          },
        });
      } catch (error) {
        const errorMessage = mapResetPasswordError(error);

        if (shouldReturnToEmailStep(errorMessage)) {
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

  return {
    inModal,
    skipEmailStep,
    currentStep: form.currentStep,
    email: form.email,
    code: form.code,
    newPassword: form.newPassword,
    confirmPassword: form.confirmPassword,
    loading: form.loading,
    showPassword: form.showPassword,
    generalErrors: form.getGeneralErrors(),
    fieldError:
      form.getFieldError('email') ||
      form.getFieldError('code') ||
      form.getFieldError('newPassword') ||
      form.getFieldError('confirmPassword'),
    onChange: form.handleInputChange,
    onEmailSubmit: handleEmailSubmit,
    onVerifySubmit: handleVerifySubmit,
    onBackToEmail: form.backToEmailStep,
    onTogglePassword: () => form.setShowPassword(!form.showPassword),
    onRequestNewCode: handleRequestNewCode,
  };
}
