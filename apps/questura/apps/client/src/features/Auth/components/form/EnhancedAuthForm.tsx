"use client";

import { validateEmail, getFormTitle, getFormSubtitle } from '../../lib/auth-utils';
import { useAuthForm } from '../../hooks/useAuthForm';
import { useAuthSubmit } from '../../hooks/useAuthSubmit';
import { isServiceUnavailableError, post } from '@/lib/api';
import AuthFormLayout from './AuthFormLayout';
import EmailStep from './EmailStep';
import PasswordStep from './PasswordStep';
import type { EnhancedAuthFormProps } from '../../types';

export default function EnhancedAuthForm({
  onSuccess,
  inModal = false,
  title,
  subtitle,
  errorMessage,
  prefillEmail,
  onModeChange
}: EnhancedAuthFormProps = {}) {
  // Initialize hooks
  const authForm = useAuthForm({ prefillEmail, onModeChange });
  const authSubmit = useAuthSubmit({ inModal, onSuccess });

  // Handle email step submission
  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!authForm.formData.email) {
      authForm.setErrors([{ message: 'Email is required', field: 'email' }]);
      return;
    }

    if (!validateEmail(authForm.formData.email)) {
      authForm.setErrors([{ message: 'Please enter a valid email address', field: 'email' }]);
      return;
    }

    authForm.setErrors([]);

    // Detect whether the account already exists so we route to sign-in vs sign-up
    // automatically (restores the pre-rewrite behavior). If the check is
    // unavailable, fall back to the manually-selected tab rather than blocking.
    authForm.setLoading(true);
    try {
      const result = await post<{ exists?: boolean }>('/api/user/check', {
        email: authForm.formData.email,
      });
      authForm.proceedToPasswordStep(typeof result.exists === 'boolean' ? result.exists : undefined);
    } catch (error) {
      if (isServiceUnavailableError(error)) {
        authForm.setErrors([{ message: 'Service is unavailable. Please try again later.' }]);
        return;
      }
      // Non-service errors: proceed using the currently-selected tab.
      authForm.proceedToPasswordStep();
    } finally {
      authForm.setLoading(false);
    }
  };

  // Handle password step submission
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!authForm.validateForm()) {
      return;
    }

    authForm.setLoading(true);
    authForm.setErrors([]);

    try {
      if (authForm.isSignUp) {
        // User doesn't exist, attempt signup
        const result = await authSubmit.attemptSignUp(authForm.formData);
        if (!result.success && result.errors) {
          authForm.setErrors(result.errors);
        }
      } else {
        // User exists, attempt signin
        const result = await authSubmit.attemptSignIn(authForm.formData);
        if (!result.success && result.errors) {
          authForm.setErrors(result.errors);
        }
      }
    } catch (error) {
      console.error('Auth error:', error);

      // Detect if this is a service unavailability error
      if (isServiceUnavailableError(error)) {
        authForm.setErrors([{ message: 'Service is unavailable. Please try again later.' }]);
      } else {
        authForm.setErrors([{ message: 'Network error. Please check your connection and try again.' }]);
      }
    } finally {
      authForm.setLoading(false);
    }
  };

  // Determine title and subtitle
  const displayTitle = getFormTitle(authForm.showPasswordStep, authForm.isSignUp, title);
  const displaySubtitle = getFormSubtitle(authForm.showPasswordStep, authForm.isSignUp, subtitle);

  return (
    <AuthFormLayout
      inModal={inModal}
      title={displayTitle}
      subtitle={displaySubtitle}
      generalErrors={authForm.getGeneralErrors()}
      isSignUp={authForm.isSignUp}
    >
      {!authForm.showPasswordStep ? (
        <EmailStep
          email={authForm.formData.email}
          isSignUp={authForm.isSignUp}
          onChange={authForm.handleInputChange}
          onModeChange={authForm.setIsSignUp}
          onSubmit={handleEmailContinue}
          fieldError={authForm.getFieldError('email')}
          loading={authForm.loading}
          canContinue={authForm.canContinueFromEmail()}
          inModal={inModal}
          errorMessage={errorMessage}
        />
      ) : (
        <PasswordStep
          email={authForm.formData.email}
          password={authForm.formData.password}
          onChange={authForm.handleInputChange}
          onSubmit={handlePasswordSubmit}
          onBackToEmail={() => {
            authForm.handleBackToEmail();
          }}
          fieldError={authForm.getFieldError('password')}
          loading={authForm.loading}
          isSignUp={authForm.isSignUp}
          showPassword={authForm.showPassword}
          onTogglePassword={() => authForm.setShowPassword(!authForm.showPassword)}
          inModal={inModal}
          errorMessage={errorMessage}
        />
      )}
    </AuthFormLayout>
  );
}
