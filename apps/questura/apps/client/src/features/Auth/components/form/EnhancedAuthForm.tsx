"use client";

import { validateEmail, getFormTitle, getFormSubtitle } from '../../lib/auth-utils';
import { useAuthForm } from '../../hooks/useAuthForm';
import { useAccountCheck } from '../../hooks/useAccountCheck';
import { useAuthSubmit } from '../../hooks/useAuthSubmit';
import { isServiceUnavailableError } from '@/lib/api';
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
  const accountCheck = useAccountCheck(prefillEmail);
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

    authForm.setErrors([]); // Clear any previous errors before checking
    const result = await accountCheck.checkUserAccount(authForm.formData.email);
    if (result?.status) {
      authForm.proceedToPasswordStep(result.status);
    } else if (result?.error) {
      // Show service error if account check failed
      authForm.setErrors([{ message: result.error }]);
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
          onChange={authForm.handleInputChange}
          onSubmit={handleEmailContinue}
          fieldError={authForm.getFieldError('email')}
          loading={authForm.loading}
          checkingAccount={accountCheck.checkingAccount}
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
            accountCheck.setUserAccountStatus(null);
          }}
          fieldError={authForm.getFieldError('password')}
          loading={authForm.loading}
          isSignUp={authForm.isSignUp}
          showPassword={authForm.showPassword}
          onTogglePassword={() => authForm.setShowPassword(!authForm.showPassword)}
          userAccountStatus={accountCheck.userAccountStatus}
          inModal={inModal}
          errorMessage={errorMessage}
        />
      )}
    </AuthFormLayout>
  );
}
